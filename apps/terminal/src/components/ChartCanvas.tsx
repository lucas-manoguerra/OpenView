import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Candle } from '@openview/market-domain';
import type { CandleInterval } from '@openview/market-data';
import {
  attachCanvasPointerEvents,
  type CanvasDrawingGesture,
  type CanvasDrawingTool,
  attachCanvasResizeObserver,
  createChartFrame,
  createChartInteractionController,
  createChartRenderScene,
  createCanvasRenderer,
  calculateExponentialMovingAverage,
  calculateSimpleMovingAverage,
  countAppendedBars,
  getRightOffsetAfterDataUpdate,
  updateChartRenderScene,
  type CanvasPointerAdapter,
  type CanvasResize,
  type CanvasResizeAdapter,
  type ChartInteractionController,
  type ChartInteractionSnapshot,
  type ChartRenderCandle,
  type ChartRenderScene,
  type ChartType,
  type ChartIndicatorSeries,
  type ChartRenderDrawing,
  type NumericRange,
  type PriceScaleMode,
} from '@openview/chart-engine';

type ChartCanvasProps = Readonly<{
  candles: readonly Candle[];
  symbol: string;
  interval: CandleInterval;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNeedMoreHistory: () => void;
}>;

type ChartRuntime = Readonly<{
  updateCandles(candles: readonly ChartRenderCandle[], mode: PriceScaleMode): void;
  setPriceScaleMode(mode: PriceScaleMode): void;
  setChartType(chartType: ChartType): void;
  fitContent(mode: PriceScaleMode): void;
  fitPriceScale(): void;
  scrollTimeByBars(bars: number): void;
  setRightOffset(offset: number): void;
  scrollToRealtime(): void;
  zoomTime(factor: number): void;
  setPriceScaleLocked(locked: boolean): void;
  invertPriceScale(): void;
  setIndicators(indicators: readonly ChartIndicatorSeries[]): void;
  setDrawings(drawings: readonly ChartRenderDrawing[]): void;
  destroy(): void;
}>;

type ChartRenderData = Readonly<{
  candles: readonly ChartRenderCandle[];
}>;

const EMPTY_PRICE_RANGE: NumericRange = Object.freeze({ min: 0, max: 1 });
const OLDER_HISTORY_TRIGGER_LOGICAL_INDEX = 120;

const INDICATOR_OPTIONS = Object.freeze([
  { id: 'sma-20', label: 'SMA 20', method: 'sma', period: 20, color: '#f4c542' },
  { id: 'ema-20', label: 'EMA 20', method: 'ema', period: 20, color: '#42a5f5' },
  { id: 'ema-50', label: 'EMA 50', method: 'ema', period: 50, color: '#ab47bc' },
] as const);

const createRenderCandles = (candles: readonly Candle[]): readonly ChartRenderCandle[] =>
  Object.freeze(
    candles.map((candle, logicalIndex) =>
      Object.freeze({
        ...candle,
        logicalIndex,
      }),
    ),
  );

const getTimestampForLogicalIndex = (
  logicalIndex: number,
  candles: readonly ChartRenderCandle[],
): number | null => {
  if (!Number.isFinite(logicalIndex) || candles.length === 0) {
    return null;
  }

  if (candles.length === 1) {
    return candles[0]?.timestamp ?? null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];

  if (first === undefined || last === undefined) {
    return null;
  }

  let left: ChartRenderCandle;
  let right: ChartRenderCandle;

  if (logicalIndex <= first.logicalIndex) {
    left = first;
    right = candles[1] ?? first;
  } else if (logicalIndex >= last.logicalIndex) {
    left = candles[candles.length - 2] ?? last;
    right = last;
  } else {
    const lowerIndex = Math.floor(logicalIndex);
    const upperIndex = Math.ceil(logicalIndex);
    left = candles[lowerIndex] ?? first;
    right = candles[upperIndex] ?? last;
  }

  const indexSpan = right.logicalIndex - left.logicalIndex;

  if (indexSpan <= 0) {
    return left.timestamp;
  }

  const progress = (logicalIndex - left.logicalIndex) / indexSpan;
  return left.timestamp + (right.timestamp - left.timestamp) * progress;
};

