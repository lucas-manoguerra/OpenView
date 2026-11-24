import { describe, expect, it, vi } from 'vitest';
import { createChartFrame } from './src/chart-frame';
import { priceToCoordinate } from './src/price-scale';
import { coordinateToLogicalIndex, logicalIndexToCoordinate } from './src/time-scale';
import { createChartInteractionController } from './src/chart-interaction';

const createFrame = () =>
  createChartFrame(900, 500, { min: 90, max: 120 }, 99, {
    layout: {
      leftPriceScaleWidth: 48,
      rightPriceScaleWidth: 72,
      topInset: 12,
    },
  });

const centerOfPriceScale = (frame = createFrame()) => ({
  x: frame.layout.rightPriceScaleArea.x + frame.layout.rightPriceScaleArea.width / 2,
  y: frame.layout.plotArea.y + frame.layout.plotArea.height / 2,
});

const centerOfPlot = (frame = createFrame()) => ({
  x: frame.layout.plotArea.x + frame.layout.plotArea.width / 2,
  y: frame.layout.plotArea.y + frame.layout.plotArea.height / 2,
});

describe('chart interaction controller', () => {
  it('updates the crosshair while the pointer moves inside the plot', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const position = {
      x: frame.layout.plotArea.x + 120,
      y: frame.layout.plotArea.y + 80,
    };

    controller.pointerMove(position);

    expect(controller.snapshot.crosshair).toEqual(position);
    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.frame).toBe(frame);
  });

  it('clears the crosshair when the pointer leaves the plot', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);

    controller.pointerMove(centerOfPlot(frame));
    controller.pointerMove({
      x: frame.layout.plotArea.x + frame.layout.plotArea.width + 1,
      y: centerOfPlot(frame).y,
    });

    expect(controller.snapshot.crosshair).toBeNull();
  });

  it('starts primary-button dragging only inside the plot area', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const center = centerOfPlot(frame);

    expect(controller.pointerDown(center, 2)).toBe(false);
    expect(controller.pointerDown({ x: 10, y: 10 })).toBe(false);
    expect(controller.pointerDown(center)).toBe(true);
    expect(controller.snapshot.dragging).toBe(true);
  });

  it('pans the time scale in the pointer drag direction', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const start = centerOfPlot(frame);
    const previousIndex = 50;
    const previousX =
      frame.layout.plotArea.x + logicalIndexToCoordinate(previousIndex, frame.timeScale);

    controller.pointerDown(start);
    controller.pointerMove({ x: start.x + 64, y: start.y });

    const nextFrame = controller.snapshot.frame;
    const nextX =
      nextFrame.layout.plotArea.x + logicalIndexToCoordinate(previousIndex, nextFrame.timeScale);

    expect(nextFrame.timeScale.rightOffset).toBe(-8);
    expect(nextX).toBe(previousX + 64);
    expect(controller.snapshot.crosshair).toEqual({ x: start.x + 64, y: start.y });
  });

  it('ends a drag without losing the final crosshair position', () => {
    const controller = createChartInteractionController(createFrame());
    const start = centerOfPlot();

    controller.pointerDown(start);
    controller.pointerMove({ x: start.x + 30, y: start.y + 10 });
    controller.pointerUp({ x: start.x + 30, y: start.y + 10 });

    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toEqual({
      x: start.x + 30,
      y: start.y + 10,
    });
  });

  it('clears drag and crosshair state on pointer cancellation', () => {
    const controller = createChartInteractionController(createFrame());

    controller.pointerDown(centerOfPlot());
    controller.pointerCancel();

    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toBeNull();
  });

  it('does not clear the crosshair when the pointer leaves during a captured drag', () => {
    const controller = createChartInteractionController(createFrame());
    const center = centerOfPlot();

    controller.pointerDown(center);
    controller.pointerLeave();

    expect(controller.snapshot.dragging).toBe(true);
    expect(controller.snapshot.crosshair).toEqual(center);
  });

  it('starts a price drag on the price axis and pans the visible price range', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const start = centerOfPriceScale(frame);
    const price = 105;
    const previousY = frame.layout.plotArea.y + priceToCoordinate(price, frame.priceScale);

    expect(controller.pointerDown(start)).toBe(true);
    expect(controller.snapshot.dragTarget).toBe('price');
    controller.pointerMove({ x: start.x, y: start.y + 40 });

    const nextFrame = controller.snapshot.frame;
    const nextY = nextFrame.layout.plotArea.y + priceToCoordinate(price, nextFrame.priceScale);

    expect(nextFrame.priceScale.range).not.toEqual(frame.priceScale.range);
    expect(nextY).toBeCloseTo(previousY + 40);
    expect(controller.snapshot.crosshair).toBeNull();
  });

  it('zooms the price scale around the cursor when scrolling over the axis', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const position = {
      x: centerOfPriceScale(frame).x,
      y: frame.layout.plotArea.y + 80,
    };
    const anchorPrice =
      frame.priceScale.range.min +
      (1 - 80 / frame.priceScale.height) *
        (frame.priceScale.range.max - frame.priceScale.range.min);

    expect(controller.wheel(position, 0, -120)).toBe(true);

    const nextScale = controller.snapshot.frame.priceScale;

    expect(nextScale.range.max - nextScale.range.min).toBeLessThan(
      frame.priceScale.range.max - frame.priceScale.range.min,
    );
    expect(priceToCoordinate(anchorPrice, nextScale)).toBeCloseTo(80);
    expect(controller.snapshot.frame.timeScale.barSpacing).toBe(frame.timeScale.barSpacing);
  });

  it('fits the price scale only when the auto-fit command comes from a price axis', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const range = { min: 98, max: 108 };

    expect(controller.fitPriceScaleAt(centerOfPlot(frame), range)).toBe(false);
    expect(controller.fitPriceScaleAt(centerOfPriceScale(frame), range)).toBe(true);
    expect(controller.snapshot.frame.priceScale.range).toEqual(range);
    expect(controller.snapshot.crosshair).toBeNull();
  });

  it('does not emit a change when auto-fit already matches the current range', () => {
    const frame = createFrame();
    const onChange = vi.fn();
    const controller = createChartInteractionController(frame, { onChange });

    expect(controller.fitPriceScale(frame.priceScale.range)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('locks price scale interactions while preserving time navigation', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const axis = centerOfPriceScale(frame);

    expect(controller.setPriceScaleLocked(true)).toBe(true);
    expect(controller.pointerDown(axis)).toBe(false);
    expect(controller.wheel(axis, 0, -120)).toBe(false);
    expect(controller.snapshot.frame.priceScale.range).toEqual(frame.priceScale.range);

    expect(controller.scrollTimeByBars(-10)).toBe(true);
    expect(controller.setPriceScaleLocked(false)).toBe(true);
    expect(controller.wheel(axis, 0, -120)).toBe(true);
  });

  it('inverts the price scale without changing its range or time scale', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const price = 105;
    const normalCoordinate = priceToCoordinate(price, frame.priceScale);

    expect(controller.invertPriceScale()).toBe(true);

    const invertedScale = controller.snapshot.frame.priceScale;
    expect(invertedScale.inverted).toBe(true);
    expect(invertedScale.range).toEqual(frame.priceScale.range);
    expect(invertedScale.height).toBe(frame.priceScale.height);
    expect(controller.snapshot.frame.timeScale).toBe(frame.timeScale);
    expect(priceToCoordinate(price, invertedScale)).toBeCloseTo(
      frame.priceScale.height - normalCoordinate,
    );
  });

  it('notifies when a user manually interacts with the price scale', () => {
    const onPriceScaleInteraction = vi.fn();
    const controller = createChartInteractionController(createFrame(), {
      onPriceScaleInteraction,
    });

    controller.pointerDown(centerOfPriceScale());
    expect(onPriceScaleInteraction).toHaveBeenCalledTimes(1);
    controller.pointerCancel();
    controller.wheel(centerOfPriceScale(), 0, -120);
    expect(onPriceScaleInteraction).toHaveBeenCalledTimes(2);
  });

  it('zooms around the logical index under the wheel pointer', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const anchor = {
      x: frame.layout.plotArea.x + frame.layout.plotArea.width * 0.35,
      y: frame.layout.plotArea.y + 100,
    };
    const localAnchorX = anchor.x - frame.layout.plotArea.x;
    const logicalIndex = coordinateToLogicalIndex(localAnchorX, frame.timeScale);

    expect(controller.wheel(anchor, 0, -120)).toBe(true);

    const nextFrame = controller.snapshot.frame;

    expect(nextFrame.timeScale.barSpacing).toBeGreaterThan(frame.timeScale.barSpacing);
    expect(logicalIndexToCoordinate(logicalIndex, nextFrame.timeScale)).toBeCloseTo(localAnchorX);
    expect(controller.snapshot.crosshair).toEqual(anchor);
  });

  it('pans horizontally for horizontal wheel input', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const anchor = centerOfPlot(frame);
    const previousLogicalIndex = 50;
    const previousX =
      frame.layout.plotArea.x + logicalIndexToCoordinate(previousLogicalIndex, frame.timeScale);

    expect(controller.wheel(anchor, 50, 0)).toBe(true);

    const nextFrame = controller.snapshot.frame;
    const nextX =
      nextFrame.layout.plotArea.x +
      logicalIndexToCoordinate(previousLogicalIndex, nextFrame.timeScale);

    expect(nextX).toBe(previousX - 50);
    expect(nextFrame.timeScale.barSpacing).toBe(frame.timeScale.barSpacing);
  });

  it('applies horizontal pan and vertical zoom for trackpad wheel deltas', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);

    controller.wheel(centerOfPlot(frame), 20, -60);

    expect(controller.snapshot.frame.timeScale.rightOffset).not.toBe(frame.timeScale.rightOffset);
    expect(controller.snapshot.frame.timeScale.barSpacing).toBeGreaterThan(
      frame.timeScale.barSpacing,
    );
  });

  it('does not handle wheel input outside the plot or with no movement', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);

    expect(controller.wheel({ x: 10, y: 10 }, 0, -100)).toBe(false);
    expect(controller.wheel(centerOfPlot(frame), 0, 0)).toBe(false);
  });

  it('keeps the time scale within its configured zoom limits', () => {
    const frame = createChartFrame(900, 500, { min: 90, max: 120 }, 99, {
      timeScale: { barSpacing: 50, maxBarSpacing: 50 },
    });
    const controller = createChartInteractionController(frame);

    controller.wheel(centerOfPlot(frame), 0, -120);

    expect(controller.snapshot.frame.timeScale.barSpacing).toBe(50);
  });

  it('notifies subscribers only when interaction state changes', () => {
    const onChange = vi.fn();
    const controller = createChartInteractionController(createFrame(), { onChange });
    const center = centerOfPlot();

    controller.pointerMove(center);
    controller.pointerMove(center);
    controller.pointerLeave();
    controller.pointerLeave();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]?.[0].crosshair).toEqual(center);
    expect(onChange.mock.calls[1]?.[0].crosshair).toBeNull();
  });

  it('resets pointer state when the host replaces the chart frame', () => {
    const controller = createChartInteractionController(createFrame());
    const center = centerOfPlot();

    controller.pointerDown(center);
    controller.setFrame(createChartFrame(900, 500, { min: 80, max: 130 }, 120));

    expect(controller.snapshot.dragging).toBe(false);
    expect(controller.snapshot.crosshair).toBeNull();
    expect(controller.snapshot.frame.priceScale.range).toEqual({ min: 80, max: 130 });
  });

  it('scrolls the visible time range by a precise number of bars', () => {
    const controller = createChartInteractionController(createFrame());
    const initialRange = controller.snapshot.frame.timeScale.visibleLogicalRange;

    expect(controller.scrollTimeByBars(-20)).toBe(true);
    expect(controller.snapshot.frame.timeScale.visibleLogicalRange.from).toBeCloseTo(
      initialRange.from - 20,
    );
    expect(controller.snapshot.frame.timeScale.visibleLogicalRange.to).toBeCloseTo(
      initialRange.to - 20,
    );
  });

  it('returns to the realtime edge without changing the current zoom level', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);

    controller.scrollTimeByBars(-35);
    expect(controller.snapshot.frame.timeScale.rightOffset).toBe(-35);

    expect(controller.scrollToRealtime()).toBe(true);
    expect(controller.snapshot.frame.timeScale.rightOffset).toBe(0);
    expect(controller.snapshot.frame.timeScale.barSpacing).toBe(frame.timeScale.barSpacing);
    expect(controller.scrollToRealtime()).toBe(false);
  });

  it('zooms the time scale around an explicit anchor coordinate', () => {
    const frame = createFrame();
    const controller = createChartInteractionController(frame);
    const anchor = frame.timeScale.width * 0.3;
    const logicalIndex = coordinateToLogicalIndex(anchor, frame.timeScale);

    expect(controller.zoomTime(1.5, anchor)).toBe(true);
    expect(controller.snapshot.frame.timeScale.barSpacing).toBeGreaterThan(
      frame.timeScale.barSpacing,
    );
    expect(logicalIndexToCoordinate(logicalIndex, controller.snapshot.frame.timeScale)).toBeCloseTo(
      anchor,
    );
  });

  it('rejects invalid pointer, wheel and sensitivity values', () => {
    expect(() =>
      createChartInteractionController(createFrame(), { wheelZoomSensitivity: 0 }),
    ).toThrow(RangeError);

    const controller = createChartInteractionController(createFrame());

    expect(() => controller.pointerMove({ x: Number.NaN, y: 0 })).toThrow(RangeError);
    expect(() => controller.pointerDown({ x: 0, y: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => controller.wheel(centerOfPlot(), 0, Number.NaN)).toThrow(RangeError);
  });
});
