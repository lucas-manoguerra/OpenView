import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Candle } from '@openview/market-domain';
import type { CandleInterval } from '@openview/market-data';
import { ChartTypeSelector, PriceScaleSelector, type ChartControlOption } from './ui';
import { DrawingToolCatalogMenu } from './DrawingToolCatalogMenu';
import { DrawingPropertiesPanel } from './drawings/DrawingPropertiesPanel';
import { DrawingCoordinatesPanel } from './drawings/DrawingCoordinatesPanel';
import {
  DEFAULT_DRAWING_INTERACTION_PREFERENCES,
  loadBrowserDrawingInteractionPreferences,
  saveBrowserDrawingInteractionPreferences,
} from '../drawings/drawing-interaction-preferences';
import {
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
  type ChartDrawingHit,
  type CanvasDrawingGroupEditGesture,
  type CanvasDrawingAreaSelection,
  type CanvasDrawingGesture,
  type CanvasDrawingTool,
  attachCanvasResizeObserver,
  createChartFrame,
  createChartInteractionController,
  createChartRenderScene,
  createChart,
  type ChartApi,
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
  type ChartDrawingMagnetMode,
  type ChartDrawingSelectionArea,
  type CanvasDrawingNudgeDirection,
  type NumericRange,
  type PriceScaleMode,
} from '@openview/chart-engine';

