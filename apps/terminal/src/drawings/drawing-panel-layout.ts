export type DrawingPanelId = 'appearance' | 'coordinates';

export type DrawingPanelPosition = Readonly<{
  left: number;
  top: number;
}>;

export type DrawingPanelLayout = Readonly<{
  positions: Readonly<Record<DrawingPanelId, DrawingPanelPosition | null>>;
  visible: Readonly<Record<DrawingPanelId, boolean>>;
}>;

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'openview.chart.drawing-panel-layout';
const STORAGE_VERSION = 1;

export const DEFAULT_DRAWING_PANEL_LAYOUT: DrawingPanelLayout = Object.freeze({
  positions: Object.freeze({
    appearance: null,
    coordinates: null,
  }),
  visible: Object.freeze({
    appearance: true,
    coordinates: true,
  }),
});

const restorePosition = (value: unknown): DrawingPanelPosition | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const left = Reflect.get(value, 'left');
  const top = Reflect.get(value, 'top');

  if (
    typeof left !== 'number' ||
    typeof top !== 'number' ||
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    left < 0 ||
    top < 0 ||
    left > 100_000 ||
    top > 100_000
  ) {
    return null;
  }

  return Object.freeze({ left, top });
};

export const restoreDrawingPanelLayout = (serialized: string | null): DrawingPanelLayout => {
  if (serialized === null) {
    return DEFAULT_DRAWING_PANEL_LAYOUT;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Reflect.get(parsed, 'version') !== STORAGE_VERSION
    ) {
      return DEFAULT_DRAWING_PANEL_LAYOUT;
    }

    const savedPositions = Reflect.get(parsed, 'positions');
    const savedVisibility = Reflect.get(parsed, 'visible');

    if (
      typeof savedPositions !== 'object' ||
      savedPositions === null ||
      typeof savedVisibility !== 'object' ||
      savedVisibility === null
    ) {
      return DEFAULT_DRAWING_PANEL_LAYOUT;
    }

    return Object.freeze({
      positions: Object.freeze({
        appearance: restorePosition(Reflect.get(savedPositions, 'appearance')),
        coordinates: restorePosition(Reflect.get(savedPositions, 'coordinates')),
      }),
      visible: Object.freeze({
        appearance:
          typeof Reflect.get(savedVisibility, 'appearance') === 'boolean'
            ? Reflect.get(savedVisibility, 'appearance')
            : DEFAULT_DRAWING_PANEL_LAYOUT.visible.appearance,
        coordinates:
          typeof Reflect.get(savedVisibility, 'coordinates') === 'boolean'
            ? Reflect.get(savedVisibility, 'coordinates')
            : DEFAULT_DRAWING_PANEL_LAYOUT.visible.coordinates,
      }),
    });
  } catch {
    return DEFAULT_DRAWING_PANEL_LAYOUT;
  }
};

export const loadDrawingPanelLayout = (storage: StringStorage | null): DrawingPanelLayout => {
  if (storage === null) {
    return DEFAULT_DRAWING_PANEL_LAYOUT;
  }

  try {
    return restoreDrawingPanelLayout(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DRAWING_PANEL_LAYOUT;
  }
};

export const saveDrawingPanelLayout = (
  storage: StringStorage | null,
  layout: DrawingPanelLayout,
): void => {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        positions: layout.positions,
        visible: layout.visible,
      }),
    );
  } catch {
    return;
  }
};

const getBrowserStorage = (): StringStorage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadBrowserDrawingPanelLayout = (): DrawingPanelLayout =>
  loadDrawingPanelLayout(getBrowserStorage());

export const saveBrowserDrawingPanelLayout = (layout: DrawingPanelLayout): void => {
  saveDrawingPanelLayout(getBrowserStorage(), layout);
};

export const startDrawingPanelDrag = (
  event: PointerEvent,
  panel: HTMLElement,
  onPositionChange: (position: DrawingPanelPosition) => void,
  onDragEnd: () => void,
): (() => void) | null => {
  const parent = panel.parentElement;

  if (event.button !== 0 || parent === null) {
    return null;
  }

  event.preventDefault();

  const pointerId = event.pointerId;
  const dragTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = panel.offsetLeft;
  const startTop = panel.offsetTop;
  let active = true;

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    if (dragTarget?.hasPointerCapture(pointerId)) {
      dragTarget.releasePointerCapture(pointerId);
    }
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', handlePointerEnd, true);
    window.removeEventListener('pointercancel', handlePointerEnd, true);
    onDragEnd();
  };

  const handlePointerMove = (pointerEvent: PointerEvent): void => {
    if (!active || pointerEvent.pointerId !== pointerId) {
      return;
    }

    const maxLeft = Math.max(0, parent.clientWidth - panel.offsetWidth);
    const maxTop = Math.max(0, parent.clientHeight - panel.offsetHeight);
    const left = Math.max(0, Math.min(maxLeft, startLeft + pointerEvent.clientX - startX));
    const top = Math.max(0, Math.min(maxTop, startTop + pointerEvent.clientY - startY));

    panel.style.left = String(left) + 'px';
    panel.style.top = String(top) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    onPositionChange(Object.freeze({ left, top }));
  };

  const handlePointerEnd = (pointerEvent: PointerEvent): void => {
    if (pointerEvent.pointerId === pointerId) {
      cleanup();
    }
  };

  try {
    dragTarget?.setPointerCapture(pointerId);
  } catch {
    return cleanup;
  }

  window.addEventListener('pointermove', handlePointerMove, true);
  window.addEventListener('pointerup', handlePointerEnd, true);
  window.addEventListener('pointercancel', handlePointerEnd, true);

  return cleanup;
};
