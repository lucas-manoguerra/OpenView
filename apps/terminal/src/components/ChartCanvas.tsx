import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Candle } from '@openview/market-domain';
import type { CandleInterval } from '@openview/market-data';
import {
  BUILT_IN_DRAWING_STYLE_TEMPLATES,
  MAX_CUSTOM_DRAWING_TEMPLATES,
  createDrawingStyleTemplate,
  loadBrowserDrawingStyleTemplates,
  saveBrowserDrawingStyleTemplates,
  type DrawingStyleTemplate,
} from '../drawings/drawing-style-templates';
import {
  DEFAULT_DRAWING_TOOL_PREFERENCES,
  loadBrowserDrawingToolPreferences,
  saveBrowserDrawingToolPreferences,
  type DrawingToolPreferences,
  type DrawingToolType,
} from '../drawings/drawing-tool-preferences';
import {
  DEFAULT_DRAWING_PANEL_LAYOUT,
  loadBrowserDrawingPanelLayout,
  saveBrowserDrawingPanelLayout,
  startDrawingPanelDrag,
  type DrawingPanelId,
  type DrawingPanelLayout,
  type DrawingPanelPosition,
} from '../drawings/drawing-panel-layout';
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
  const [drawingPanelLayout, setDrawingPanelLayout] = useState<DrawingPanelLayout>(
    DEFAULT_DRAWING_PANEL_LAYOUT,
  );
  const [drawingPanelLayoutLoaded, setDrawingPanelLayoutLoaded] = useState(false);
  const [customDrawingTemplates, setCustomDrawingTemplates] = useState<
    readonly DrawingStyleTemplate[]
  >([]);
  const [drawingTemplatesExpanded, setDrawingTemplatesExpanded] = useState(false);
  const [drawingTemplatesLoaded, setDrawingTemplatesLoaded] = useState(false);
  const [selectedDrawingTemplateId, setSelectedDrawingTemplateId] = useState('builtin-blue');
  const [newDrawingTemplateName, setNewDrawingTemplateName] = useState('');
  const [drawingTemplateError, setDrawingTemplateError] = useState<string | null>(null);
  const [drawingToolPreferences, setDrawingToolPreferences] = useState<DrawingToolPreferences>(
    DEFAULT_DRAWING_TOOL_PREFERENCES,
  );
  const [drawingToolPreferencesLoaded, setDrawingToolPreferencesLoaded] = useState(false);
  const [quickDrawingTemplatesOpen, setQuickDrawingTemplatesOpen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [priceScaleLocked, setPriceScaleLocked] = useState(false);
  const [priceScaleInverted, setPriceScaleInverted] = useState(false);
  const priceScaleModeRef = useRef<PriceScaleMode>(priceScaleMode);
  const chartTypeRef = useRef<ChartType>(chartType);
  const indicatorsRef = useRef<readonly ChartIndicatorSeries[]>([]);
  const drawingToolRef = useRef<CanvasDrawingTool>(drawingTool);
  const drawingToolPreferencesRef = useRef<DrawingToolPreferences>(drawingToolPreferences);
  const drawingsRef = useRef<readonly ChartRenderDrawing[]>(drawings);
  const selectedDrawingIdRef = useRef<string | null>(selectedDrawingId);
  const selectedDrawingIdsRef = useRef<readonly string[]>(selectedDrawingIds);
  const drawingUndoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const drawingRedoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const commitDrawingsRef = useRef<(nextDrawings: readonly ChartRenderDrawing[]) => void>(() => {});
  const drawingSequenceRef = useRef(0);
  const drawingPanelLayoutRef = useRef<DrawingPanelLayout>(drawingPanelLayout);
  const drawingPropertiesPanelRef = useRef<HTMLDivElement | null>(null);
  const drawingCoordinatesPanelRef = useRef<HTMLElement | null>(null);
  const drawingPanelDragCleanupRef = useRef<(() => void) | null>(null);
  const drawingSymbolRef = useRef(symbol);
  const autoScaleRef = useRef(autoScale);
  const priceScaleLockedRef = useRef(priceScaleLocked);
  priceScaleModeRef.current = priceScaleMode;
  chartTypeRef.current = chartType;
  drawingToolRef.current = drawingTool;
  drawingToolPreferencesRef.current = drawingToolPreferences;
  drawingPanelLayoutRef.current = drawingPanelLayout;
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
  const ensureDrawingPanelLayoutLoaded = (): void => {
    if (drawingPanelLayoutLoaded) {
      return;
    }

    const layout = loadBrowserDrawingPanelLayout();
    drawingPanelLayoutRef.current = layout;
    setDrawingPanelLayout(layout);
    setDrawingPanelLayoutLoaded(true);
  };
  const commitDrawingPanelLayout = (layout: DrawingPanelLayout): void => {
    drawingPanelLayoutRef.current = layout;
    setDrawingPanelLayout(layout);
    setDrawingPanelLayoutLoaded(true);
    saveBrowserDrawingPanelLayout(layout);
  };
  const handleDrawingPanelPositionChange = (
    panelId: DrawingPanelId,
    position: DrawingPanelPosition,
  ): void => {
    ensureDrawingPanelLayoutLoaded();
    const currentLayout = drawingPanelLayoutRef.current;
    commitDrawingPanelLayout({
      ...currentLayout,
      positions: Object.freeze({ ...currentLayout.positions, [panelId]: position }),
    });
  };
  const handleDrawingPanelVisibilityChange = (
    panelId: DrawingPanelId,
    visible: boolean,
  ): void => {
    ensureDrawingPanelLayoutLoaded();
    const currentLayout = drawingPanelLayoutRef.current;
    commitDrawingPanelLayout({
      ...currentLayout,
      visible: Object.freeze({ ...currentLayout.visible, [panelId]: visible }),
    });
  };
  const handleDrawingPanelPointerDown = (panelId: DrawingPanelId, event: PointerEvent): void => {
    ensureDrawingPanelLayoutLoaded();
    const panel =
      panelId === 'appearance'
        ? drawingPropertiesPanelRef.current
        : drawingCoordinatesPanelRef.current;

    if (panel === null) {
      return;
    }

    drawingPanelDragCleanupRef.current?.();
    drawingPanelDragCleanupRef.current = startDrawingPanelDrag(
      event,
      panel,
      (position) => handleDrawingPanelPositionChange(panelId, position),
    );
  };
  const updateDrawingSelection = (drawingIds: readonly string[]): void => {
    ensureDrawingPanelLayoutLoaded();
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
              ...drawingToolPreferencesRef.current[gesture.type],
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

  const ensureDrawingToolPreferencesLoaded = (): void => {
    if (drawingToolPreferencesLoaded) {
      return;
    }

    const preferences = loadBrowserDrawingToolPreferences();
    drawingToolPreferencesRef.current = preferences;
    setDrawingToolPreferences(preferences);
    setDrawingToolPreferencesLoaded(true);
  };

  const ensureDrawingTemplatesLoaded = (): void => {
    if (drawingTemplatesLoaded) {
      return;
    }

    setCustomDrawingTemplates(loadBrowserDrawingStyleTemplates());
    setDrawingTemplatesLoaded(true);
  };

  const handleDrawingToolChange = (nextTool: CanvasDrawingTool): void => {
    if (nextTool !== 'cursor' && nextTool !== 'select') {
      ensureDrawingToolPreferencesLoaded();
    }

    drawingToolRef.current = nextTool;
    setDrawingTool(nextTool);
  };

  const handleSelectedDrawingUpdate = (
    updates: Partial<Pick<ChartRenderDrawing, 'color' | 'lineWidth' | 'lineStyle'>>,
  ): void => {
    ensureDrawingToolPreferencesLoaded();
    const selectedIds = new Set(selectedDrawingIdsRef.current);
    const selectedToolTypes = new Set<DrawingToolType>(
      drawingsRef.current
        .filter((drawing) => selectedIds.has(drawing.id))
        .map((drawing) => drawing.type),
    );

    if (selectedIds.size === 0 && drawingTool !== 'cursor' && drawingTool !== 'select') {
      selectedToolTypes.add(drawingTool);
    }

    if (selectedIds.size > 0) {
      const nextDrawings = drawingsRef.current.map((drawing) =>
        selectedIds.has(drawing.id) ? Object.freeze({ ...drawing, ...updates }) : drawing,
      );
      commitDrawingsRef.current(nextDrawings);
    }

    if (selectedToolTypes.size > 0) {
      const nextPreferences = { ...drawingToolPreferencesRef.current };

      for (const tool of selectedToolTypes) {
        nextPreferences[tool] = Object.freeze({
          ...nextPreferences[tool],
          ...updates,
        });
      }

      const frozenPreferences = Object.freeze(nextPreferences);
      drawingToolPreferencesRef.current = frozenPreferences;
      setDrawingToolPreferences(frozenPreferences);
      setDrawingToolPreferencesLoaded(true);
      saveBrowserDrawingToolPreferences(frozenPreferences);
    }
  };

  const handleSelectedDrawingAnchorUpdate = (
    target: 'start' | 'end',
    updates: Partial<ChartRenderDrawing['start']>,
  ): void => {
    if (
      selectedDrawingIdRef.current === null ||
      selectedDrawingIdsRef.current.length !== 1 ||
      (updates.price !== undefined && !Number.isFinite(updates.price)) ||
      (updates.timestamp !== undefined &&
        (!Number.isFinite(updates.timestamp) || updates.timestamp <= 0))
    ) {
      return;
    }

    const selectedId = selectedDrawingIdRef.current;
    const nextDrawings = drawingsRef.current.map((drawing) => {
      if (drawing.id !== selectedId || (target === 'end' && drawing.end === null)) {
        return drawing;
      }

      if (target === 'start') {
        return Object.freeze({
          ...drawing,
          start: Object.freeze({ ...drawing.start, ...updates }),
        });
      }

      return Object.freeze({
        ...drawing,
        end: Object.freeze({ ...drawing.end!, ...updates }),
      });
    });

    commitDrawingsRef.current(nextDrawings);
  };

  const handleQuickDrawingTemplateApply = (template: DrawingStyleTemplate): void => {
    setSelectedDrawingTemplateId(template.id);
    handleSelectedDrawingUpdate({
      color: template.color,
      lineWidth: template.lineWidth,
      lineStyle: template.lineStyle,
    });
  };

  const toLocalDateTimeValue = (timestamp: number): string => {
    const date = new Date(timestamp);
    return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };

  const handleToggleDrawingTemplates = (): void => {
    ensureDrawingTemplatesLoaded();
    setDrawingTemplatesExpanded(!drawingTemplatesExpanded);
    setDrawingTemplateError(null);
  };

  const handleApplyDrawingTemplate = (): void => {
    const template = drawingStyleTemplates.find(
      (candidate) => candidate.id === selectedDrawingTemplateId,
    );

    if (template === undefined) {
      return;
    }

    handleSelectedDrawingUpdate({
      color: template.color,
      lineWidth: template.lineWidth,
      lineStyle: template.lineStyle,
    });
  };

  const handleSaveDrawingTemplate = (): void => {
    if (selectedDrawing === null) {
      return;
    }

    const template = createDrawingStyleTemplate(
      'custom-' + crypto.randomUUID(),
      newDrawingTemplateName,
      {
        color: selectedDrawing.color,
        lineWidth: selectedDrawing.lineWidth ?? 1.5,
        lineStyle: selectedDrawing.lineStyle ?? 'solid',
      },
    );

    if (template === null) {
      setDrawingTemplateError('Escribe un nombre de hasta 32 caracteres.');
      return;
    }

    const nextTemplates = [
      ...customDrawingTemplates.filter(
        (candidate) => candidate.name.toLowerCase() !== template.name.toLowerCase(),
      ),
      template,
    ].slice(-MAX_CUSTOM_DRAWING_TEMPLATES);

    setCustomDrawingTemplates(nextTemplates);
    saveBrowserDrawingStyleTemplates(nextTemplates);
    setSelectedDrawingTemplateId(template.id);
    setNewDrawingTemplateName('');
    setDrawingTemplateError(null);
  };

  const handleDeleteDrawingTemplate = (): void => {
    const nextTemplates = customDrawingTemplates.filter(
      (template) => template.id !== selectedDrawingTemplateId,
    );

    setCustomDrawingTemplates(nextTemplates);
    saveBrowserDrawingStyleTemplates(nextTemplates);
    setSelectedDrawingTemplateId('builtin-blue');
    setDrawingTemplateError(null);
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
  const drawingStyleTemplates = [...BUILT_IN_DRAWING_STYLE_TEMPLATES, ...customDrawingTemplates];
  const selectedDrawingHasSingleSelection =
    selectedDrawing !== null && selectedDrawingIds.length === 1;

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
        <div class="relative z-30">
          <button
            type="button"
            aria-label="Plantillas rápidas de dibujo"
            aria-expanded={quickDrawingTemplatesOpen}
            title="Plantillas rápidas de dibujo"
            data-testid="drawing-template-quick-toggle"
            onClick={() => {
              ensureDrawingTemplatesLoaded();
              setQuickDrawingTemplatesOpen(!quickDrawingTemplatesOpen);
            }}
            class="grid size-8 place-items-center rounded text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            ◈
          </button>
          {quickDrawingTemplatesOpen && (
            <div
              data-testid="drawing-template-quick-menu"
              class="absolute left-full top-0 ml-2 w-48 rounded-xl border border-white/10 bg-[#101723]/98 p-2 shadow-2xl"
            >
              <div class="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Estilos rápidos
              </div>
              <div class="space-y-1">
                {drawingStyleTemplates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    data-testid={'drawing-template-quick-' + template.id}
                    disabled={
                      selectedDrawingIds.length === 0 &&
                      (drawingTool === 'cursor' || drawingTool === 'select')
                    }
                    onClick={() => handleQuickDrawingTemplateApply(template)}
                    class={
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] transition-colors ' +
                      (selectedDrawingTemplateId === template.id
                        ? 'bg-blue-500/15 text-blue-100'
                        : 'text-slate-300 hover:bg-white/5') +
                      ' disabled:cursor-not-allowed disabled:opacity-30'
                    }
                  >
                    <span
                      class="size-2.5 shrink-0 rounded-full border border-white/20"
                      style={{ backgroundColor: template.color }}
                    />
                    <span class="min-w-0 flex-1 truncate">{template.name}</span>
                    <span class="text-[9px] text-slate-500">{template.lineWidth}px</span>
                  </button>
                ))}
              </div>
              <p class="mt-2 border-t border-white/10 px-1 pt-2 text-[9px] leading-relaxed text-slate-500">
                Aplica el estilo a la selección o cambia el predeterminado de la herramienta activa.
              </p>
            </div>
          )}
        </div>
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
          data-selected-drawing-type={selectedDrawing?.type ?? ''}
          data-selected-drawing-start-price={
            selectedDrawing === null ? '' : String(selectedDrawing.start.price)
          }
          data-selected-drawing-end-price={
            selectedDrawing?.end === null || selectedDrawing === null
              ? ''
              : String(selectedDrawing.end.price)
          }
          data-selected-drawing-start-timestamp={
            selectedDrawing === null ? '' : String(selectedDrawing.start.timestamp)
          }
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
        {selectedDrawing !== null && (
          <div class="absolute left-4 top-12 z-30 flex items-center gap-1">
            <button
              type="button"
              aria-label="Mostrar u ocultar panel de estilo"
              aria-pressed={drawingPanelLayout.visible.appearance}
              data-testid="drawing-panel-toggle-appearance"
              onClick={() =>
                handleDrawingPanelVisibilityChange(
                  'appearance',
                  !drawingPanelLayout.visible.appearance,
                )
              }
              class={
                'rounded border px-2 py-1 text-[10px] shadow-lg ' +
                (drawingPanelLayout.visible.appearance
                  ? 'border-blue-400/30 bg-blue-500/20 text-blue-200'
                  : 'border-white/10 bg-[#101723]/95 text-slate-400 hover:text-slate-200')
              }
            >
              Estilo
            </button>
            {selectedDrawingHasSingleSelection && (
              <button
                type="button"
                aria-label="Mostrar u ocultar panel de coordenadas"
                aria-pressed={drawingPanelLayout.visible.coordinates}
                data-testid="drawing-panel-toggle-coordinates"
                onClick={() =>
                  handleDrawingPanelVisibilityChange(
                    'coordinates',
                    !drawingPanelLayout.visible.coordinates,
                  )
                }
                class={
                  'rounded border px-2 py-1 text-[10px] shadow-lg ' +
                  (drawingPanelLayout.visible.coordinates
                    ? 'border-blue-400/30 bg-blue-500/20 text-blue-200'
                    : 'border-white/10 bg-[#101723]/95 text-slate-400 hover:text-slate-200')
                }
              >
                Coordenadas
              </button>
            )}
          </div>
        )}
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
        {selectedDrawingHasSingleSelection &&
          selectedDrawing !== null &&
          drawingPanelLayout.visible.coordinates && (
            <section
              ref={drawingCoordinatesPanelRef}
              data-testid="drawing-coordinate-panel"
              aria-label="Coordenadas del dibujo"
              class="absolute left-3 top-24 z-20 w-56 rounded-xl border border-white/10 bg-[#101723]/95 p-3 shadow-xl backdrop-blur"
              style={
                drawingPanelLayout.positions.coordinates === null
                  ? undefined
                  : {
                      left: drawingPanelLayout.positions.coordinates.left,
                      top: drawingPanelLayout.positions.coordinates.top,
                      right: 'auto',
                      bottom: 'auto',
                    }
              }
            >
            <div class="mb-2 flex items-center gap-2">
              <div
                data-testid="drawing-coordinate-drag-handle"
                onPointerDown={(event) => handleDrawingPanelPointerDown('coordinates', event)}
                class="min-w-0 flex-1 cursor-grab touch-none rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 active:cursor-grabbing"
              >
                {selectedDrawing.type === 'horizontal-line'
                  ? 'Nivel de precio'
                  : selectedDrawing.type === 'vertical-line'
                    ? 'Marca temporal'
                    : selectedDrawing.type === 'rectangle'
                      ? 'Límites del rectángulo'
                      : 'Puntos de anclaje'}
              </div>
              <button
                type="button"
                aria-label="Ocultar panel de coordenadas"
                data-testid="drawing-coordinate-close"
                onClick={() => handleDrawingPanelVisibilityChange('coordinates', false)}
                class="grid size-6 shrink-0 place-items-center rounded text-xs text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
            {selectedDrawing.type === 'horizontal-line' && (
              <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
                Precio
                <input
                  type="number"
                  step="any"
                  aria-label="Precio de la línea horizontal"
                  data-testid="drawing-horizontal-price"
                  value={String(selectedDrawing.start.price)}
                  onChange={(event) =>
                    handleSelectedDrawingAnchorUpdate('start', {
                      price: Number(event.currentTarget.value),
                    })
                  }
                  class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
                />
              </label>
            )}
            {selectedDrawing.type === 'vertical-line' && (
              <label class="grid grid-cols-1 gap-1 text-[10px] text-slate-400">
                Fecha y hora local
                <input
                  type="datetime-local"
                  aria-label="Fecha y hora de la línea vertical"
                  data-testid="drawing-vertical-time"
                  value={toLocalDateTimeValue(selectedDrawing.start.timestamp)}
                  onChange={(event) =>
                    handleSelectedDrawingAnchorUpdate('start', {
                      timestamp: new Date(event.currentTarget.value).getTime(),
                    })
                  }
                  class="w-full rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-blue-400"
                />
              </label>
            )}
            {(selectedDrawing.type === 'trend-line' || selectedDrawing.type === 'ray') &&
              selectedDrawing.end !== null && (
                <div class="space-y-2">
                  <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
                    Precio inicial
                    <input
                      type="number"
                      step="any"
                      aria-label="Precio inicial del dibujo"
                      data-testid="drawing-start-price"
                      value={String(selectedDrawing.start.price)}
                      onChange={(event) =>
                        handleSelectedDrawingAnchorUpdate('start', {
                          price: Number(event.currentTarget.value),
                        })
                      }
                      class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
                    />
                  </label>
                  <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
                    Precio final
                    <input
                      type="number"
                      step="any"
                      aria-label="Precio final del dibujo"
                      data-testid="drawing-end-price"
                      value={String(selectedDrawing.end.price)}
                      onChange={(event) =>
                        handleSelectedDrawingAnchorUpdate('end', {
                          price: Number(event.currentTarget.value),
                        })
                      }
                      class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
                    />
                  </label>
                </div>
              )}
            {selectedDrawing.type === 'rectangle' && selectedDrawing.end !== null && (
              <div class="space-y-2">
                <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
                  Precio del primer punto
                  <input
                    type="number"
                    step="any"
                    aria-label="Precio del primer punto del rectángulo"
                    data-testid="drawing-rectangle-start-price"
                    value={String(selectedDrawing.start.price)}
                    onChange={(event) =>
                      handleSelectedDrawingAnchorUpdate('start', {
                        price: Number(event.currentTarget.value),
                      })
                    }
                    class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
                  />
                </label>
                <label class="grid grid-cols-[1fr_auto] items-center gap-2 text-[10px] text-slate-400">
                  Precio del segundo punto
                  <input
                    type="number"
                    step="any"
                    aria-label="Precio del segundo punto del rectángulo"
                    data-testid="drawing-rectangle-end-price"
                    value={String(selectedDrawing.end.price)}
                    onChange={(event) =>
                      handleSelectedDrawingAnchorUpdate('end', {
                        price: Number(event.currentTarget.value),
                      })
                    }
                    class="w-28 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-right text-[10px] text-slate-200 outline-none focus:border-blue-400"
                  />
                </label>
              </div>
            )}
            </section>
          )}
        {selectedDrawing !== null && drawingPanelLayout.visible.appearance && (
          <div
            ref={drawingPropertiesPanelRef}
            data-testid="drawing-properties-panel"
            class="absolute bottom-10 left-3 z-20 w-64 rounded-xl border border-white/10 bg-[#101723]/95 p-3 shadow-2xl backdrop-blur"
            style={
              drawingPanelLayout.positions.appearance === null
                ? undefined
                : {
                    left: drawingPanelLayout.positions.appearance.left,
                    top: drawingPanelLayout.positions.appearance.top,
                    right: 'auto',
                    bottom: 'auto',
                  }
            }
          >
            <div class="mb-3 flex items-center gap-2">
              <div
                data-testid="drawing-properties-drag-handle"
                class="flex min-w-0 flex-1 cursor-grab items-center gap-2 touch-none rounded px-1 py-1 text-[11px] font-semibold text-slate-200 active:cursor-grabbing"
                onPointerDown={(event) => handleDrawingPanelPointerDown('appearance', event)}
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
                aria-label="Ocultar panel de estilo"
                data-testid="drawing-editor-close"
                onClick={() => handleDrawingPanelVisibilityChange('appearance', false)}
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
            <div class="mt-3 border-t border-white/10 pt-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Plantillas
                </span>
                <button
                  type="button"
                  data-testid="drawing-templates-toggle"
                  aria-expanded={drawingTemplatesExpanded}
                  onClick={handleToggleDrawingTemplates}
                  class="rounded px-2 py-1 text-[10px] text-blue-300 transition-colors hover:bg-blue-400/10"
                >
                  {drawingTemplatesExpanded ? 'Ocultar' : 'Gestionar'}
                </button>
              </div>
              {drawingTemplatesExpanded && (
                <div class="mt-2 space-y-2" data-testid="drawing-templates-manager">
                  <select
                    aria-label="Plantilla de dibujo"
                    data-testid="drawing-template-select"
                    value={selectedDrawingTemplateId}
                    onChange={(event) => setSelectedDrawingTemplateId(event.currentTarget.value)}
                    class="w-full rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none focus:border-blue-400"
                  >
                    {drawingStyleTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      data-testid="drawing-template-apply"
                      onClick={handleApplyDrawingTemplate}
                      class="flex-1 rounded bg-blue-500/15 px-2 py-1.5 text-[10px] font-medium text-blue-200 hover:bg-blue-500/25"
                    >
                      Aplicar
                    </button>
                    {customDrawingTemplates.some(
                      (template) => template.id === selectedDrawingTemplateId,
                    ) && (
                      <button
                        type="button"
                        data-testid="drawing-template-delete"
                        aria-label="Eliminar plantilla personalizada"
                        onClick={handleDeleteDrawingTemplate}
                        class="rounded bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200 hover:bg-rose-500/20"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      aria-label="Nombre de la nueva plantilla"
                      data-testid="drawing-template-name"
                      maxLength={32}
                      value={newDrawingTemplateName}
                      onInput={(event) => {
                        setNewDrawingTemplateName(event.currentTarget.value);
                        setDrawingTemplateError(null);
                      }}
                      placeholder="Guardar estilo actual…"
                      class="min-w-0 flex-1 rounded border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-[10px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-blue-400"
                    />
                    <button
                      type="button"
                      data-testid="drawing-template-save"
                      disabled={newDrawingTemplateName.trim().length === 0}
                      onClick={handleSaveDrawingTemplate}
                      class="rounded bg-white/10 px-2 py-1.5 text-[10px] font-medium text-slate-200 hover:bg-white/15 disabled:opacity-30"
                    >
                      Guardar
                    </button>
                  </div>
                  {drawingTemplateError !== null && (
                    <p role="alert" class="text-[10px] text-rose-300">
                      {drawingTemplateError}
                    </p>
                  )}
                  <p class="text-[9px] leading-relaxed text-slate-500">
                    Las plantillas personalizadas se guardan en este navegador y se aplican a toda
                    la selección.
                  </p>
                </div>
              )}
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