const getPriceRange = (candles: readonly ChartRenderCandle[]): NumericRange => {
  if (candles.length === 0) {
    return EMPTY_PRICE_RANGE;
  }

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (const candle of candles) {
    minimum = Math.min(minimum, candle.low);
    maximum = Math.max(maximum, candle.high);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return EMPTY_PRICE_RANGE;
  }

  const span = maximum - minimum;
  const padding = span > 0 ? span * 0.08 : Math.max(Math.abs(maximum) * 0.01, 0.01);

  return Object.freeze({ min: minimum - padding, max: maximum + padding });
};

const getPreservedPriceRange = (
  previousScale: ChartInteractionController['snapshot']['frame']['priceScale'],
  previousCandles: readonly ChartRenderCandle[],
  nextCandles: readonly ChartRenderCandle[],
): NumericRange => {
  const nextRange = getPriceRange(nextCandles);
  const previousRange = getPriceRange(previousCandles);
  const previousDataSpan = previousRange.max - previousRange.min;
  const previousVisibleSpan = previousScale.range.max - previousScale.range.min;

  if (
    !Number.isFinite(previousDataSpan) ||
    previousDataSpan <= 0 ||
    !Number.isFinite(previousVisibleSpan) ||
    previousVisibleSpan <= 0
  ) {
    return nextRange;
  }

  const nextDataSpan = nextRange.max - nextRange.min;
  const zoomRatio = previousVisibleSpan / previousDataSpan;
  const nextSpan = nextDataSpan * zoomRatio;
  const previousDataCenter = (previousRange.min + previousRange.max) / 2;
  const previousVisibleCenter = (previousScale.range.min + previousScale.range.max) / 2;
  const centerOffsetRatio = (previousVisibleCenter - previousDataCenter) / previousDataSpan;
  const center = (nextRange.min + nextRange.max) / 2 + centerOffsetRatio * nextDataSpan;

  if (!Number.isFinite(nextSpan) || nextSpan <= 0 || !Number.isFinite(center)) {
    return nextRange;
  }

  return Object.freeze({
    min: center - nextSpan / 2,
    max: center + nextSpan / 2,
  });
};

const createFrame = (
  size: CanvasResize,
  controller: ChartInteractionController | null,
  candles: readonly ChartRenderCandle[],
  previousCandles: readonly ChartRenderCandle[],
  preservePriceZoom: boolean,
  priceScaleMode: PriceScaleMode,
  fitContent = false,
  rightOffsetOverride?: number,
) => {
  const previousScale = controller?.snapshot.frame.timeScale;
  const previousPriceScale = controller?.snapshot.frame.priceScale;
  const modeChanged =
    previousPriceScale !== undefined && previousPriceScale.mode !== priceScaleMode;
  const priceRange =
    preservePriceZoom && previousPriceScale !== undefined && !modeChanged && !fitContent
      ? getPreservedPriceRange(previousPriceScale, previousCandles, candles)
      : getPriceRange(candles);
  const relativeMode = priceScaleMode === 'percentage' || priceScaleMode === 'indexed-to-100';
  const baseValue =
    previousPriceScale?.mode === priceScaleMode && previousPriceScale.baseValue !== null
      ? previousPriceScale.baseValue
      : candles[0]?.close;

  return createChartFrame(size.width, size.height, priceRange, candles.length - 1, {
    layout: {
      rightPriceScaleWidth: 78,
      timeScaleHeight: 32,
      volumeHeight: 84,
      topInset: 12,
      bottomInset: 8,
    },
    timeScale:
      previousScale === undefined
        ? { barSpacing: 7.5, minBarSpacing: 2, maxBarSpacing: 32 }
        : {
            barSpacing: fitContent
              ? Math.min(
                  previousScale.maxBarSpacing,
                  Math.max(
                    previousScale.minBarSpacing,
                    size.width / Math.max(1, candles.length + 2),
                  ),
                )
              : previousScale.barSpacing,
            rightOffset: fitContent ? 0 : (rightOffsetOverride ?? previousScale.rightOffset),
            minBarSpacing: previousScale.minBarSpacing,
            maxBarSpacing: previousScale.maxBarSpacing,
            inverted: previousScale.inverted,
          },
    priceScale: {
      mode: priceScaleMode,
      ...(relativeMode && baseValue !== undefined ? { baseValue } : {}),
      inverted: previousPriceScale?.inverted ?? false,
    },
  });
};

