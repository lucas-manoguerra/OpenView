import { useCallback, useRef } from 'preact/hooks';
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

type ChartRuntime = Readonly<{
  destroy(): void;
}>;

const getDemoClose = (index: number): number =>
  65_000 + index * 3 + 520 * Math.sin(index / 11) + 190 * Math.cos(index / 27);

const createDemoCandles = (): readonly ChartRenderCandle[] =>
  Object.freeze(
    Array.from({ length: 240 }, (_, index) => {
      const close = getDemoClose(index);
      const open = index === 0 ? close - 30 : getDemoClose(index - 1);
      const volatility = 18 + Math.abs(Math.cos(index / 5)) * 34;

      return Object.freeze({
        logicalIndex: index,
        timestamp: 1_700_000_000_000 + index * 60_000,
        open,
        high: Math.max(open, close) + volatility,
        low: Math.min(open, close) - volatility * 0.8,
        close,
        volume: 40 + ((index * 37) % 140) + Math.round(Math.abs(Math.sin(index / 3)) * 120),
      });
    }),
  );

const DEMO_CANDLES = createDemoCandles();
const DEMO_PRICE_MIN = Math.min(...DEMO_CANDLES.map((candle) => candle.low));
const DEMO_PRICE_MAX = Math.max(...DEMO_CANDLES.map((candle) => candle.high));
const DEMO_PRICE_PADDING = (DEMO_PRICE_MAX - DEMO_PRICE_MIN) * 0.08;
const DEMO_PRICE_RANGE = Object.freeze({
  min: DEMO_PRICE_MIN - DEMO_PRICE_PADDING,
  max: DEMO_PRICE_MAX + DEMO_PRICE_PADDING,
});

const createFrame = (size: CanvasResize, controller: ChartInteractionController | null) => {
  const previousScale = controller?.snapshot.frame.timeScale;
  const previousPriceScale = controller?.snapshot.frame.priceScale;

  return createChartFrame(
    size.width,
    size.height,
    previousPriceScale?.range ?? DEMO_PRICE_RANGE,
    DEMO_CANDLES.length - 1,
    {
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
    },
  );
};

const getVisiblePriceRange = (controller: ChartInteractionController): NumericRange => {
  const { from, to } = controller.snapshot.frame.timeScale.visibleLogicalRange;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (const candle of DEMO_CANDLES) {
    if (candle.logicalIndex < from - 1 || candle.logicalIndex > to + 1) {
      continue;
    }

    minimum = Math.min(minimum, candle.low);
    maximum = Math.max(maximum, candle.high);
  }

  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return DEMO_PRICE_RANGE;
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

export function ChartCanvas() {
  const runtimeRef = useRef<ChartRuntime | null>(null);

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

      const frame = createFrame(size, controller);

      if (controller === null) {
        scene = createChartRenderScene(frame, DEMO_CANDLES);
        const interactionController = createChartInteractionController(frame, {
          onChange: handleControllerChange,
        });
        controller = interactionController;
        renderer.setScene(scene);
        pointerAdapter = attachCanvasPointerEvents(canvas, interactionController, {
          getAutoScalePriceRange: () => getVisiblePriceRange(interactionController),
        });
      } else {
        controller.setFrame(frame);
      }

      canvas.dataset['chartReady'] = 'true';
    };

    const resizeAdapter: CanvasResizeAdapter = attachCanvasResizeObserver(canvas, handleResize);

    runtimeRef.current = Object.freeze({
      destroy: (): void => {
        pointerAdapter?.destroy();
        resizeAdapter.destroy();
        renderer.destroy();
        delete canvas.dataset['chartReady'];
      },
    });
  }, []);

  return (
    <div class="relative h-[390px] min-h-[340px] w-full bg-[#0b0f17]" data-testid="chart-surface">
      <canvas
        ref={bindCanvas}
        class="block h-full w-full touch-none"
        role="img"
        aria-label="Gráfico interactivo de velas y volumen para BTC USDT. Arrastrar el gráfico para desplazar el tiempo, arrastrar el eje de precios para desplazar los precios, usar la rueda sobre cada área para acercar y hacer doble clic en el eje de precios para autoajustar."
      />
      <div class="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
        <span class="text-xs font-semibold text-slate-200">BTC / USDT</span>
        <span class="rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-400">
          1m · Demo
        </span>
      </div>
      <div class="pointer-events-none absolute bottom-3 right-4 rounded border border-white/10 bg-[#101723]/90 px-2 py-1 text-[10px] text-slate-500">
        Drag to pan · Scroll to zoom · Double-click price axis to fit
      </div>
    </div>
  );
}
