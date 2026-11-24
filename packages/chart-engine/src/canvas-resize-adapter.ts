export type CanvasResize = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
}>;

export type CanvasResizeObserverHandle = Readonly<{
  observe(target: Element): void;
  disconnect(): void;
}>;

export type CanvasResizeAdapterOptions = Readonly<{
  createObserver?: (
    callback: (entries: readonly ResizeObserverEntry[]) => void,
  ) => CanvasResizeObserverHandle;
  getDevicePixelRatio?: () => number;
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}>;

export type CanvasResizeAdapter = Readonly<{
  destroy(): void;
}>;

const createBrowserObserver = (
  callback: (entries: readonly ResizeObserverEntry[]) => void,
): CanvasResizeObserverHandle => new ResizeObserver((entries) => callback(entries));

const getBrowserWindow = (): Window => window;

export const attachCanvasResizeObserver = (
  canvas: HTMLCanvasElement,
  onResize: (size: CanvasResize) => void,
  options: CanvasResizeAdapterOptions = {},
): CanvasResizeAdapter => {
  const windowTarget = options.windowTarget ?? getBrowserWindow();
  const getDevicePixelRatio = options.getDevicePixelRatio ?? (() => window.devicePixelRatio || 1);
  let destroyed = false;

  const emitSize = (width: number, height: number): void => {
    if (destroyed) {
      return;
    }

    const devicePixelRatio = getDevicePixelRatio();

    if (
      ![width, height, devicePixelRatio].every(Number.isFinite) ||
      width < 0 ||
      height < 0 ||
      devicePixelRatio <= 0
    ) {
      throw new RangeError('Canvas resize values must be finite and non-negative with a positive pixel ratio.');
    }

    onResize(Object.freeze({ width, height, devicePixelRatio }));
  };

  const emitMeasuredSize = (): void => {
    const bounds = canvas.getBoundingClientRect();
    emitSize(bounds.width, bounds.height);
  };

  const observer = (options.createObserver ?? createBrowserObserver)((entries) => {
    for (const entry of entries) {
      if (entry.target === canvas) {
        emitSize(entry.contentRect.width, entry.contentRect.height);
      }
    }
  });

  const handleWindowResize = (): void => {
    emitMeasuredSize();
  };

  emitMeasuredSize();
  observer.observe(canvas);
  windowTarget.addEventListener('resize', handleWindowResize);

  return Object.freeze({
    destroy: (): void => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      observer.disconnect();
      windowTarget.removeEventListener('resize', handleWindowResize);
    },
  });
};