type ChartCanvasProps = Readonly<{
  candles: readonly Candle[];
  priceIncrement: number | null;
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
  setDrawingsVisible(visible: boolean): void;
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

const CHART_TYPE_OPTIONS: readonly ChartControlOption[] = [
  { value: 'candles', label: 'Velas' },
  { value: 'bars', label: 'Barras' },
  { value: 'line', label: 'Línea' },
  { value: 'area', label: 'Área' },
];

const PRICE_SCALE_OPTIONS: readonly ChartControlOption[] = [
  { value: 'linear', label: 'Lin', ariaLabel: 'Escala linear' },
  { value: 'logarithmic', label: 'Log', ariaLabel: 'Escala logarithmic' },
  { value: 'percentage', label: '%', ariaLabel: 'Escala percentage' },
  { value: 'indexed-to-100', label: '100', ariaLabel: 'Escala indexed-to-100' },
];

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
  priceIncrement,
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
  const [drawingSelectionArea, setDrawingSelectionArea] =
    useState<CanvasDrawingAreaSelection | null>(null);
  const [drawingUndoCount, setDrawingUndoCount] = useState(0);
  const [drawingRedoCount, setDrawingRedoCount] = useState(0);
  const [drawingPanelLayout, setDrawingPanelLayout] = useState<DrawingPanelLayout>(
    DEFAULT_DRAWING_PANEL_LAYOUT,
  );

  const [customDrawingTemplates, setCustomDrawingTemplates] = useState<
    readonly DrawingStyleTemplate[]
  >([]);
  const [drawingTemplatesExpanded, setDrawingTemplatesExpanded] = useState(false);
  const [drawingTemplatesLoaded, setDrawingTemplatesLoaded] = useState(false);
  const [selectedDrawingTemplateId, setSelectedDrawingTemplateId] = useState('default');
  const [newDrawingTemplateName, setNewDrawingTemplateName] = useState('');
  const [drawingTemplateError, setDrawingTemplateError] = useState<string | null>(null);
  const [drawingToolPreferences, setDrawingToolPreferences] = useState<DrawingToolPreferences>(
    DEFAULT_DRAWING_TOOL_PREFERENCES,
  );
  const [drawingToolPreferencesLoaded, setDrawingToolPreferencesLoaded] = useState(false);
  const [drawingMagnetMode, setDrawingMagnetMode] = useState<ChartDrawingMagnetMode>(
    DEFAULT_DRAWING_INTERACTION_PREFERENCES.magnetMode,
  );
  const [snapToIndicators, setSnapToIndicators] = useState(
    DEFAULT_DRAWING_INTERACTION_PREFERENCES.snapToIndicators,
  );
  const [keepDrawing, setKeepDrawing] = useState(
    DEFAULT_DRAWING_INTERACTION_PREFERENCES.keepDrawing,
  );
  const [drawingsVisible, setDrawingsVisible] = useState(true);
  const [drawingObjectTreeOpen, setDrawingObjectTreeOpen] = useState(false);
  const [drawingInteractionPreferencesLoaded, setDrawingInteractionPreferencesLoaded] =
    useState(false);
  const [drawingMagnetMenuOpen, setDrawingMagnetMenuOpen] = useState(false);
  const [quickDrawingTemplatesOpen, setQuickDrawingTemplatesOpen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [priceScaleLocked, setPriceScaleLocked] = useState(false);
  const [priceScaleInverted, setPriceScaleInverted] = useState(false);
  const priceScaleModeRef = useRef<PriceScaleMode>(priceScaleMode);
  const chartTypeRef = useRef<ChartType>(chartType);
  const indicatorsRef = useRef<readonly ChartIndicatorSeries[]>([]);
  const drawingToolRef = useRef<CanvasDrawingTool>(drawingTool);
  const drawingToolPreferencesRef = useRef<DrawingToolPreferences>(drawingToolPreferences);
  const priceIncrementRef = useRef<number | null>(priceIncrement);
  const drawingMagnetModeRef = useRef<ChartDrawingMagnetMode>(drawingMagnetMode);
  const snapToIndicatorsRef = useRef(snapToIndicators);
  const keepDrawingRef = useRef(keepDrawing);
  const drawingsVisibleRef = useRef(drawingsVisible);
  const drawingsRef = useRef<readonly ChartRenderDrawing[]>(drawings);
  const renderableDrawingsRef = useRef<readonly ChartRenderDrawing[]>(drawings);
  const selectedDrawingIdRef = useRef<string | null>(selectedDrawingId);
  const selectedDrawingIdsRef = useRef<readonly string[]>(selectedDrawingIds);
  const drawingUndoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const drawingRedoStackRef = useRef<readonly (readonly ChartRenderDrawing[])[]>([]);
  const commitDrawingsRef = useRef<(nextDrawings: readonly ChartRenderDrawing[]) => void>(() => {});
  const drawingSequenceRef = useRef(0);
  const drawingPanelLayoutRef = useRef<DrawingPanelLayout>(drawingPanelLayout);
  const drawingPanelLayoutLoadedRef = useRef(false);
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
  priceIncrementRef.current = priceIncrement;
  drawingMagnetModeRef.current = drawingMagnetMode;
  snapToIndicatorsRef.current = snapToIndicators;
  keepDrawingRef.current = keepDrawing;
  drawingsVisibleRef.current = drawingsVisible;
  drawingsRef.current = drawings;
  renderableDrawingsRef.current = drawingsVisible
    ? drawings.filter((drawing) => drawing.visible !== false)
    : [];
  selectedDrawingIdRef.current = selectedDrawingId;
  selectedDrawingIdsRef.current = selectedDrawingIds;
  commitDrawingsRef.current = (nextDrawings): void => {
    const previousDrawings = drawingsRef.current;
    const nextUndoStack = [...drawingUndoStackRef.current, previousDrawings].slice(-50);
    drawingUndoStackRef.current = Object.freeze(nextUndoStack);
    drawingRedoStackRef.current = Object.freeze([]);
    drawingsRef.current = Object.freeze([...nextDrawings]);
    renderableDrawingsRef.current = drawingsVisibleRef.current
      ? drawingsRef.current.filter((drawing) => drawing.visible !== false)
      : [];
    setDrawings(drawingsRef.current);
    setDrawingUndoCount(drawingUndoStackRef.current.length);
    setDrawingRedoCount(0);
    runtimeRef.current?.setDrawings(drawingsRef.current);
  };
  const ensureDrawingPanelLayoutLoaded = (): void => {
    if (drawingPanelLayoutLoadedRef.current) {
      return;
    }

    const layout = loadBrowserDrawingPanelLayout();
    drawingPanelLayoutRef.current = layout;
    drawingPanelLayoutLoadedRef.current = true;
    setDrawingPanelLayout(layout);
  };
  const commitDrawingPanelLayout = (layout: DrawingPanelLayout): void => {
    drawingPanelLayoutRef.current = layout;
    drawingPanelLayoutLoadedRef.current = true;
    setDrawingPanelLayout(layout);
    saveBrowserDrawingPanelLayout(layout);
  };
  const handleDrawingPanelPositionChange = (
    panelId: DrawingPanelId,
    position: DrawingPanelPosition,
  ): void => {
    ensureDrawingPanelLayoutLoaded();
    const currentLayout = drawingPanelLayoutRef.current;
    const nextLayout = {
      ...currentLayout,
      positions: Object.freeze({ ...currentLayout.positions, [panelId]: position }),
    };
    drawingPanelLayoutRef.current = nextLayout;
    setDrawingPanelLayout(nextLayout);
  };
  const handleDrawingPanelVisibilityChange = (panelId: DrawingPanelId, visible: boolean): void => {
    ensureDrawingPanelLayoutLoaded();
    const currentLayout = drawingPanelLayoutRef.current;
    commitDrawingPanelLayout({
      ...currentLayout,
      visible: Object.freeze({ ...currentLayout.visible, [panelId]: visible }),
    });
  };
  const attachDrawingPanelElement = (
    panelId: DrawingPanelId,
    element: HTMLElement | null,
  ): void => {
    const panelRef =
      panelId === 'appearance' ? drawingPropertiesPanelRef : drawingCoordinatesPanelRef;
    panelRef.current = element;

    if (element === null) {
      return;
    }

    const position = drawingPanelLayoutRef.current.positions[panelId];

    if (position !== null) {
      const parent = element.parentElement;
      const maxLeft =
        parent === null || parent.clientWidth <= 0
          ? position.left
          : Math.max(0, parent.clientWidth - element.offsetWidth);
      const maxTop =
        parent === null || parent.clientHeight <= 0
          ? position.top
          : Math.max(0, parent.clientHeight - element.offsetHeight);
      const left = Math.max(0, Math.min(maxLeft, position.left));
      const top = Math.max(0, Math.min(maxTop, position.top));
      element.style.left = String(left) + 'px';
      element.style.top = String(top) + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }
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
      () => saveBrowserDrawingPanelLayout(drawingPanelLayoutRef.current),
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
      drawingPanelDragCleanupRef.current?.();
      drawingPanelDragCleanupRef.current = null;
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      return;
    }

    if (runtimeRef.current !== null) {
      return;
    }

    let chartApi: ChartApi | null = null;
    let currentCandles = renderDataRef.current.candles;
    let controller: ChartInteractionController | null = null;
    let scene: ChartRenderScene | null = null;
    let pointerAdapter: CanvasPointerAdapter | null = null;
    let lastSize: CanvasResize | null = null;

    const publishScene = (nextScene: ChartRenderScene): void => {
      scene = nextScene;
      if (chartApi === null) {
        chartApi = createChart({ surface: canvas, initialScene: nextScene });
        chartApi.subscribe((event) => {
          if (event.type !== 'drawing-state-changed') {
            return;
          }
          if (scene !== null) {
            scene = updateChartRenderScene(scene, {
              drawings: event.drawings,
              selectedDrawingId: event.selectedDrawingId,
              selectedDrawingIds: event.selectedDrawingIds,
            });
          }
          drawingsRef.current = event.drawings;
          renderableDrawingsRef.current = drawingsVisibleRef.current
            ? event.drawings.filter((drawing) => drawing.visible !== false)
            : [];
          selectedDrawingIdRef.current = event.selectedDrawingId;
          selectedDrawingIdsRef.current = event.selectedDrawingIds;
          setDrawings(event.drawings);
          setSelectedDrawingId(event.selectedDrawingId);
          setSelectedDrawingIds(event.selectedDrawingIds);
        });
        if (lastSize !== null) {
          chartApi.execute({
            type: 'resize',
            width: lastSize.width,
            height: lastSize.height,
            devicePixelRatio: lastSize.devicePixelRatio,
          });
        }
        return;
      }
      chartApi.execute({ type: 'set-scene', scene: nextScene });
    };

    const handleControllerChange = (snapshot: ChartInteractionSnapshot): void => {
      if (scene === null) {
        return;
      }

      scene = updateChartRenderScene(scene, {
        frame: snapshot.frame,
        crosshair: snapshot.crosshair,
      });
      publishScene(scene);
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
      chartApi?.execute({
        type: 'resize',
        width: size.width,
        height: size.height,
        devicePixelRatio: size.devicePixelRatio,
      });

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
        publishScene(scene);
        canvas.dataset['rightOffset'] = String(frame.timeScale.rightOffset);
        canvas.dataset['followLatest'] = String(frame.timeScale.rightOffset >= 0);
        canvas.dataset['navigationMode'] =
          frame.timeScale.rightOffset >= 0 ? 'realtime' : 'historical';
        pointerAdapter = attachCanvasPointerEvents(canvas, interactionController, {
          getAutoScalePriceRange: () => getVisiblePriceRange(interactionController, currentCandles),
          getDrawingTool: () => drawingToolRef.current,
          getDrawingMagnetMode: () => drawingMagnetModeRef.current,
          getSnapToIndicators: () => snapToIndicatorsRef.current,
          getIndicators: () => indicatorsRef.current,
          getKeepDrawing: () => keepDrawingRef.current,
          getDrawings: () => renderableDrawingsRef.current,
          getCandles: () => currentCandles,
          getSelectedDrawingId: () => selectedDrawingIdRef.current,
          getSelectedDrawingIds: () => selectedDrawingIdsRef.current,
          hitTestDrawing: (point, tolerance) => chartApi?.hitTestDrawing(point, tolerance) ?? null,
          getPriceIncrement: () => priceIncrementRef.current,
          onDrawingNudge: (direction: CanvasDrawingNudgeDirection): void => {
            handleSelectedDrawingsNudge(direction, currentCandles);
          },
          onDrawingSelectionChange: (drawingIds: readonly string[]): void => {
            updateDrawingSelection(drawingIds);
          },
          onDrawingHover: (hit: ChartDrawingHit | null): void => {
            canvas.style.cursor = hit === null ? '' : hit.target === 'body' ? 'move' : 'crosshair';
            chartApi?.execute({ type: 'set-drawing-hover', hit });
          },
          onDrawingAreaSelectionChange: (selection: CanvasDrawingAreaSelection | null): void => {
            setDrawingSelectionArea(selection);
          },
          onDrawingAreaSelectionComplete: (area: ChartDrawingSelectionArea): void => {
            updateDrawingSelection(chartApi?.selectDrawingsWithinArea(area) ?? []);
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
          onDrawingEditPreview: (gesture: CanvasDrawingEditGesture | null): void => {
            if (scene === null) {
              return;
            }

            if (gesture === null) {
              scene = updateChartRenderScene(scene, {
                drawings: drawingsRef.current,
              });
              publishScene(scene);
              return;
            }

            const drawing = drawingsRef.current.find(
              (candidate) => candidate.id === gesture.drawingId,
            );
            if (drawing === undefined) {
              return;
            }

            const previewDrawing = updateChartDrawing(
              drawing,
              gesture.target,
              gesture.origin,
              gesture.current,
              currentCandles,
            );
            const previewDrawings = drawingsRef.current.map((candidate) =>
              candidate.id === gesture.drawingId ? previewDrawing : candidate,
            );
            scene = updateChartRenderScene(scene, {
              drawings: previewDrawings,
            });
            publishScene(scene);
          },
          onDrawingGroupEditPreview: (gesture: CanvasDrawingGroupEditGesture | null): void => {
            if (scene === null) {
              return;
            }

            if (gesture === null) {
              scene = updateChartRenderScene(scene, {
                drawings: drawingsRef.current,
              });
              publishScene(scene);
              return;
            }

            const selectedIds = new Set(gesture.drawingIds);
            const previewDrawings = drawingsRef.current.map((drawing) =>
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
            scene = updateChartRenderScene(scene, {
              drawings: previewDrawings,
            });
            publishScene(scene);
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
          onDrawingToolExit: (): void => {
            drawingToolRef.current = 'cursor';
            setDrawingTool('cursor');
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
        publishScene(scene);
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
        publishScene(scene);
      },
      setIndicators: (nextIndicators: readonly ChartIndicatorSeries[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { indicators: nextIndicators });
        publishScene(scene);
      },
      setDrawings: (nextDrawings: readonly ChartRenderDrawing[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { drawings: nextDrawings });
        chartApi?.execute({ type: 'set-drawings', drawings: nextDrawings });
      },
      setDrawingsVisible: (visible: boolean): void => {
        chartApi?.execute({ type: 'set-drawings-visible', visible });
      },
      setSelectedDrawingId: (drawingId: string | null): void => {
        if (scene === null) {
          return;
        }

        const drawingIds = drawingId === null ? [] : [drawingId];
        scene = updateChartRenderScene(scene, {
          selectedDrawingId: drawingId,
          selectedDrawingIds: drawingIds,
        });
        chartApi?.execute({ type: 'set-drawing-selection', drawingIds });
      },
      setSelectedDrawingIds: (drawingIds: readonly string[]): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, {
          selectedDrawingId: drawingIds[drawingIds.length - 1] ?? null,
          selectedDrawingIds: drawingIds,
        });
        chartApi?.execute({ type: 'set-drawing-selection', drawingIds });
      },
      setChartType: (nextChartType: ChartType): void => {
        if (scene === null) {
          return;
        }

        scene = updateChartRenderScene(scene, { chartType: nextChartType });
        publishScene(scene);
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
        publishScene(scene);
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
        chartApi?.destroy();
        chartApi = null;
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

  const ensureDrawingInteractionPreferencesLoaded = (): void => {
    if (drawingInteractionPreferencesLoaded) {
      return;
    }

    const preferences = loadBrowserDrawingInteractionPreferences();
    drawingMagnetModeRef.current = preferences.magnetMode;
    snapToIndicatorsRef.current = preferences.snapToIndicators;
    keepDrawingRef.current = preferences.keepDrawing;
    setDrawingMagnetMode(preferences.magnetMode);
    setSnapToIndicators(preferences.snapToIndicators);
    setKeepDrawing(preferences.keepDrawing);
    setDrawingInteractionPreferencesLoaded(true);
  };

  const persistDrawingInteractionPreferences = (
    magnetMode = drawingMagnetModeRef.current,
    snapIndicators = snapToIndicatorsRef.current,
    keepDrawingValue = keepDrawingRef.current,
  ): void => {
    saveBrowserDrawingInteractionPreferences({
      magnetMode,
      snapToIndicators: snapIndicators,
      keepDrawing: keepDrawingValue,
    });
  };

  const handleDrawingMagnetModeChange = (mode: ChartDrawingMagnetMode): void => {
    drawingMagnetModeRef.current = mode;
    setDrawingMagnetMode(mode);
    setDrawingInteractionPreferencesLoaded(true);
    persistDrawingInteractionPreferences(mode);
    setDrawingMagnetMenuOpen(false);
  };

  const handleSnapToIndicatorsChange = (): void => {
    const nextValue = !snapToIndicatorsRef.current;
    snapToIndicatorsRef.current = nextValue;
    setSnapToIndicators(nextValue);
    setDrawingInteractionPreferencesLoaded(true);
    persistDrawingInteractionPreferences(drawingMagnetModeRef.current, nextValue);
  };

  const handleDrawingMagnetMenuToggle = (): void => {
    ensureDrawingInteractionPreferencesLoaded();
    setDrawingMagnetMenuOpen((open) => !open);
  };

  const handleKeepDrawingToggle = (): void => {
    ensureDrawingInteractionPreferencesLoaded();
    const nextValue = !keepDrawingRef.current;
    keepDrawingRef.current = nextValue;
    setKeepDrawing(nextValue);
    setDrawingInteractionPreferencesLoaded(true);
    persistDrawingInteractionPreferences(
      drawingMagnetModeRef.current,
      snapToIndicatorsRef.current,
      nextValue,
    );
  };

  const ensureDrawingTemplatesLoaded = (): void => {
    if (drawingTemplatesLoaded) {
      return;
    }

    setCustomDrawingTemplates(loadBrowserDrawingStyleTemplates());
    setDrawingTemplatesLoaded(true);
  };

  const handleDrawingToolChange = (nextTool: CanvasDrawingTool): void => {
    if (nextTool !== 'cursor') {
      ensureDrawingInteractionPreferencesLoaded();
    }

    if (nextTool !== 'cursor' && nextTool !== 'select') {
      ensureDrawingToolPreferencesLoaded();
    }

    drawingToolRef.current = nextTool;
    setDrawingTool(nextTool);
  };

  const handleSelectedDrawingsNudge = (
    direction: CanvasDrawingNudgeDirection,
    currentCandles: readonly ChartRenderCandle[],
  ): void => {
    const selectedIds = new Set(selectedDrawingIdsRef.current);

    if (selectedIds.size === 0 && selectedDrawingIdRef.current !== null) {
      selectedIds.add(selectedDrawingIdRef.current);
    }

    if (selectedIds.size === 0) {
      return;
    }

    let logicalDelta = 0;
    let priceDelta = 0;

    if (direction === 'left') {
      logicalDelta = -1;
    } else if (direction === 'right') {
      logicalDelta = 1;
    } else {
      const priceIncrement = priceIncrementRef.current;

      if (priceIncrement === null || !Number.isFinite(priceIncrement) || priceIncrement <= 0) {
        return;
      }

      priceDelta = direction === 'up' ? priceIncrement : -priceIncrement;
    }

    const origin = Object.freeze({ logicalIndex: 0, price: 0 });
    const current = Object.freeze({
      logicalIndex: logicalDelta,
      price: priceDelta,
    });
    const currentDrawings = drawingsRef.current;

    try {
      const nextDrawings = currentDrawings.map((drawing) => {
        if (!selectedIds.has(drawing.id) || drawing.locked === true) {
          return drawing;
        }

        if (
          (drawing.type === 'horizontal-line' && logicalDelta !== 0) ||
          (drawing.type === 'vertical-line' && priceDelta !== 0)
        ) {
          return drawing;
        }

        return updateChartDrawing(drawing, 'body', origin, current, currentCandles);
      });

      if (nextDrawings.some((drawing, index) => drawing !== currentDrawings[index])) {
        commitDrawingsRef.current(nextDrawings);
      }
    } catch {
      return;
    }
  };

  const handleSelectedDrawingUpdate = (
    updates: Partial<
      Pick<
        ChartRenderDrawing,
        | 'color'
        | 'lineWidth'
        | 'lineStyle'
        | 'fillColor'
        | 'fillOpacity'
        | 'extendStart'
        | 'extendEnd'
        | 'startStyle'
        | 'endStyle'
      >
    >,
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

    const preferenceUpdates: Partial<
      Pick<ChartRenderDrawing, 'color' | 'lineWidth' | 'lineStyle'>
    > = {
      ...(updates.color === undefined ? {} : { color: updates.color }),
      ...(updates.lineWidth === undefined ? {} : { lineWidth: updates.lineWidth }),
      ...(updates.lineStyle === undefined ? {} : { lineStyle: updates.lineStyle }),
    };

    if (selectedToolTypes.size > 0 && Object.keys(preferenceUpdates).length > 0) {
      const nextPreferences = { ...drawingToolPreferencesRef.current };

      for (const tool of selectedToolTypes) {
        nextPreferences[tool] = Object.freeze({
          ...nextPreferences[tool],
          ...preferenceUpdates,
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

  const handleToggleDrawingTemplates = (): void => {
    ensureDrawingTemplatesLoaded();
    setDrawingTemplatesExpanded(!drawingTemplatesExpanded);
    setDrawingTemplateError(null);
  };

  const handleApplyDrawingTemplate = (): void => {
    if (selectedDrawingTemplateId === 'default' && activeTemplateTool !== null) {
      handleSelectedDrawingUpdate(DEFAULT_DRAWING_TOOL_PREFERENCES[activeTemplateTool]);
      return;
    }
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

    const templateTool =
      selectedDrawing?.type ??
      (drawingTool === 'cursor' || drawingTool === 'select' ? null : drawingTool);
    if (templateTool === null) return;
    const template = createDrawingStyleTemplate(
      'custom-' + crypto.randomUUID(),
      newDrawingTemplateName,
      templateTool,
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

    const otherToolTemplates = customDrawingTemplates.filter(
      (candidate) => candidate.tool !== template.tool,
    );
    const sameToolTemplates = customDrawingTemplates
      .filter(
        (candidate) =>
          candidate.tool === template.tool &&
          candidate.name.toLowerCase() !== template.name.toLowerCase(),
      )
      .slice(-(MAX_CUSTOM_DRAWING_TEMPLATES - 1));
    const nextTemplates = [...otherToolTemplates, ...sameToolTemplates, template];

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
    setSelectedDrawingTemplateId('');
    setDrawingTemplateError(null);
  };

  const handleClearDrawings = (): void => {
    if (drawingsRef.current.length > 0) {
      commitDrawingsRef.current([]);
      updateDrawingSelection([]);
    }
  };

  const handleSelectDrawingFromObjectTree = (drawingId: string): void => {
    const currentDrawings = drawingsRef.current;
    const drawing = currentDrawings.find((candidate) => candidate.id === drawingId);

    if (drawing === undefined) {
      return;
    }

    if (!drawingsVisibleRef.current) {
      drawingsVisibleRef.current = true;
      setDrawingsVisible(true);
    }

    const nextDrawings = currentDrawings.map((candidate) =>
      candidate.id === drawingId && candidate.visible === false
        ? Object.freeze({ ...candidate, visible: true })
        : candidate,
    );

    if (nextDrawings.some((candidate, index) => candidate !== currentDrawings[index])) {
      commitDrawingsRef.current(nextDrawings);
    } else {
      runtimeRef.current?.setDrawings(currentDrawings);
    }

    drawingToolRef.current = 'select';
    setDrawingTool('select');
    updateDrawingSelection([drawingId]);
  };

  const handleToggleDrawingObjectVisibility = (drawingId: string): void => {
    const currentDrawings = drawingsRef.current;
    const drawing = currentDrawings.find((candidate) => candidate.id === drawingId);

    if (drawing === undefined) {
      return;
    }

    const nextVisible = drawing.visible === false;
    commitDrawingsRef.current(
      currentDrawings.map((candidate) =>
        candidate.id === drawingId
          ? Object.freeze({ ...candidate, visible: nextVisible })
          : candidate,
      ),
    );

    if (!nextVisible) {
      updateDrawingSelection(selectedDrawingIdsRef.current.filter((id) => id !== drawingId));
    }
  };

  const handleToggleDrawingObjectLock = (drawingId: string): void => {
    const currentDrawings = drawingsRef.current;
    const drawing = currentDrawings.find((candidate) => candidate.id === drawingId);

    if (drawing === undefined) {
      return;
    }

    const nextLocked = drawing.locked !== true;
    commitDrawingsRef.current(
      currentDrawings.map((candidate) =>
        candidate.id === drawingId
          ? Object.freeze({ ...candidate, locked: nextLocked })
          : candidate,
      ),
    );

    if (nextLocked) {
      updateDrawingSelection(selectedDrawingIdsRef.current.filter((id) => id !== drawingId));
    }
  };

  const handleDeleteDrawingObject = (drawingId: string): void => {
    const currentDrawings = drawingsRef.current;
    const nextDrawings = currentDrawings.filter((drawing) => drawing.id !== drawingId);

    if (nextDrawings.length === currentDrawings.length) {
      return;
    }

    commitDrawingsRef.current(nextDrawings);
    updateDrawingSelection(selectedDrawingIdsRef.current.filter((id) => id !== drawingId));
  };

  const handleToggleAllDrawingsLock = (): void => {
    const currentDrawings = drawingsRef.current;

    if (currentDrawings.length === 0) {
      return;
    }

    const nextLocked = !currentDrawings.every((drawing) => drawing.locked === true);
    commitDrawingsRef.current(
      currentDrawings.map((drawing) => Object.freeze({ ...drawing, locked: nextLocked })),
    );
    updateDrawingSelection([]);
  };

  const handleToggleDrawingsVisibility = (): void => {
    const nextVisible = !drawingsVisibleRef.current;
    drawingsVisibleRef.current = nextVisible;
    renderableDrawingsRef.current = nextVisible
      ? drawingsRef.current.filter((drawing) => drawing.visible !== false)
      : [];
    setDrawingsVisible(nextVisible);
    runtimeRef.current?.setDrawingsVisible(nextVisible);

    if (!nextVisible) {
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
  const selectedDrawings = drawings.filter((drawing) => selectedDrawingIds.includes(drawing.id));
  const selectedDrawingColors = selectedDrawings.map((drawing) => drawing.color).join(',');
  const selectedDrawingWidths = selectedDrawings
    .map((drawing) => String(drawing.lineWidth ?? 1.5))
    .join(',');
  const selectedDrawingStartPrices = JSON.stringify(
    selectedDrawings.map((drawing) => drawing.start.price),
  );
  const selectedDrawingStartTimestamps = JSON.stringify(
    selectedDrawings.map((drawing) => drawing.start.timestamp),
  );
  const allDrawingsLocked =
    drawings.length > 0 && drawings.every((drawing) => drawing.locked === true);
  const activeTemplateTool =
    selectedDrawing?.type ??
    (drawingTool === 'cursor' || drawingTool === 'select' ? null : drawingTool);
  const drawingStyleTemplates = customDrawingTemplates.filter(
    (template) => template.tool === activeTemplateTool,
  );
  const activeDefaultStyle =
    activeTemplateTool === null ? null : DEFAULT_DRAWING_TOOL_PREFERENCES[activeTemplateTool];
  const selectedDrawingHasSingleSelection =
    selectedDrawing !== null && selectedDrawingIds.length === 1;
  const selectedDrawingsShareType =
    selectedDrawing !== null &&
    selectedDrawingIds.length > 0 &&
    drawings
      .filter((drawing) => selectedDrawingIds.includes(drawing.id))
      .every((drawing) => drawing.type === selectedDrawing.type);

  return (
    <div class="grid h-[390px] min-h-[340px] w-full grid-cols-[38px_minmax(0,1fr)] bg-[#0b0f17]">
      <aside class="relative flex max-h-full min-w-0 flex-col items-center gap-1 overflow-y-auto border-r border-white/10 bg-[#101723] py-2">
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
        <DrawingToolCatalogMenu
          activeTool={drawingTool}
          onSelect={(tool) => handleDrawingToolChange(tool)}
        />
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

        <div class="relative">
          <button
            type="button"
            aria-label="Modo Imán"
            aria-haspopup="menu"
            aria-expanded={drawingMagnetMenuOpen}
            aria-pressed={drawingMagnetMode !== 'off'}
            data-testid="drawing-magnet-toggle"
            title={
              'Modo Imán: ' +
              (drawingMagnetMode === 'strong'
                ? 'Imán fuerte'
                : drawingMagnetMode === 'weak'
                  ? 'Imán débil'
                  : 'Desactivado')
            }
            onClick={handleDrawingMagnetMenuToggle}
            class={
              'grid size-8 place-items-center rounded text-sm transition-colors ' +
              (drawingMagnetMode !== 'off' || drawingMagnetMenuOpen
                ? 'bg-blue-500/20 text-blue-200'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
            }
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              class="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 20V10.5a6 6 0 0 1 12 0V20" />
              <path d="M10 20v-9.5a2 2 0 0 1 4 0V20" />
              <path d="M6 16h4M14 16h4" />
            </svg>
          </button>
          {drawingMagnetMenuOpen && (
            <div
              role="menu"
              aria-label="Modo Imán"
              data-testid="drawing-magnet-menu"
              class="absolute left-full top-0 z-40 ml-2 w-48 rounded-lg border border-white/10 bg-[#101723] p-1.5 shadow-xl"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={drawingMagnetMode === 'off'}
                data-testid="drawing-magnet-off"
                onClick={() => handleDrawingMagnetModeChange('off')}
                class={
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ' +
                  (drawingMagnetMode === 'off'
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                Desactivado
                {drawingMagnetMode === 'off' && <span aria-hidden="true">✓</span>}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={drawingMagnetMode === 'weak'}
                data-testid="drawing-magnet-weak"
                onClick={() => handleDrawingMagnetModeChange('weak')}
                class={
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ' +
                  (drawingMagnetMode === 'weak'
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                Imán débil
                {drawingMagnetMode === 'weak' && <span aria-hidden="true">✓</span>}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={drawingMagnetMode === 'strong'}
                data-testid="drawing-magnet-strong"
                onClick={() => handleDrawingMagnetModeChange('strong')}
                class={
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ' +
                  (drawingMagnetMode === 'strong'
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                Imán fuerte
                {drawingMagnetMode === 'strong' && <span aria-hidden="true">✓</span>}
              </button>
              <span class="my-1 block h-px bg-white/10" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={snapToIndicators}
                data-testid="drawing-magnet-indicators"
                onClick={handleSnapToIndicatorsChange}
                class={
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] ' +
                  (snapToIndicators
                    ? 'bg-blue-500/20 text-blue-200'
                    : 'text-slate-300 hover:bg-white/5')
                }
              >
                Ajustar a indicadores
                <span
                  aria-hidden="true"
                  class={
                    'relative h-4 w-7 rounded-full transition-colors ' +
                    (snapToIndicators ? 'bg-blue-500' : 'bg-white/20')
                  }
                >
                  <span
                    class={
                      'absolute top-0.5 size-3 rounded-full bg-white transition-transform ' +
                      (snapToIndicators ? 'translate-x-3.5' : 'translate-x-0.5')
                    }
                  />
                </span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Mantener dibujo"
          aria-pressed={keepDrawing}
          data-testid="keep-drawing-toggle"
          title="Mantener dibujo"
          onClick={handleKeepDrawingToggle}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (keepDrawing
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m14.5 5.5 4 4" />
            <path d="M4 20l4.5-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.5 16z" />
            <path d="M4 20l1.1-4.5" />
          </svg>
        </button>
        <span class="my-1 h-px w-6 bg-white/10" />
        <button
          type="button"
          aria-label={
            allDrawingsLocked ? 'Desbloquear todos los dibujos' : 'Bloquear todos los dibujos'
          }
          aria-pressed={allDrawingsLocked}
          data-testid="drawings-lock-toggle"
          title={allDrawingsLocked ? 'Desbloquear todos los dibujos' : 'Bloquear todos los dibujos'}
          disabled={drawings.length === 0}
          onClick={handleToggleAllDrawingsLock}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors disabled:opacity-30 ' +
            (allDrawingsLocked
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {allDrawingsLocked ? (
              <>
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </>
            ) : (
              <>
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 7.3-2.3" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          aria-label={drawingsVisible ? 'Ocultar dibujos' : 'Mostrar dibujos'}
          aria-pressed={!drawingsVisible}
          data-testid="drawings-visibility-toggle"
          title={drawingsVisible ? 'Ocultar dibujos' : 'Mostrar dibujos'}
          disabled={drawings.length === 0}
          onClick={handleToggleDrawingsVisibility}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors disabled:opacity-30 ' +
            (!drawingsVisible
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {drawingsVisible ? (
              <>
                <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
              </>
            ) : (
              <>
                <path d="m3 3 18 18" />
                <path d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16.4 16.4 0 0 1-3.2 3.9" />
                <path d="M6.2 6.3C3.8 7.9 2.5 12 2.5 12s3.4 6 9.5 6c1.3 0 2.4-.3 3.4-.7" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          aria-label="Árbol de objetos"
          aria-expanded={drawingObjectTreeOpen}
          aria-pressed={drawingObjectTreeOpen}
          data-testid="drawing-object-tree-toggle"
          title="Árbol de objetos"
          onClick={() => setDrawingObjectTreeOpen((open) => !open)}
          class={
            'grid size-8 place-items-center rounded text-sm transition-colors ' +
            (drawingObjectTreeOpen
              ? 'bg-blue-500/20 text-blue-200'
              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100')
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 5h11M9 12h11M9 19h11" />
            <circle cx="4" cy="5" r="1" />
            <circle cx="4" cy="12" r="1" />
            <circle cx="4" cy="19" r="1" />
          </svg>
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
            '. Arrastrar el gráfico para desplazar el tiempo, arrastrar el eje de precios para desplazar los precios, usar la rueda sobre cada área para acercar, hacer doble clic en el eje de precios para autoajustar, mantener Ctrl o Command para seleccionar varios dibujos y usar las flechas para mover los dibujos seleccionados.'
          }
          data-candles-count={renderCandles.length}
          data-chart-type={chartType}
          data-indicator-count={renderIndicators.length}
          data-drawing-count={drawings.length}
          data-renderable-drawing-count={renderableDrawingsRef.current.length}
          data-price-increment={priceIncrement ?? ''}
          data-drawings-locked={String(allDrawingsLocked)}
          data-drawings-visible={String(drawingsVisible)}
          data-drawing-magnet-mode={drawingMagnetMode}
          data-drawing-snap-to-indicators={String(snapToIndicators)}
          data-keep-drawing={String(keepDrawing)}
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
          data-selected-drawing-end-timestamp={
            selectedDrawing?.end === null || selectedDrawing === null
              ? ''
              : String(selectedDrawing.end.timestamp)
          }
          data-selected-drawing-count={selectedDrawingIds.length}
          data-selected-drawing-ids={selectedDrawingIds.join(',')}
          data-selected-drawing-colors={selectedDrawingColors}
          data-selected-drawing-widths={selectedDrawingWidths}
          data-selected-drawing-start-prices={selectedDrawingStartPrices}
          data-selected-drawing-start-timestamps={selectedDrawingStartTimestamps}
          data-selected-drawing-color={selectedDrawing?.color ?? ''}
          data-selected-drawing-width={
            selectedDrawing === null ? '' : String(selectedDrawing.lineWidth ?? 1.5)
          }
          data-selected-drawing-line-style={selectedDrawing?.lineStyle ?? 'solid'}
          data-selected-drawing-fill-color={
            selectedDrawing?.fillColor ?? selectedDrawing?.color ?? ''
          }
          data-selected-drawing-fill-opacity={String(selectedDrawing?.fillOpacity ?? 0)}
          data-selected-drawing-extend-start={String(selectedDrawing?.extendStart ?? false)}
          data-selected-drawing-extend-end={String(
            selectedDrawing?.extendEnd ?? selectedDrawing?.type === 'ray',
          )}
          data-selected-drawing-start-style={selectedDrawing?.startStyle ?? 'none'}
          data-selected-drawing-end-style={selectedDrawing?.endStyle ?? 'none'}
          data-drawing-tool={drawingTool}
          data-drawing-undo-count={drawingUndoCount}
          data-drawing-redo-count={drawingRedoCount}
          data-interval={interval}
        />
        {drawingSelectionArea !== null && (
          <div
            aria-hidden="true"
            data-testid="drawing-selection-marquee"
            class="pointer-events-none absolute z-20 border border-blue-400 bg-blue-400/10"
            style={{
              left: Math.min(drawingSelectionArea.start.x, drawingSelectionArea.current.x),
              top: Math.min(drawingSelectionArea.start.y, drawingSelectionArea.current.y),
              width: Math.abs(drawingSelectionArea.current.x - drawingSelectionArea.start.x),
              height: Math.abs(drawingSelectionArea.current.y - drawingSelectionArea.start.y),
            }}
          />
        )}
        {drawingObjectTreeOpen && (
          <aside
            aria-label="Árbol de objetos"
            data-testid="drawing-object-tree"
            class="absolute right-3 top-12 z-40 flex max-h-[min(70%,36rem)] w-64 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101723]/95 shadow-2xl backdrop-blur"
          >
            <header class="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <div class="min-w-0">
                <div class="text-[11px] font-semibold text-slate-100">Árbol de objetos</div>
                <div class="text-[10px] text-slate-500">{drawings.length} dibujos</div>
              </div>
              <button
                type="button"
                aria-label="Cerrar árbol de objetos"
                data-testid="drawing-object-tree-close"
                onClick={() => setDrawingObjectTreeOpen(false)}
                class="grid size-6 place-items-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </header>
            <div class="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
              {drawings.length === 0 ? (
                <div class="px-2 py-5 text-center text-[10px] text-slate-500">
                  No hay dibujos en este gráfico.
                </div>
              ) : (
                [...drawings].reverse().map((drawing) => {
                  const isVisible = drawing.visible !== false;
                  const isLocked = drawing.locked === true;
                  const isSelected = selectedDrawingIds.includes(drawing.id);
                  const drawingName =
                    drawing.type === 'trend-line'
                      ? 'Línea de tendencia'
                      : drawing.type === 'horizontal-line'
                        ? 'Línea horizontal'
                        : drawing.type === 'vertical-line'
                          ? 'Línea vertical'
                          : drawing.type === 'rectangle'
                            ? 'Rectángulo'
                            : 'Rayo';

                  return (
                    <div
                      data-testid={`drawing-object-row-${drawing.id}`}
                      data-drawing-visible={String(isVisible)}
                      data-drawing-locked={String(isLocked)}
                      class={
                        'flex items-center gap-1 rounded-md px-1 py-1 ' +
                        (isSelected ? 'bg-blue-500/15' : 'hover:bg-white/5')
                      }
                    >
                      <button
                        type="button"
                        aria-label={`Seleccionar ${drawingName.toLowerCase()} ${drawing.id}`}
                        aria-pressed={isSelected}
                        data-testid={`drawing-object-select-${drawing.id}`}
                        onClick={() => handleSelectDrawingFromObjectTree(drawing.id)}
                        class="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left"
                      >
                        <span
                          aria-hidden="true"
                          class="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: drawing.color }}
                        />
                        <span
                          class={
                            'truncate text-[10px] ' +
                            (isVisible ? 'text-slate-200' : 'text-slate-500 line-through')
                          }
                        >
                          {drawingName}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={isVisible ? `Ocultar ${drawing.id}` : `Mostrar ${drawing.id}`}
                        aria-pressed={!isVisible}
                        data-testid={`drawing-object-visibility-${drawing.id}`}
                        title={isVisible ? 'Ocultar dibujo' : 'Mostrar dibujo'}
                        onClick={() => handleToggleDrawingObjectVisibility(drawing.id)}
                        class="grid size-6 shrink-0 place-items-center rounded text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                      >
                        {isVisible ? '◉' : '○'}
                      </button>
                      <button
                        type="button"
                        aria-label={
                          isLocked ? `Desbloquear ${drawing.id}` : `Bloquear ${drawing.id}`
                        }
                        aria-pressed={isLocked}
                        data-testid={`drawing-object-lock-${drawing.id}`}
                        title={isLocked ? 'Desbloquear dibujo' : 'Bloquear dibujo'}
                        onClick={() => handleToggleDrawingObjectLock(drawing.id)}
                        class="grid size-6 shrink-0 place-items-center rounded text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-100"
                      >
                        {isLocked ? '🔒' : '🔓'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Eliminar ${drawing.id}`}
                        data-testid={`drawing-object-delete-${drawing.id}`}
                        title="Eliminar dibujo"
                        onClick={() => handleDeleteDrawingObject(drawing.id)}
                        class="grid size-6 shrink-0 place-items-center rounded text-[12px] text-slate-500 hover:bg-rose-500/15 hover:text-rose-200"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
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
          <div class="absolute right-3 top-12 z-30 flex items-center justify-end gap-1">
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
          <ChartTypeSelector
            value={chartType}
            options={CHART_TYPE_OPTIONS}
            onChange={(nextType) => handleChartTypeChange(nextType as ChartType)}
            testId="chart-type-select"
            showLabel={false}
            variant="chart-overlay"
          />
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
          <PriceScaleSelector
            value={priceScaleMode}
            options={PRICE_SCALE_OPTIONS}
            onChange={(mode) => handlePriceScaleModeChange(mode as PriceScaleMode)}
            disabled={renderCandles.length === 0}
            variant="chart-overlay"
          />
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
            <DrawingCoordinatesPanel
              selectedDrawing={selectedDrawing}
              panelPosition={drawingPanelLayout.positions.coordinates}
              panelRef={(element) => attachDrawingPanelElement('coordinates', element)}
              onDragStart={(event) => handleDrawingPanelPointerDown('coordinates', event)}
              onClose={() => handleDrawingPanelVisibilityChange('coordinates', false)}
              onAnchorUpdate={handleSelectedDrawingAnchorUpdate}
            />
          )}

        {selectedDrawing !== null && drawingPanelLayout.visible.appearance && (
          <DrawingPropertiesPanel
            selectedDrawing={selectedDrawing}
            selectedDrawingIds={selectedDrawingIds}
            selectedDrawingsShareType={selectedDrawingsShareType}
            panelPosition={drawingPanelLayout.positions.appearance}
            templates={drawingStyleTemplates}
            activeDefaultStyle={activeDefaultStyle !== null}
            activeTemplateTool={activeTemplateTool}
            expanded={drawingTemplatesExpanded}
            selectedTemplateId={selectedDrawingTemplateId}
            newTemplateName={newDrawingTemplateName}
            templateError={drawingTemplateError}
            panelRef={(element) => attachDrawingPanelElement('appearance', element)}
            onDragStart={(event) => handleDrawingPanelPointerDown('appearance', event)}
            onClose={() => handleDrawingPanelVisibilityChange('appearance', false)}
            onStyleChange={handleSelectedDrawingUpdate}
            onToggleTemplates={handleToggleDrawingTemplates}
            onTemplateChange={setSelectedDrawingTemplateId}
            onApplyTemplate={handleApplyDrawingTemplate}
            onDeleteTemplate={handleDeleteDrawingTemplate}
            onTemplateNameChange={(name) => {
              setNewDrawingTemplateName(name);
              setDrawingTemplateError(null);
            }}
            onSaveTemplate={handleSaveDrawingTemplate}
          />
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
