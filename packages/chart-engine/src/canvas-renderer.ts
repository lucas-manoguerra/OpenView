import {
  DEFAULT_CHART_THEME,
  drawChartScene,
  type ChartRenderScene,
  type ChartRenderTheme,
} from './canvas-painter';

export type CanvasSurface = Readonly<{
  getContext(contextId: '2d'): CanvasRenderingContext2D | null;
}> & {
  width: number;
  height: number;
};

export type CanvasFrameScheduler = Readonly<{
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}>;

export type CanvasRendererOptions = Readonly<{
  scheduler?: CanvasFrameScheduler;
  theme?: Partial<ChartRenderTheme>;
}>;

export type CanvasRendererSize = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
}>;

const browserFrameScheduler: CanvasFrameScheduler = Object.freeze({
  requestFrame: (callback: () => void): number => requestAnimationFrame(callback),
  cancelFrame: (handle: number): void => cancelAnimationFrame(handle),
});

const createTheme = (overrides: Partial<ChartRenderTheme> = {}): ChartRenderTheme =>
  Object.freeze({ ...DEFAULT_CHART_THEME, ...overrides });

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly scheduler: CanvasFrameScheduler;
  private readonly theme: ChartRenderTheme;
  private scene: ChartRenderScene | null = null;
  private scheduledFrame: number | null = null;
  private width = 0;
  private height = 0;
  private devicePixelRatio = 1;
  private destroyed = false;

  constructor(
    private readonly surface: CanvasSurface,
    options: CanvasRendererOptions = {},
  ) {
    const context = surface.getContext('2d');

    if (context === null) {
      throw new Error('A 2D canvas rendering context is required.');
    }

    this.context = context;
    this.scheduler = options.scheduler ?? browserFrameScheduler;
    this.theme = createTheme(options.theme);
  }

  get size(): CanvasRendererSize {
    return Object.freeze({
      width: this.width,
      height: this.height,
      devicePixelRatio: this.devicePixelRatio,
    });
  }

  resize(width: number, height: number, devicePixelRatio = this.devicePixelRatio): void {
    this.assertActive();

    if (
      ![width, height, devicePixelRatio].every(Number.isFinite) ||
      width < 0 ||
      height < 0 ||
      devicePixelRatio <= 0
    ) {
      throw new RangeError(
        'Canvas size must be finite and non-negative with a positive pixel ratio.',
      );
    }

    if (
      width === this.width &&
      height === this.height &&
      devicePixelRatio === this.devicePixelRatio
    ) {
      return;
    }

    this.width = width;
    this.height = height;
    this.devicePixelRatio = devicePixelRatio;
    this.surface.width = Math.round(width * devicePixelRatio);
    this.surface.height = Math.round(height * devicePixelRatio);
    this.scene = null;
    this.invalidate();
  }

  setScene(scene: ChartRenderScene): void {
    this.assertActive();

    if (
      this.width > 0 &&
      this.height > 0 &&
      (scene.frame.layout.bounds.width !== this.width ||
        scene.frame.layout.bounds.height !== this.height)
    ) {
      throw new RangeError('Chart scene dimensions must match the logical canvas size.');
    }

    this.scene = scene;
    this.invalidate();
  }

  invalidate(): void {
    if (this.destroyed || this.scheduledFrame !== null) {
      return;
    }

    this.scheduledFrame = this.scheduler.requestFrame(() => {
      this.scheduledFrame = null;
      this.draw();
    });
  }

  renderNow(): void {
    this.assertActive();

    if (this.scheduledFrame !== null) {
      this.scheduler.cancelFrame(this.scheduledFrame);
      this.scheduledFrame = null;
    }

    this.draw();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    if (this.scheduledFrame !== null) {
      this.scheduler.cancelFrame(this.scheduledFrame);
      this.scheduledFrame = null;
    }

    this.scene = null;
    this.destroyed = true;
  }

  private draw(): void {
    if (this.destroyed || this.width <= 0 || this.height <= 0) {
      return;
    }

    this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);

    if (this.scene === null) {
      this.context.clearRect(0, 0, this.width, this.height);
      this.context.fillStyle = this.theme.background;
      this.context.fillRect(0, 0, this.width, this.height);
      return;
    }

    drawChartScene(this.context, this.scene, this.theme);
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new Error('The canvas renderer has been destroyed.');
    }
  }
}

export const createCanvasRenderer = (
  surface: CanvasSurface,
  options: CanvasRendererOptions = {},
): CanvasRenderer => new CanvasRenderer(surface, options);
