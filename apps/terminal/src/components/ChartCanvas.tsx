import { useCallback, useMemo, useRef } from 'preact/hooks';
import type { Candle } from '@openview/market-domain';
import type { CandleInterval } from '@openview/market-data';
import {
  attachCanvasPointerEvents,
  attachCanvasResizeObserver,
  createChartFrame,
  createChartInteractionController,
  createChartRenderScene,
  createCanvasRenderer,
  updateChartRenderScene,
  type CanvasPointerAdapter,
  type CanvasResize,
  type CanvasResizeAdapter,
  type ChartInteractionController,
  type ChartInteractionSnapshot,
  type ChartRenderCandle,
  type ChartRenderScene,
  type NumericRange,
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
  updateCandles(candles: readonly ChartRenderCandle[]): void;
  destroy(): void;
}>;

type ChartRenderData = Readonly<{
  candles: readonly ChartRenderCandle[];
}>;

const EMPTY_PRICE_RANGE: NumericRange = Object.freeze({ min: 0, max: 1 });

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
) => {
  const previousScale = controller?.snapshot.frame.timeScale;
  const previousPriceScale = controller?.snapshot.frame.priceScale;
  const priceRange =
    preservePriceZoom && previousPriceScale !== undefined
      ? getPreservedPriceRange(previousPriceScale, previousCandles, candles)
      : (previousPriceScale?.range ?? getPriceRange(candles));

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
            barSpacing: previousScale.barSpacing,
            rightOffset: previousScale.rightOffset,
            minBarSpacing: previousScale.minBarSpacing,
            maxBarSpacing: previousScale.maxBarSpacing,
            inverted: previousScale.inverted,
          },
    ...(previousPriceScale === undefined
      ? {}
      : {
          priceScale: {
            mode: previousPriceScale.mode,
            ...(previousPriceScale.baseValue === null
              ? {}
              : { baseValue: previousPriceScale.baseValue }),
            inverted: previousPriceScale.inverted,
          },
        }),
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
  const renderCandles = useMemo(() => createRenderCandles(candles), [candles]);
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

      if (
        snapshot.frame.timeScale.visibleLogicalRange.from <= 120 &&
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

      const frame = createFrame(size, controller, currentCandles, currentCandles, false);

      if (controller === null) {
        scene = createChartRenderScene(frame, currentCandles);
        const interactionController = createChartInteractionController(frame, {
          onChange: handleControllerChange,
        });
        controller = interactionController;
        renderer.setScene(scene);
        pointerAdapter = attachCanvasPointerEvents(canvas, interactionController, {
          getAutoScalePriceRange: () => getVisiblePriceRange(interactionController, currentCandles),
        });
      } else {
        controller.setFrame(frame);
      }

      canvas.dataset['chartReady'] = 'true';
    };

    const resizeAdapter: CanvasResizeAdapter = attachCanvasResizeObserver(canvas, handleResize);

    runtimeRef.current = Object.freeze({
      updateCandles: (nextCandles: readonly ChartRenderCandle[]): void => {
        if (nextCandles === currentCandles) {
          return;
        }

        const previousCandles = currentCandles;
        currentCandles = nextCandles;

        if (controller === null || lastSize === null) {
          return;
        }

        const frame = createFrame(lastSize, controller, currentCandles, previousCandles, true);
        scene = createChartRenderScene(frame, currentCandles, controller.snapshot.crosshair);
        controller.setFrame(frame);
        renderer.setScene(scene);
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
        runtimeRef.current?.updateCandles(renderDataRef.current.candles);
      }
    },
    [renderCandles],
  );

  return (
    <div
      class="relative h-[390px] min-h-[340px] w-full bg-[#0b0f17]"
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
        data-interval={interval}
      />
      <span ref={bindDataUpdate} class="hidden" aria-hidden="true" />
      <div class="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
        <span class="text-xs font-semibold text-slate-200">{symbol}</span>
        <span class="rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-400">
          {interval} · Datos históricos
        </span>
        <span class="rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-500">
          {renderCandles.length} velas
        </span>
      </div>
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
  );
}
