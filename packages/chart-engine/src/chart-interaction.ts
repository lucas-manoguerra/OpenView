import type { ChartCoordinate, ChartFrame } from './chart-frame';
import { panTimeScale, zoomTimeScale } from './time-scale';

export type PointerPosition = Readonly<{
  x: number;
  y: number;
}>;

export type ChartInteractionSnapshot = Readonly<{
  frame: ChartFrame;
  crosshair: ChartCoordinate | null;
  dragging: boolean;
}>;

export type ChartInteractionOptions = Readonly<{
  wheelZoomSensitivity?: number;
  onChange?: (snapshot: ChartInteractionSnapshot) => void;
}>;

const containsPoint = (point: PointerPosition, frame: ChartFrame): boolean => {
  const { plotArea } = frame.layout;

  return (
    point.x >= plotArea.x &&
    point.x <= plotArea.x + plotArea.width &&
    point.y >= plotArea.y &&
    point.y <= plotArea.y + plotArea.height
  );
};

const assertFinitePosition = (point: PointerPosition): void => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Pointer coordinates must be finite numbers.');
  }
};

const withTimeScale = (frame: ChartFrame, timeScale: ChartFrame['timeScale']): ChartFrame =>
  Object.freeze({ ...frame, timeScale });

export class ChartInteractionController {
  private frame: ChartFrame;
  private crosshair: ChartCoordinate | null = null;
  private dragPosition: PointerPosition | null = null;
  private readonly wheelZoomSensitivity: number;
  private readonly onChange: ((snapshot: ChartInteractionSnapshot) => void) | undefined;

  constructor(frame: ChartFrame, options: ChartInteractionOptions = {}) {
    const wheelZoomSensitivity = options.wheelZoomSensitivity ?? 0.002;

    if (!Number.isFinite(wheelZoomSensitivity) || wheelZoomSensitivity <= 0) {
      throw new RangeError('Wheel zoom sensitivity must be a positive finite number.');
    }

    this.frame = frame;
    this.wheelZoomSensitivity = wheelZoomSensitivity;
    this.onChange = options.onChange;
  }

  get snapshot(): ChartInteractionSnapshot {
    return Object.freeze({
      frame: this.frame,
      crosshair: this.crosshair,
      dragging: this.dragPosition !== null,
    });
  }

  setFrame(frame: ChartFrame): void {
    this.frame = frame;
    this.dragPosition = null;
    this.crosshair = null;
    this.emit();
  }

  pointerDown(position: PointerPosition, button = 0): boolean {
    assertFinitePosition(position);

    if (button !== 0 || !containsPoint(position, this.frame)) {
      return false;
    }

    this.dragPosition = Object.freeze({ ...position });
    this.crosshair = Object.freeze({ ...position });
    this.emit();

    return true;
  }

  pointerMove(position: PointerPosition): void {
    assertFinitePosition(position);
    let changed = false;

    if (this.dragPosition !== null) {
      const deltaX = position.x - this.dragPosition.x;

      if (deltaX !== 0) {
        const timeScale = panTimeScale(this.frame.timeScale, deltaX);
        this.frame = withTimeScale(this.frame, timeScale);
        changed = true;
      }

      this.dragPosition = Object.freeze({ ...position });
    }

    const nextCrosshair = containsPoint(position, this.frame)
      ? Object.freeze({ ...position })
      : null;

    if (
      nextCrosshair?.x !== this.crosshair?.x ||
      nextCrosshair?.y !== this.crosshair?.y
    ) {
      this.crosshair = nextCrosshair;
      changed = true;
    }

    if (changed) {
      this.emit();
    }
  }

  pointerUp(position?: PointerPosition): void {
    if (position !== undefined) {
      assertFinitePosition(position);
      this.crosshair = containsPoint(position, this.frame)
        ? Object.freeze({ ...position })
        : null;
    }

    if (this.dragPosition !== null || position !== undefined) {
      this.dragPosition = null;
      this.emit();
    }
  }

  pointerCancel(): void {
    if (this.dragPosition === null && this.crosshair === null) {
      return;
    }

    this.dragPosition = null;
    this.crosshair = null;
    this.emit();
  }

  pointerLeave(): void {
    if (this.dragPosition !== null || this.crosshair === null) {
      return;
    }

    this.crosshair = null;
    this.emit();
  }

  wheel(position: PointerPosition, deltaX: number, deltaY: number): boolean {
    assertFinitePosition(position);

    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      throw new RangeError('Wheel deltas must be finite numbers.');
    }

    if (!containsPoint(position, this.frame) || (deltaX === 0 && deltaY === 0)) {
      return false;
    }

    let nextTimeScale = this.frame.timeScale;

    if (deltaX !== 0) {
      nextTimeScale = panTimeScale(nextTimeScale, -deltaX);
    }

    if (deltaY !== 0) {
      const exponent = Math.max(-20, Math.min(20, -deltaY * this.wheelZoomSensitivity));
      const zoomFactor = Math.exp(exponent);
      const anchorX = position.x - this.frame.layout.plotArea.x;
      nextTimeScale = zoomTimeScale(nextTimeScale, zoomFactor, anchorX);
    }

    const timeScaleChanged = nextTimeScale !== this.frame.timeScale;

    if (timeScaleChanged) {
      this.frame = withTimeScale(this.frame, nextTimeScale);
    }

    const nextCrosshair = Object.freeze({ ...position });
    const crosshairChanged =
      nextCrosshair.x !== this.crosshair?.x || nextCrosshair.y !== this.crosshair?.y;

    if (crosshairChanged) {
      this.crosshair = nextCrosshair;
    }

    if (timeScaleChanged || crosshairChanged) {
      this.emit();
    }

    return timeScaleChanged || crosshairChanged;
  }

  private emit(): void {
    this.onChange?.(this.snapshot);
  }
}

export const createChartInteractionController = (
  frame: ChartFrame,
  options: ChartInteractionOptions = {},
): ChartInteractionController => new ChartInteractionController(frame, options);