const getVisiblePriceRange = (
  controller: ChartInteractionController,
  candles: readonly ChartRenderCandle[],
): NumericRange => {
  const { from, to } = controller.snapshot.frame.timeScale.visibleLogicalRange;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (const candle of candles) {
    if (candle.logicalIndex < from - 1 || candle.logicalIndex > to + 1) {
      continue;
    }

    minimum = Math.min(minimum, candle.low);
    maximum = Math.max(maximum, candle.high);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return getPriceRange(candles);
  }

  const span = maximum - minimum;
  const padding = span > 0 ? span * 0.08 : Math.max(Math.abs(maximum) * 0.01, 0.01);

  return Object.freeze({ min: minimum - padding, max: maximum + padding });
};

const hasSameSize = (first: CanvasResize | null, second: CanvasResize): boolean =>
  first !== null &&
  first.width === second.width &&
  first.height === second.height &&
  first.devicePixelRatio === second.devicePixelRatio;

export function ChartCanvas({
  candles,
  symbol,
  interval,
  loading,
  error,
  onRetry,
  onNeedMoreHistory,
}: ChartCanvasProps) {
  const runtimeRef = useRef<ChartRuntime | null>(null);
  const rightOffsetInputRef = useRef<HTMLInputElement | null>(null);
  const [priceScaleMode, setPriceScaleMode] = useState<PriceScaleMode>('linear');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [activeIndicators, setActiveIndicators] = useState<readonly string[]>([]);
  const [drawingTool, setDrawingTool] = useState<CanvasDrawingTool>('cursor');
  const [drawings, setDrawings] = useState<readonly ChartRenderDrawing[]>([]);
  const [autoScale, setAutoScale] = useState(true);
  const [priceScaleLocked, setPriceScaleLocked] = useState(false);
  const [priceScaleInverted, setPriceScaleInverted] = useState(false);
  const priceScaleModeRef = useRef<PriceScaleMode>(priceScaleMode);
  const chartTypeRef = useRef<ChartType>(chartType);
  const indicatorsRef = useRef<readonly ChartIndicatorSeries[]>([]);
  const drawingToolRef = useRef<CanvasDrawingTool>(drawingTool);
  const drawingsRef = useRef<readonly ChartRenderDrawing[]>(drawings);
  const drawingSequenceRef = useRef(0);
  const drawingSymbolRef = useRef(symbol);
  const autoScaleRef = useRef(autoScale);
  const priceScaleLockedRef = useRef(priceScaleLocked);
  priceScaleModeRef.current = priceScaleMode;
  chartTypeRef.current = chartType;
  drawingToolRef.current = drawingTool;
  drawingsRef.current = drawings;
  autoScaleRef.current = autoScale;
  priceScaleLockedRef.current = priceScaleLocked;
  const renderCandles = useMemo(() => createRenderCandles(candles), [candles]);
  const renderIndicators = useMemo(
    () =>
      Object.freeze(
        INDICATOR_OPTIONS.filter((indicator) => activeIndicators.includes(indicator.id)).map(
          (indicator) =>
            Object.freeze({
              id: indicator.id,
              label: indicator.label,
              color: indicator.color,
              points:
                indicator.method === 'sma'
                  ? calculateSimpleMovingAverage(renderCandles, indicator.period)
                  : calculateExponentialMovingAverage(renderCandles, indicator.period),
            }),
        ),
      ),
    [activeIndicators, renderCandles],
  );
  indicatorsRef.current = renderIndicators;
  const onNeedMoreHistoryRef = useRef(onNeedMoreHistory);
  onNeedMoreHistoryRef.current = onNeedMoreHistory;
  const renderDataRef = useRef<ChartRenderData>({ candles: renderCandles });
  renderDataRef.current = { candles: renderCandles };

  const bindCanvas = useCallback((canvas: HTMLCanvasElement | null): void => {
    if (canvas === null) {
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      return;
    }

    if (runtimeRef.current !== null) {
      return;
    }

    const renderer = createCanvasRenderer(canvas);
    let currentCandles = renderDataRef.current.candles;
    let controller: ChartInteractionController | null = null;
    let scene: ChartRenderScene | null = null;
    let pointerAdapter: CanvasPointerAdapter | null = null;
    let lastSize: CanvasResize | null = null;

    const handleControllerChange = (snapshot: ChartInteractionSnapshot): void => {
      if (scene === null) {
        return;
      }

      scene = updateChartRenderScene(scene, {
        frame: snapshot.frame,
        crosshair: snapshot.crosshair,
      });
      renderer.setScene(scene);
      canvas.dataset['rightOffset'] = String(snapshot.frame.timeScale.rightOffset);
      canvas.dataset['followLatest'] = String(snapshot.frame.timeScale.rightOffset >= 0);
      canvas.dataset['navigationMode'] =
        snapshot.frame.timeScale.rightOffset >= 0 ? 'realtime' : 'historical';
      if (rightOffsetInputRef.current !== null) {
        rightOffsetInputRef.current.value = String(
          Math.max(0, Math.min(50, Math.round(snapshot.frame.timeScale.rightOffset))),
        );
      }

      if (
        snapshot.frame.timeScale.visibleLogicalRange.from <= OLDER_HISTORY_TRIGGER_LOGICAL_INDEX &&
        currentCandles.length > 0
      ) {
        onNeedMoreHistoryRef.current();
      }
    };

    const handleResize = (size: CanvasResize): void => {
      if (hasSameSize(lastSize, size)) {
        return;
      }

      lastSize = size;
      renderer.resize(size.width, size.height, size.devicePixelRatio);

      if (size.width <= 0 || size.height <= 0) {
        return;
      }

      const frame = createFrame(
        size,
        controller,
        currentCandles,
        currentCandles,
        false,
        priceScaleModeRef.current,
      );

      if (controller === null) {
        scene = createChartRenderScene(
          frame,
          currentCandles,
          null,
          chartTypeRef.current,
          indicatorsRef.current,
          drawingsRef.current,
        );
        const interactionController = createChartInteractionController(frame, {
          onChange: handleControllerChange,
          onPriceScaleInteraction: () => {
            autoScaleRef.current = false;
            setAutoScale(false);
          },
        });
        controller = interactionController;
        interactionController.setPriceScaleLocked(priceScaleLockedRef.current);
        renderer.setScene(scene);
        canvas.dataset['rightOffset'] = String(frame.timeScale.rightOffset);
        canvas.dataset['followLatest'] = String(frame.timeScale.rightOffset >= 0);
        canvas.dataset['navigationMode'] =
          frame.timeScale.rightOffset >= 0 ? 'realtime' : 'historical';
        pointerAdapter = attachCanvasPointerEvents(canvas, interactionController, {
          getAutoScalePriceRange: () => getVisiblePriceRange(interactionController, currentCandles),
          getDrawingTool: () => drawingToolRef.current,
          onDrawingComplete: (gesture: CanvasDrawingGesture): void => {
            const startTimestamp = getTimestampForLogicalIndex(
              gesture.start.logicalIndex,
              currentCandles,
            );
            const endTimestamp =
              gesture.end === null
                ? null
                : getTimestampForLogicalIndex(gesture.end.logicalIndex, currentCandles);

            if (startTimestamp === null || (gesture.end !== null && endTimestamp === null)) {
              return;
            }

            drawingSequenceRef.current += 1;
            const drawing: ChartRenderDrawing = Object.freeze({
              id: 'drawing-' + drawingSequenceRef.current,
              type: gesture.type,
              start: Object.freeze({
                timestamp: startTimestamp,
                price: gesture.start.price,
              }),
              end:
                gesture.end === null || endTimestamp === null
                  ? null
                  : Object.freeze({
                      timestamp: endTimestamp,
                      price: gesture.end.price,
                    }),
              color: '#60a5fa',
            });
            const nextDrawings = Object.freeze([...drawingsRef.current, drawing]);
            drawingsRef.current = nextDrawings;
            setDrawings(nextDrawings);

            if (scene !== null) {
              scene = updateChartRenderScene(scene, { drawings: nextDrawings });
              renderer.setScene(scene);
            }
          },
        });
      } else {
        controller.setFrame(frame);
        if (autoScaleRef.current) {
          controller.fitPriceScale(getVisiblePriceRange(controller, currentCandles));
        }
      }

      canvas.dataset['chartReady'] = 'true';
    };

    const resizeAdapter: CanvasResizeAdapter = attachCanvasResizeObserver(canvas, handleResize);

    runtimeRef.current = Object.freeze({
      updateCandles: (
        nextCandles: readonly ChartRenderCandle[],
        nextMode: PriceScaleMode,
      ): void => {
        if (nextCandles === currentCandles) {
          return;
        }

        const previousCandles = currentCandles;
        currentCandles = nextCandles;

        if (controller === null || lastSize === null) {
          return;
        }

        const currentTimeScale = controller.snapshot.frame.timeScale;
        const previousLastCandle = previousCandles[previousCandles.length - 1];
        const appendedBars = countAppendedBars(
          previousLastCandle?.timestamp ?? null,
          currentCandles.map((candle) => candle.timestamp),
        );
        const nextRightOffset = getRightOffsetAfterDataUpdate(
          currentTimeScale.rightOffset,
          appendedBars,
        );
        const frame = createFrame(
          lastSize,
          controller,
          currentCandles,
          previousCandles,
          true,
          nextMode,
          false,
          nextRightOffset,
        );
        scene = createChartRenderScene(
          frame,
          currentCandles,
          controller.snapshot.crosshair,
          chartTypeRef.current,
          indicatorsRef.current,
          drawingsRef.current,
        );
        controller.setFrame(frame);
        if (autoScaleRef.current) {
          controller.fitPriceScale(getVisiblePriceRange(controller, currentCandles));
        }
        renderer.setScene(scene);
      },
      setPriceScaleMode: (nextMode: PriceScaleMode): void => {
        if (controller === null || lastSize === null || currentCandles.length === 0) {
          return;
        }

        const frame = createFrame(
          lastSize,
          controller,
          currentCandles,
          currentCandles,
          false,
          nextMode,
        );
        scene = createChartRenderScene(
          frame,
          currentCandles,
          controller.snapshot.crosshair,
          chartTypeRef.current,
          indicatorsRef.current,
          drawingsRef.current,
        );
        controller.setFrame(frame);
        renderer.setScene(scene);
      },
      setIndicators: (nextIndicators: readonly ChartIndicatorSeries[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { indicators: nextIndicators });
        renderer.setScene(scene);
      },
      setDrawings: (nextDrawings: readonly ChartRenderDrawing[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { drawings: nextDrawings });
        renderer.setScene(scene);
      },
      setChartType: (nextChartType: ChartType): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { chartType: nextChartType });
        renderer.setScene(scene);
      },
      fitContent: (mode: PriceScaleMode): void => {
        if (controller === null || lastSize === null || currentCandles.length === 0) {
          return;
        }

        const frame = createFrame(
          lastSize,
          controller,
          currentCandles,
          currentCandles,
          false,
          mode,
          true,
        );
        scene = createChartRenderScene(
          frame,
          currentCandles,
          null,
          chartTypeRef.current,
          indicatorsRef.current,
          drawingsRef.current,
        );
        controller.setFrame(frame);
        renderer.setScene(scene);
      },
      fitPriceScale: (): void => {
        if (controller !== null && currentCandles.length > 0) {
          controller.fitPriceScale(getVisiblePriceRange(controller, currentCandles));
        }
      },
      scrollTimeByBars: (bars: number): void => {
        controller?.scrollTimeByBars(bars);
      },
      setRightOffset: (offset: number): void => {
        controller?.setRightOffset(offset);
      },
      scrollToRealtime: (): void => {
        controller?.scrollToRealtime();
      },
      zoomTime: (factor: number): void => {
        if (controller !== null) {
          controller.zoomTime(factor);
        }
      },
      setPriceScaleLocked: (locked: boolean): void => {
        controller?.setPriceScaleLocked(locked);
      },
      invertPriceScale: (): void => {
        controller?.invertPriceScale();
      },
      destroy: (): void => {
        pointerAdapter?.destroy();
        resizeAdapter.destroy();
        renderer.destroy();
        delete canvas.dataset['chartReady'];
      },
    });
  }, []);

  const bindDataUpdate = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element !== null) {
        if (drawingSymbolRef.current !== symbol) {
          drawingSymbolRef.current = symbol;
          drawingSequenceRef.current = 0;
          drawingsRef.current = Object.freeze([]);
          setDrawings(drawingsRef.current);
          runtimeRef.current?.setDrawings(drawingsRef.current);
        }

        runtimeRef.current?.updateCandles(renderDataRef.current.candles, priceScaleMode);
      }
    },
    [renderCandles, priceScaleMode, symbol],
  );

  const bindIndicatorsUpdate = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element !== null) {
        runtimeRef.current?.setIndicators(indicatorsRef.current);
      }
    },
    [renderIndicators],
  );

  const handleIndicatorToggle = (indicatorId: string): void => {
    setActiveIndicators((current) =>
      current.includes(indicatorId)
        ? current.filter((activeId) => activeId !== indicatorId)
        : [...current, indicatorId],
    );
  };

  const handleDrawingToolChange = (nextTool: CanvasDrawingTool): void => {
    drawingToolRef.current = nextTool;
    setDrawingTool(nextTool);
  };

  const handleClearDrawings = (): void => {
    drawingsRef.current = Object.freeze([]);
    setDrawings(drawingsRef.current);
    runtimeRef.current?.setDrawings(drawingsRef.current);
  };

  const handleAutoScaleChange = (): void => {
    const nextAutoScale = !autoScaleRef.current;
    autoScaleRef.current = nextAutoScale;
    setAutoScale(nextAutoScale);
    if (nextAutoScale) {
      runtimeRef.current?.fitPriceScale();
    }
  };

  const handlePriceScaleLockChange = (): void => {
    const nextLocked = !priceScaleLocked;
    setPriceScaleLocked(nextLocked);
    runtimeRef.current?.setPriceScaleLocked(nextLocked);
  };

  const handlePriceScaleInvert = (): void => {
    setPriceScaleInverted((current) => !current);
    runtimeRef.current?.invertPriceScale();
  };

  const handleChartTypeChange = (nextChartType: ChartType): void => {
    chartTypeRef.current = nextChartType;
    setChartType(nextChartType);
    runtimeRef.current?.setChartType(nextChartType);
  };

  const handlePriceScaleModeChange = (mode: PriceScaleMode): void => {
    priceScaleModeRef.current = mode;
    setPriceScaleMode(mode);
    runtimeRef.current?.setPriceScaleMode(mode);
  };

  return (
    <div class="grid h-[390px] min-h-[340px] w-full grid-cols-[38px_minmax(0,1fr)] bg-[#0b0f17]">
      <aside class="flex min-w-0 flex-col items-center gap-1 border-r border-white/10 bg-[#101723] py-2">
        <button
          type="button"
          aria-label="Cursor y navegación"
          aria-pressed={drawingTool === 'cursor'}
          data-testid="drawing-tool-cursor"
          title="Cursor y navegación"
          onClick={() => handleDrawingToolChange('cursor')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'cursor'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          ↖
        </button>
        <button
          type="button"
          aria-label="Línea de tendencia"
          aria-pressed={drawingTool === 'trend-line'}
          data-testid="drawing-tool-trend-line"
          title="Línea de tendencia"
          onClick={() => handleDrawingToolChange('trend-line')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'trend-line'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          ╱
        </button>
        <button
          type="button"
          aria-label="Línea horizontal"
          aria-pressed={drawingTool === 'horizontal-line'}
          data-testid="drawing-tool-horizontal-line"
          title="Línea horizontal"
          onClick={() => handleDrawingToolChange('horizontal-line')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'horizontal-line'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          —
        </button>
        <span class="my-1 h-px w-6 bg-white/10" />
        <button
          type="button"
          aria-label="Borrar todos los dibujos"
          data-testid="drawing-clear-all"
          title="Borrar todos los dibujos"
          disabled={drawings.length === 0}
          onClick={handleClearDrawings}
          class="grid size-8 place-items-center rounded text-xs text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-30"
        >
          <span aria-hidden="true">⌫</span>
        </button>
      </aside>
      <div
        class="relative h-full min-w-0 bg-[#0b0f17]"
        data-testid="chart-surface"
        data-provider-error={error === null ? 'false' : 'true'}
      >
      <canvas
        ref={bindCanvas}
        class="block h-full w-full touch-none"
        role="img"
        aria-label={
          'Gráfico interactivo de velas y volumen para ' +
          symbol +
          '. Arrastrar el gráfico para desplazar el tiempo, arrastrar el eje de precios para desplazar los precios, usar la rueda sobre cada área para acercar y hacer doble clic en el eje de precios para autoajustar.'
        }
        data-candles-count={renderCandles.length}
        data-chart-type={chartType}
        data-indicator-count={renderIndicators.length}
        data-drawing-count={drawings.length}
        data-drawing-tool={drawingTool}
        data-interval={interval}
      />
      <span ref={bindDataUpdate} class="hidden" aria-hidden="true" />
      <span ref={bindIndicatorsUpdate} class="hidden" aria-hidden="true" />
      <div class="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
        <span class="text-xs font-semibold text-slate-200">{symbol}</span>
        <span class="rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-400">
          {interval} · Datos históricos
        </span>
        <span class="rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-500">
          {renderCandles.length} velas
        </span>
      </div>
      <fieldset class="absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-1 rounded-lg border border-white/10 bg-[#101723]/95 p-1 shadow-lg">
        <legend class="sr-only">Controles del gráfico</legend>
        <label class="flex items-center gap-1 px-1 text-[10px] text-slate-400">
          <span class="sr-only">Tipo de gráfico</span>
          <select
            value={chartType}
            aria-label="Tipo de gráfico"
            data-testid="chart-type-select"
            onChange={(event) => handleChartTypeChange(event.currentTarget.value as ChartType)}
            class="max-w-24 rounded bg-transparent px-1 py-1 text-[10px] text-slate-200 outline-none"
          >
            <option value="candles">Velas</option>
            <option value="bars">Barras</option>
            <option value="line">Línea</option>
            <option value="area">Área</option>
          </select>
        </label>
        <details class="relative" data-testid="chart-indicators-menu">
          <summary class="cursor-pointer list-none rounded px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-white/5">
            Indicadores
          </summary>
          <div class="absolute left-0 top-full z-20 mt-2 min-w-40 rounded-lg border border-white/10 bg-[#101723] p-2 shadow-xl">
            <div class="mb-2 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Medias móviles
            </div>
            {INDICATOR_OPTIONS.map((indicator) => (
              <label
                key={indicator.id}
                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={activeIndicators.includes(indicator.id)}
                  data-testid={'chart-indicator-' + indicator.id}
                  onChange={() => handleIndicatorToggle(indicator.id)}
                  class="accent-blue-400"
                />
                <span class="size-2 rounded-full" style={{ backgroundColor: indicator.color }} />
                {indicator.label}
              </label>
            ))}
          </div>
        </details>
        <span class="mx-0.5 h-4 w-px bg-white/10" />
        {(
          [
            ['linear', 'Lin'],
            ['logarithmic', 'Log'],
            ['percentage', '%'],
            ['indexed-to-100', '100'],
          ] as const
        ).map(([mode, label]) => (
          <button
            type="button"
            disabled={renderCandles.length === 0}
            aria-label={`Escala ${mode}`}
            aria-pressed={priceScaleMode === mode}
            data-testid={`price-scale-${mode}`}
            onClick={() => handlePriceScaleModeChange(mode)}
            class={`rounded px-2 py-1 text-[10px] transition-colors ${priceScaleMode === mode ? 'bg-blue-500/20 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-label="Desplazar hacia el histórico"
          data-testid="chart-pan-older"
          onClick={() => runtimeRef.current?.scrollTimeByBars(-20)}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          ←
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-label="Desplazar hacia el presente"
          data-testid="chart-pan-newer"
          onClick={() => runtimeRef.current?.scrollTimeByBars(20)}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          →
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-label="Alejar escala temporal"
          data-testid="chart-time-zoom-out"
          onClick={() => runtimeRef.current?.zoomTime(0.8)}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-label="Acercar escala temporal"
          data-testid="chart-time-zoom-in"
          onClick={() => runtimeRef.current?.zoomTime(1.25)}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          +
        </button>
        <label class="flex items-center gap-1 px-1 text-[10px] text-slate-400">
          <span>Margen</span>
          <input
            ref={rightOffsetInputRef}
            type="range"
            min="0"
            max="50"
            step="1"
            defaultValue="0"
            aria-label="Margen derecho en velas futuras"
            data-testid="chart-right-offset"
            disabled={renderCandles.length === 0}
            onInput={(event) =>
              runtimeRef.current?.setRightOffset(Number(event.currentTarget.value))
            }
            class="h-1 w-16 cursor-pointer accent-blue-400 disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          data-testid="chart-go-realtime"
          onClick={() => runtimeRef.current?.scrollToRealtime()}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
        >
          Ahora
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-pressed={autoScale}
          data-testid="chart-auto-scale"
          onClick={handleAutoScaleChange}
          class={`rounded px-2 py-1 text-[10px] transition-colors ${autoScale ? 'bg-blue-500/20 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          Auto
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-pressed={priceScaleLocked}
          aria-label={
            priceScaleLocked ? 'Desbloquear escala de precios' : 'Bloquear escala de precios'
          }
          data-testid="chart-lock-price-scale"
          onClick={handlePriceScaleLockChange}
          class={`rounded px-2 py-1 text-[10px] transition-colors ${priceScaleLocked ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          {priceScaleLocked ? 'Bloqueada' : 'Bloquear'}
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          aria-pressed={priceScaleInverted}
          data-testid="chart-invert-price-scale"
          onClick={handlePriceScaleInvert}
          class={`rounded px-2 py-1 text-[10px] transition-colors ${priceScaleInverted ? 'bg-blue-500/20 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
        >
          Invertir
        </button>
        <span class="mx-0.5 h-4 w-px bg-white/10" />
        <button
          type="button"
          disabled={renderCandles.length === 0}
          data-testid="chart-fit-prices"
          onClick={() => runtimeRef.current?.fitPriceScale()}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          Ajustar
        </button>
        <button
          type="button"
          disabled={renderCandles.length === 0}
          data-testid="chart-fit-content"
          onClick={() => runtimeRef.current?.fitContent(priceScaleMode)}
          class="rounded px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          Ver todo
        </button>
      </fieldset>
      {loading && (
        <div class="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b0f17]/70">
          <span
            role="status"
            data-testid="market-data-loading"
            class="rounded-lg border border-white/10 bg-[#101723] px-4 py-2 text-xs text-slate-300"
          >
            Cargando velas históricas…
          </span>
        </div>
      )}
      {!loading && error !== null && (
        <div class="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b0f17]/80 p-6">
          <div
            role="alert"
            class="pointer-events-auto max-w-sm rounded-xl border border-rose-400/20 bg-[#101723] p-5 text-center"
          >
            <div class="text-sm font-medium text-rose-200">No se pudieron cargar los datos</div>
            <p class="mt-2 break-words text-xs leading-5 text-slate-400">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              class="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/5"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
      {!loading && error === null && renderCandles.length === 0 && (
        <div class="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            role="status"
            class="rounded-lg border border-white/10 bg-[#101723] px-4 py-2 text-xs text-slate-400"
          >
            La fuente no devolvió velas para este rango.
          </span>
        </div>
      )}
      <div class="pointer-events-none absolute bottom-3 right-4 rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-500">
        Drag to pan · Scroll to zoom · Double-click price axis to fit
      </div>
      </div>
    </div>
  );
}
