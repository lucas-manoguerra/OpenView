import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Candle } from '@openview/market-domain';
import type { CandleInterval } from '@openview/market-data';
import {
  attachCanvasPointerEvents,
  type CanvasDrawingEditGesture,
  type CanvasDrawingGroupEditGesture,
  type CanvasDrawingGesture,
  type CanvasDrawingTool,
  attachCanvasResizeObserver,
  createChartFrame,
  createChartInteractionController,
  createChartRenderScene,
  createCanvasRenderer,
  getTimestampAtLogicalIndex,
  updateChartDrawing,
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
  setSelectedDrawingId(drawingId: string | null): void;
  setSelectedDrawingIds(drawingIds: readonly string[]): void;
  destroy(): void;
}>;

type ChartRenderData = Readonly<{
  candles: readonly ChartRenderCandle[];
}>;

type DrawingPanelPosition = Readonly<{ left: number; top: number }>;

type DrawingPanelDrag = Readonly<{
  pointerId: number;
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
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
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<readonly string[]>([]);
  const [drawingUndoCount, setDrawingUndoCount] = useState(0);
  const [drawingRedoCount, setDrawingRedoCount] = useState(0);
  const [drawingPanelPosition, setDrawingPanelPosition] = useState<DrawingPanelPosition | null>(
    null,
  );
  const [autoScale, setAutoScale] = useState(true);
  const [priceScaleLocked, setPriceScaleLocked] = useState(false);
  const [priceScaleInverted, setPriceScaleInverted] = useState(false);
  const priceScaleModeRef = useRef<PriceScaleMode>(priceScaleMode);
  const chartTypeRef = useRef<ChartType>(chartType);
  const indicatorsRef = useRef<readonly ChartIndicatorSeries[]>([]);
  const drawingToolRef = useRef<CanvasDrawingTool>(drawingTool);
  const drawingsRef = useRef<readonly ChartRenderDrawing[]>(drawings);
  const selectedDrawingIdRef = useRef<string | null>(selectedDrawingId);
  const selectedDrawingIdsRef = useRef<readonly string[]>(selectedDrawingIds);
  const drawingUndoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const drawingRedoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const commitDrawingsRef = useRef<(nextDrawings: readonly ChartRenderDrawing[]) => void>(() => {});
  const drawingSequenceRef = useRef(0);
  const drawingPropertiesPanelRef = useRef<HTMLDivElement | null>(null);
  const drawingPropertiesDragRef = useRef<DrawingPanelDrag | null>(null);
  const drawingSymbolRef = useRef(symbol);
  const autoScaleRef = useRef(autoScale);
  const priceScaleLockedRef = useRef(priceScaleLocked);
  priceScaleModeRef.current = priceScaleMode;
  chartTypeRef.current = chartType;
  drawingToolRef.current = drawingTool;
  drawingsRef.current = drawings;
  selectedDrawingIdRef.current = selectedDrawingId;
  selectedDrawingIdsRef.current = selectedDrawingIds;
  commitDrawingsRef.current = (nextDrawings): void => {
    const previousDrawings = drawingsRef.current;
    const nextUndoStack = [...drawingUndoStackRef.current, previousDrawings].slice(-50);
    drawingUndoStackRef.current = Object.freeze(nextUndoStack);
    drawingRedoStackRef.current = Object.freeze([]);
    drawingsRef.current = Object.freeze([...nextDrawings]);
    setDrawings(drawingsRef.current);
    setDrawingUndoCount(drawingUndoStackRef.current.length);
    setDrawingRedoCount(0);
    runtimeRef.current?.setDrawings(drawingsRef.current);
  };
  const updateDrawingSelection = (drawingIds: readonly string[]): void => {
    const availableIds = new Set(drawingsRef.current.map((drawing) => drawing.id));
    const nextSelection = Object.freeze(
      [...new Set(drawingIds)].filter((drawingId) => availableIds.has(drawingId)),
    );
    selectedDrawingIdsRef.current = nextSelection;
    selectedDrawingIdRef.current = nextSelection[nextSelection.length - 1] ?? null;
    setSelectedDrawingIds(nextSelection);
    setSelectedDrawingId(selectedDrawingIdRef.current);
    runtimeRef.current?.setSelectedDrawingIds(nextSelection);
  };
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
          selectedDrawingIdRef.current,
          selectedDrawingIdsRef.current,
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
          getDrawings: () => drawingsRef.current,
          getCandles: () => currentCandles,
          getSelectedDrawingId: () => selectedDrawingIdRef.current,
          getSelectedDrawingIds: () => selectedDrawingIdsRef.current,
          onDrawingSelectionChange: (drawingIds: readonly string[]): void => {
            updateDrawingSelection(drawingIds);
          },
          onDrawingGroupEdit: (gesture: CanvasDrawingGroupEditGesture): void => {
            const selectedIds = new Set(gesture.drawingIds);
            const nextDrawings = drawingsRef.current.map((drawing) =>
              selectedIds.has(drawing.id)
                ? updateChartDrawing(
                    drawing,
                    'body',
                    gesture.origin,
                    gesture.current,
                    currentCandles,
                  )
                : drawing,
            );
            commitDrawingsRef.current(nextDrawings);
          },
          onDrawingDeleteMany: (drawingIds: readonly string[]): void => {
            const deletedIds = new Set(drawingIds);
            const nextDrawings = drawingsRef.current.filter(
              (drawing) => !deletedIds.has(drawing.id),
            );

            if (nextDrawings.length === drawingsRef.current.length) {
              return;
            }

            commitDrawingsRef.current(nextDrawings);
            updateDrawingSelection([]);
          },
          onDrawingEdit: (gesture: CanvasDrawingEditGesture): void => {
            const drawing = drawingsRef.current.find(
              (candidate) => candidate.id === gesture.drawingId,
            );

            if (drawing === undefined) {
              return;
            }

            const updatedDrawing = updateChartDrawing(
              drawing,
              gesture.target,
              gesture.origin,
              gesture.current,
              currentCandles,
            );
            commitDrawingsRef.current(
              drawingsRef.current.map((candidate) =>
                candidate.id === gesture.drawingId ? updatedDrawing : candidate,
              ),
            );
          },
          onDrawingDelete: (drawingId: string): void => {
            const nextDrawings = drawingsRef.current.filter((drawing) => drawing.id !== drawingId);

            if (nextDrawings.length === drawingsRef.current.length) {
              return;
            }

            commitDrawingsRef.current(nextDrawings);
            updateDrawingSelection([]);
          },
          onDrawingComplete: (gesture: CanvasDrawingGesture): void => {
            const startTimestamp = getTimestampAtLogicalIndex(
              gesture.start.logicalIndex,
              currentCandles,
            );
            const endTimestamp =
              gesture.end === null
                ? null
                : getTimestampAtLogicalIndex(gesture.end.logicalIndex, currentCandles);

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
              lineWidth: 1.5,
              lineStyle: 'solid',
            });
            commitDrawingsRef.current([...drawingsRef.current, drawing]);
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
          selectedDrawingIdRef.current,
          selectedDrawingIdsRef.current,
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
          selectedDrawingIdRef.current,
          selectedDrawingIdsRef.current,
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
      setSelectedDrawingId: (drawingId: string | null): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { selectedDrawingId: drawingId });
        renderer.setScene(scene);
      },
      setSelectedDrawingIds: (drawingIds: readonly string[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { selectedDrawingIds: drawingIds });
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
          selectedDrawingIdRef.current,
          selectedDrawingIdsRef.current,
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
          selectedDrawingIdRef.current = null;
          setSelectedDrawingId(null);
          selectedDrawingIdsRef.current = Object.freeze([]);
          setSelectedDrawingIds(selectedDrawingIdsRef.current);
          drawingsRef.current = Object.freeze([]);
          drawingUndoStackRef.current = Object.freeze([]);
          drawingRedoStackRef.current = Object.freeze([]);
          setDrawings(drawingsRef.current);
          setDrawingUndoCount(0);
          setDrawingRedoCount(0);
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

  const handleSelectedDrawingUpdate = (
    updates: Partial<Pick<ChartRenderDrawing, 'color' | 'lineWidth' | 'lineStyle'>>,
  ): void => {
    const selectedIds = new Set(selectedDrawingIdsRef.current);

    if (selectedIds.size === 0) {
      return;
    }

    const nextDrawings = drawingsRef.current.map((drawing) =>
      selectedIds.has(drawing.id) ? Object.freeze({ ...drawing, ...updates }) : drawing,
    );
    commitDrawingsRef.current(nextDrawings);
  };

  const handleClearDrawings = (): void => {
    if (drawingsRef.current.length > 0) {
      commitDrawingsRef.current([]);
      updateDrawingSelection([]);
    }
  };

  const handleDeleteSelectedDrawing = (): void => {
    const selectedIds = new Set(selectedDrawingIdsRef.current);

    if (selectedIds.size === 0) {
      return;
    }

    commitDrawingsRef.current(
      drawingsRef.current.filter((drawing) => !selectedIds.has(drawing.id)),
    );
    updateDrawingSelection([]);
  };

  const handleDrawingUndo = (): void => {
    const previousDrawings = drawingUndoStackRef.current.at(-1);

    if (previousDrawings === undefined) {
      return;
    }

    drawingUndoStackRef.current = Object.freeze(drawingUndoStackRef.current.slice(0, -1));
    drawingRedoStackRef.current = Object.freeze(
      [...drawingRedoStackRef.current, drawingsRef.current].slice(-50),
    );
    drawingsRef.current = previousDrawings;
    setDrawings(previousDrawings);
    setDrawingUndoCount(drawingUndoStackRef.current.length);
    setDrawingRedoCount(drawingRedoStackRef.current.length);
    runtimeRef.current?.setDrawings(previousDrawings);
  };

  const handleDrawingRedo = (): void => {
    const nextDrawings = drawingRedoStackRef.current.at(-1);

    if (nextDrawings === undefined) {
      return;
    }

    drawingRedoStackRef.current = Object.freeze(drawingRedoStackRef.current.slice(0, -1));
    drawingUndoStackRef.current = Object.freeze(
      [...drawingUndoStackRef.current, drawingsRef.current].slice(-50),
    );
    drawingsRef.current = nextDrawings;
    setDrawings(nextDrawings);
    setDrawingUndoCount(drawingUndoStackRef.current.length);
    setDrawingRedoCount(drawingRedoStackRef.current.length);
    runtimeRef.current?.setDrawings(nextDrawings);
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

  const selectedDrawing = drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null;

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
          aria-label="Seleccionar y editar dibujos"
          aria-pressed={drawingTool === 'select'}
          data-testid="drawing-tool-select"
          title="Seleccionar y editar dibujos"
          onClick={() => handleDrawingToolChange('select')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'select'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          ◉
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
          aria-label="Rayo"
          aria-pressed={drawingTool === 'ray'}
          data-testid="drawing-tool-ray"
          title="Rayo"
          onClick={() => handleDrawingToolChange('ray')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'ray'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          ➤
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
        <button
          type="button"
          aria-label="Línea vertical"
          aria-pressed={drawingTool === 'vertical-line'}
          data-testid="drawing-tool-vertical-line"
          title="Línea vertical"
          onClick={() => handleDrawingToolChange('vertical-line')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'vertical-line'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          │
        </button>
        <button
          type="button"
          aria-label="Rectángulo"
          aria-pressed={drawingTool === 'rectangle'}
          data-testid="drawing-tool-rectangle"
          title="Rectángulo"
          onClick={() => handleDrawingToolChange('rectangle')}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingTool === 'rectangle'
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          ▱
        </button>

        <span class="my-1 h-px w-6 bg-white/10" />
        <button
          type="button"
          aria-label="Borrar dibujo seleccionado"
          data-testid="drawing-delete-selected"
          title="Borrar selección"
          disabled={selectedDrawingIds.length === 0}
          onClick={handleDeleteSelectedDrawing}
          class="grid size-8 place-items-center rounded text-xs text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-30"
        >
          <span aria-hidden="true">⌦</span>
        </button>
        <button
          type="button"
          aria-label="Deshacer dibujo"
          data-testid="drawing-undo"
          title="Deshacer"
          disabled={drawingUndoCount === 0}
          onClick={handleDrawingUndo}
          class="grid size-8 place-items-center rounded text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-30"
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Rehacer dibujo"
          data-testid="drawing-redo"
          title="Rehacer"
          disabled={drawingRedoCount === 0}
          onClick={handleDrawingRedo}
          class="grid size-8 place-items-center rounded text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-30"
        >
          ↷
        </button>
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
          class="block h-full w-full touch-none outline-none focus-visible:ring-1 focus-visible:ring-blue-400/60"
          tabIndex={0}
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
          data-selected-drawing-id={selectedDrawingId ?? ''}
          data-selected-drawing-count={selectedDrawingIds.length}
          data-selected-drawing-ids={selectedDrawingIds.join(',')}
          data-selected-drawing-color={selectedDrawing?.color ?? ''}
          data-selected-drawing-width={
            selectedDrawing === null ? '' : String(selectedDrawing.lineWidth ?? 1.5)
          }
          data-selected-drawing-line-style={selectedDrawing?.lineStyle ?? 'solid'}
          data-drawing-tool={drawingTool}
          data-drawing-undo-count={drawingUndoCount}
          data-drawing-redo-count={drawingRedoCount}
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
        {selectedDrawing !== null && (
          <div
            ref={drawingPropertiesPanelRef}
            data-testid="drawing-properties-panel"
            class="absolute bottom-10 left-3 z-20 w-64 rounded-xl border border-white/10 bg-[#101723]/95 p-3 shadow-2xl backdrop-blur"
            style={
              drawingPanelPosition === null
                ? undefined
                : {
                    left: drawingPanelPosition.left,
                    top: drawingPanelPosition.top,
                    right: 'auto',
                    bottom: 'auto',
                  }
            }
          >
            <div class="mb-3 flex items-center gap-2">
              <div
                data-testid="drawing-properties-drag-handle"
                class="flex min-w-0 flex-1 cursor-grab items-center gap-2 touch-none rounded px-1 py-1 text-[11px] font-semibold text-slate-200 active:cursor-grabbing"
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }

                  const panel = drawingPropertiesPanelRef.current;

                  const dragSurface = panel?.parentElement;

                  if (panel === null || dragSurface === null || dragSurface === undefined) {
                    return;
                  }

                  const left = panel.offsetLeft;
                  const top = panel.offsetTop;
                  drawingPropertiesDragRef.current = {
                    pointerId: event.pointerId,
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    left,
                    top,
                  };
                  setDrawingPanelPosition({ left, top });

                  const updatePanelPosition = (clientX: number, clientY: number): void => {
                    const currentPanel = drawingPropertiesPanelRef.current;
                    const parent = currentPanel?.parentElement ?? null;

                    if (currentPanel === null || parent === null) {
                      return;
                    }

                    const maxLeft = Math.max(0, parent.clientWidth - currentPanel.offsetWidth);
                    const maxTop = Math.max(0, parent.clientHeight - currentPanel.offsetHeight);
                    const nextLeft = Math.max(0, Math.min(maxLeft, left + clientX - event.clientX));
                    const nextTop = Math.max(0, Math.min(maxTop, top + clientY - event.clientY));
                    currentPanel.style.left = String(nextLeft) + 'px';
                    currentPanel.style.top = String(nextTop) + 'px';
                    currentPanel.style.right = 'auto';
                    currentPanel.style.bottom = 'auto';
                    setDrawingPanelPosition({ left: nextLeft, top: nextTop });
                  };

                  const handlePointerMove = (pointerEvent: PointerEvent): void => {
                    if (pointerEvent.pointerId === event.pointerId) {
                      updatePanelPosition(pointerEvent.clientX, pointerEvent.clientY);
                    }
                  };

                  const handlePointerEnd = (pointerEvent: PointerEvent): void => {
                    if (pointerEvent.pointerId !== event.pointerId) {
                      return;
                    }

                    window.removeEventListener('pointermove', handlePointerMove, true);
                    window.removeEventListener('pointerup', handlePointerEnd, true);
                    window.removeEventListener('pointercancel', handlePointerEnd, true);
                    window.removeEventListener('mousemove', handleMouseMove, true);
                    window.removeEventListener('mouseup', handleMouseEnd, true);
                    drawingPropertiesDragRef.current = null;
                  };

                  const handleMouseMove = (mouseEvent: MouseEvent): void => {
                    updatePanelPosition(mouseEvent.clientX, mouseEvent.clientY);
                  };

                  const handleMouseEnd = (): void => {
                    window.removeEventListener('pointermove', handlePointerMove, true);
                    window.removeEventListener('pointerup', handlePointerEnd, true);
                    window.removeEventListener('pointercancel', handlePointerEnd, true);
                    window.removeEventListener('mousemove', handleMouseMove, true);
                    window.removeEventListener('mouseup', handleMouseEnd, true);
                    drawingPropertiesDragRef.current = null;
                  };

                  window.addEventListener('pointermove', handlePointerMove, true);
                  window.addEventListener('pointerup', handlePointerEnd, true);
                  window.addEventListener('pointercancel', handlePointerEnd, true);
                  window.addEventListener('mousemove', handleMouseMove, true);
                  window.addEventListener('mouseup', handleMouseEnd, true);
                }}
              >
                <span aria-hidden="true" class="text-slate-500">
                  ⠿
                </span>
                <span class="truncate">
                  {selectedDrawingIds.length > 1
                    ? 'Editar ' + selectedDrawingIds.length + ' dibujos'
                    : 'Editar ' + selectedDrawing.type}
                </span>
              </div>
              <button
                type="button"
                aria-label="Cerrar editor de dibujo"
                data-testid="drawing-editor-close"
                onClick={() => {
                  updateDrawingSelection([]);
                }}
                class="grid size-6 shrink-0 place-items-center rounded text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
            <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
              <label htmlFor="drawing-style-color" class="text-[10px] text-slate-400">
                Color
              </label>
              <input
                id="drawing-style-color"
                type="color"
                aria-label="Color del dibujo"
                data-testid="drawing-style-color"
                value={selectedDrawing.color}
                onInput={(event) =>
                  handleSelectedDrawingUpdate({ color: event.currentTarget.value })
                }
                class="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
              />
              <label htmlFor="drawing-style-width" class="text-[10px] text-slate-400">
                Grosor
              </label>
              <select
                id="drawing-style-width"
                aria-label="Grosor del dibujo"
                data-testid="drawing-style-width"
                value={String(selectedDrawing.lineWidth ?? 1.5)}
                onChange={(event) =>
                  handleSelectedDrawingUpdate({ lineWidth: Number(event.currentTarget.value) })
                }
                class="min-w-20 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
              >
                <option value="1">1 px</option>
                <option value="1.5">1.5 px</option>
                <option value="2">2 px</option>
                <option value="3">3 px</option>
                <option value="4">4 px</option>
                <option value="5">5 px</option>
                <option value="6">6 px</option>
              </select>
              <label htmlFor="drawing-style-line" class="text-[10px] text-slate-400">
                Trazo
              </label>
              <select
                id="drawing-style-line"
                aria-label="Estilo de línea del dibujo"
                data-testid="drawing-style-line"
                value={selectedDrawing.lineStyle ?? 'solid'}
                onChange={(event) =>
                  handleSelectedDrawingUpdate({
                    lineStyle: event.currentTarget.value as NonNullable<
                      ChartRenderDrawing['lineStyle']
                    >,
                  })
                }
                class="min-w-20 rounded border border-white/10 bg-[#0b0f17] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-blue-400"
              >
                <option value="solid">Continuo</option>
                <option value="dashed">Guiones</option>
                <option value="dotted">Puntos</option>
              </select>
            </div>
          </div>
        )}
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
