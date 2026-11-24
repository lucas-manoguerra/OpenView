import type { ChartCoordinate, ChartFrame } from './chart-frame';
import { createPriceScale, panPriceScale, zoomPriceScale } from './price-scale';
import type { NumericRange } from './viewport';
import { createTimeScale, panTimeScale, zoomTimeScale } from './time-scale';

export type PointerPosition = Readonly<{
  x: number;
  y: number;
}>;

export type ChartInteractionSnapshot = Readonly<{
  frame: ChartFrame;
  crosshair: ChartCoordinate | null;
  dragging: boolean;
  dragTarget: 'time' | 'price' | null;
}>;

export type ChartInteractionOptions = Readonly<{
  wheelZoomSensitivity?: number;
  onChange?: (snapshot: ChartInteractionSnapshot) => void;
  onPriceScaleInteraction?: () => void;
}>;

type DragTarget = 'time' | 'price';

const containsPoint = (point: PointerPosition, frame: ChartFrame): boolean => {
  const { plotArea } = frame.layout;

  return (
    point.x >= plotArea.x &&
    point.x <= plotArea.x + plotArea.width &&
    point.y >= plotArea.y &&
    point.y <= plotArea.y + plotArea.height
  );
};

const containsPriceScalePoint = (point: PointerPosition, frame: ChartFrame): boolean => {
  const { plotArea, leftPriceScaleArea, rightPriceScaleArea } = frame.layout;
  const withinPriceArea = (area: typeof rightPriceScaleArea): boolean =>
    area.width > 0 &&
    point.x >= area.x &&
    point.x <= area.x + area.width &&
    point.y >= plotArea.y &&
    point.y <= plotArea.y + plotArea.height;

  return withinPriceArea(leftPriceScaleArea) || withinPriceArea(rightPriceScaleArea);
};

const assertFinitePosition = (point: PointerPosition): void => {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Pointer coordinates must be finite numbers.');
  }
};

const withTimeScale = (frame: ChartFrame, timeScale: ChartFrame['timeScale']): ChartFrame =>
  Object.freeze({ ...frame, timeScale });

const withPriceScale = (frame: ChartFrame, priceScale: ChartFrame['priceScale']): ChartFrame =>
  Object.freeze({ ...frame, priceScale });

export class ChartInteractionController {
  private frame: ChartFrame;
  private crosshair: ChartCoordinate | null = null;
  private dragPosition: PointerPosition | null = null;
  private dragTarget: DragTarget | null = null;
  private readonly wheelZoomSensitivity: number;
  private readonly onChange: ((snapshot: ChartInteractionSnapshot) => void) | undefined;
  private readonly onPriceScaleInteraction: (() => void) | undefined;
  private priceScaleLocked = false;

  constructor(frame: ChartFrame, options: ChartInteractionOptions = {}) {
    const wheelZoomSensitivity = options.wheelZoomSensitivity ?? 0.002;

    if (!Number.isFinite(wheelZoomSensitivity) || wheelZoomSensitivity <= 0) {
      throw new RangeError('Wheel zoom sensitivity must be a positive finite number.');
    }

    this.frame = frame;
    this.wheelZoomSensitivity = wheelZoomSensitivity;
    this.onChange = options.onChange;
    this.onPriceScaleInteraction = options.onPriceScaleInteraction;
  }

  get snapshot(): ChartInteractionSnapshot {
    return Object.freeze({
      frame: this.frame,
      crosshair: this.crosshair,
      dragging: this.dragPosition !== null,
      dragTarget: this.dragTarget,
    });
  }

  setFrame(frame: ChartFrame): void {
    this.frame = frame;
    this.dragPosition = null;
    this.dragTarget = null;
    this.crosshair = null;
    this.emit();
  }

  pointerDown(position: PointerPosition, button = 0): boolean {
    assertFinitePosition(position);

    if (button !== 0) {
      return false;
    }

    if (containsPriceScalePoint(position, this.frame)) {
      if (this.priceScaleLocked) {
        return false;
      }

      this.onPriceScaleInteraction?.();
      this.dragPosition = Object.freeze({ ...position });
      this.dragTarget = 'price';
      this.crosshair = null;
      this.emit();
      return true;
    }

    if (!containsPoint(position, this.frame)) {
      return false;
    }

    this.dragPosition = Object.freeze({ ...position });
    this.dragTarget = 'time';
    this.crosshair = Object.freeze({ ...position });
    this.emit();

    return true;
  }

  pointerMove(position: PointerPosition): void {
    assertFinitePosition(position);
    let changed = false;

    if (this.dragPosition !== null && this.dragTarget === 'time') {
      const deltaX = position.x - this.dragPosition.x;

      if (deltaX !== 0) {
        const timeScale = panTimeScale(this.frame.timeScale, deltaX);
        this.frame = withTimeScale(this.frame, timeScale);
        changed = true;
      }
    } else if (this.dragPosition !== null && this.dragTarget === 'price') {
      const deltaY = position.y - this.dragPosition.y;

      if (deltaY !== 0) {
        const priceScale = panPriceScale(this.frame.priceScale, deltaY);
        this.frame = withPriceScale(this.frame, priceScale);
        changed = true;
      }
    }

    if (this.dragPosition !== null) {
      this.dragPosition = Object.freeze({ ...position });
    }

    const nextCrosshair =
      this.dragTarget === 'price' || !containsPoint(position, this.frame)
        ? null
        : Object.freeze({ ...position });

    if (nextCrosshair?.x !== this.crosshair?.x || nextCrosshair?.y !== this.crosshair?.y) {
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
      this.crosshair = containsPoint(position, this.frame) ? Object.freeze({ ...position }) : null;
    }

    if (this.dragPosition !== null || position !== undefined) {
      this.dragPosition = null;
      this.dragTarget = null;
      this.emit();
    }
  }

  pointerCancel(): void {
    if (this.dragPosition === null && this.crosshair === null) {
      return;
    }

    this.dragPosition = null;
    this.dragTarget = null;
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

    if (containsPriceScalePoint(position, this.frame)) {
      if (this.priceScaleLocked || deltaY === 0) {
        return false;
      }

      this.onPriceScaleInteraction?.();
      const exponent = Math.max(-20, Math.min(20, -deltaY * this.wheelZoomSensitivity));
      const zoomFactor = Math.exp(exponent);
      const anchorY = position.y - this.frame.layout.plotArea.y;
      const priceScale = zoomPriceScale(this.frame.priceScale, zoomFactor, anchorY);

      if (priceScale === this.frame.priceScale) {
        return false;
      }

      this.frame = withPriceScale(this.frame, priceScale);

      if (this.crosshair !== null) {
        this.crosshair = null;
      }

      this.emit();
      return true;
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

  scrollTimeByBars(bars: number): boolean {
    if (!Number.isFinite(bars)) {
      throw new RangeError('Time navigation distance must be a finite number.');
    }

    if (bars === 0) {
      return false;
    }

    const deltaX =
      (this.frame.timeScale.inverted ? 1 : -1) * bars * this.frame.timeScale.barSpacing;
    const timeScale = panTimeScale(this.frame.timeScale, deltaX);

    if (timeScale.rightOffset === this.frame.timeScale.rightOffset) {
      return false;
    }

    this.frame = withTimeScale(this.frame, timeScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  setRightOffset(rightOffset: number): boolean {
    if (!Number.isFinite(rightOffset)) {
      throw new RangeError('Right offset must be a finite number.');
    }

    const currentScale = this.frame.timeScale;

    if (currentScale.rightOffset === rightOffset) {
      return false;
    }

    const timeScale = createTimeScale(currentScale.width, currentScale.rightmostLogicalIndex, {
      barSpacing: currentScale.barSpacing,
      rightOffset,
      minBarSpacing: currentScale.minBarSpacing,
      maxBarSpacing: currentScale.maxBarSpacing,
      inverted: currentScale.inverted,
    });

    this.frame = withTimeScale(this.frame, timeScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  scrollToRealtime(): boolean {
    const currentScale = this.frame.timeScale;

    if (currentScale.rightOffset === 0) {
      return false;
    }

    const timeScale = createTimeScale(currentScale.width, currentScale.rightmostLogicalIndex, {
      barSpacing: currentScale.barSpacing,
      rightOffset: 0,
      minBarSpacing: currentScale.minBarSpacing,
      maxBarSpacing: currentScale.maxBarSpacing,
      inverted: currentScale.inverted,
    });

    this.frame = withTimeScale(this.frame, timeScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  zoomTime(zoomFactor: number, anchorCoordinate = this.frame.timeScale.width / 2): boolean {
    const timeScale = zoomTimeScale(this.frame.timeScale, zoomFactor, anchorCoordinate);

    if (timeScale === this.frame.timeScale) {
      return false;
    }

    this.frame = withTimeScale(this.frame, timeScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  setPriceScaleLocked(locked: boolean): boolean {
    if (this.priceScaleLocked === locked) {
      return false;
    }

    this.priceScaleLocked = locked;

    if (locked && this.dragTarget === 'price') {
      this.pointerCancel();
    }

    return true;
  }

  invertPriceScale(): boolean {
    const currentScale = this.frame.priceScale;
    const priceScale = createPriceScale(currentScale.range, currentScale.height, {
      mode: currentScale.mode,
      ...(currentScale.baseValue === null ? {} : { baseValue: currentScale.baseValue }),
      inverted: !currentScale.inverted,
    });

    this.frame = withPriceScale(this.frame, priceScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  fitPriceScale(range: NumericRange): boolean {
    const currentScale = this.frame.priceScale;
    const nextScale = this.createFittedPriceScale(range);

    if (
      nextScale.range.min === currentScale.range.min &&
      nextScale.range.max === currentScale.range.max
    ) {
      return false;
    }

    this.frame = withPriceScale(this.frame, nextScale);
    this.crosshair = null;
    this.emit();
    return true;
  }

  fitPriceScaleAt(position: PointerPosition, range: NumericRange): boolean {
    assertFinitePosition(position);

    if (!containsPriceScalePoint(position, this.frame)) {
      return false;
    }

    return this.fitPriceScale(range);
  }

  private createFittedPriceScale(range: NumericRange): ChartFrame['priceScale'] {
    const currentScale = this.frame.priceScale;
    const options = {
      mode: currentScale.mode,
      ...(currentScale.baseValue === null ? {} : { baseValue: currentScale.baseValue }),
      inverted: currentScale.inverted,
    };

    return createPriceScale(range, currentScale.height, options);
  }

  private emit(): void {
    this.onChange?.(this.snapshot);
  }
}

export const createChartInteractionController = (
  frame: ChartFrame,
  options: ChartInteractionOptions = {},
): ChartInteractionController => new ChartInteractionController(frame, options);
