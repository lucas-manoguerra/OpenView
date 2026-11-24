import { describe, expect, it, vi } from 'vitest';
import {
  attachCanvasResizeObserver,
  type CanvasResize,
  type CanvasResizeObserverHandle,
} from './src/canvas-resize-adapter';

type ResizeListener = EventListenerOrEventListenerObject;

const createWindowTarget = (): Readonly<{
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  dispatchResize(): void;
  listenerCount(): number;
}> => {
  const listeners = new Set<ResizeListener>();
  const target = {
    addEventListener: (_type: string, listener: ResizeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ResizeListener) => listeners.delete(listener),
  } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;

  return {
    target,
    dispatchResize: () => {
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener.call(target, new Event('resize'));
        } else {
          listener.handleEvent(new Event('resize'));
        }
      }
    },
    listenerCount: () => listeners.size,
  };
};

const createCanvas = (bounds: { width: number; height: number }): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () =>
      ({
        left: 0,
        top: 0,
        width: bounds.width,
        height: bounds.height,
        right: bounds.width,
        bottom: bounds.height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  }) as HTMLCanvasElement;

describe('canvas resize observer adapter', () => {
  it('emits the initial canvas size in logical pixels and current device pixel ratio', () => {
    const bounds = { width: 640, height: 360 };
    const canvas = createCanvas(bounds);
    const windowTarget = createWindowTarget();
    const onResize = vi.fn<(size: CanvasResize) => void>();
    const observer = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    } satisfies CanvasResizeObserverHandle;

    attachCanvasResizeObserver(canvas, onResize, {
      createObserver: () => observer,
      getDevicePixelRatio: () => 2,
      windowTarget: windowTarget.target,
    });

    expect(observer.observe).toHaveBeenCalledWith(canvas);
    expect(onResize).toHaveBeenCalledWith({
      width: 640,
      height: 360,
      devicePixelRatio: 2,
    });
  });

  it('emits ResizeObserver content dimensions for the observed canvas', () => {
    const canvas = createCanvas({ width: 640, height: 360 });
    const windowTarget = createWindowTarget();
    const onResize = vi.fn<(size: CanvasResize) => void>();
    const observerCallback: { current: ((entries: readonly ResizeObserverEntry[]) => void) | null } = { current: null };

    attachCanvasResizeObserver(canvas, onResize, {
      createObserver: (callback) => {
        observerCallback.current = callback;
        return { observe: vi.fn(), disconnect: vi.fn() };
      },
      getDevicePixelRatio: () => 1.5,
      windowTarget: windowTarget.target,
    });

    const entry = {
      target: canvas,
      contentRect: { width: 820, height: 420 },
    } as ResizeObserverEntry;

    observerCallback.current?.([entry]);

    expect(onResize).toHaveBeenLastCalledWith({
      width: 820,
      height: 420,
      devicePixelRatio: 1.5,
    });
  });

  it('refreshes measured dimensions and pixel ratio after a window resize', () => {
    const bounds = { width: 640, height: 360 };
    const canvas = createCanvas(bounds);
    const windowTarget = createWindowTarget();
    const onResize = vi.fn<(size: CanvasResize) => void>();
    let devicePixelRatio = 1;
    const adapter = attachCanvasResizeObserver(canvas, onResize, {
      createObserver: () => ({ observe: vi.fn(), disconnect: vi.fn() }),
      getDevicePixelRatio: () => devicePixelRatio,
      windowTarget: windowTarget.target,
    });

    bounds.width = 900;
    bounds.height = 480;
    devicePixelRatio = 2;
    windowTarget.dispatchResize();

    expect(onResize).toHaveBeenLastCalledWith({
      width: 900,
      height: 480,
      devicePixelRatio: 2,
    });

    adapter.destroy();
  });

  it('disconnects the observer and removes the window listener on destruction', () => {
    const canvas = createCanvas({ width: 640, height: 360 });
    const windowTarget = createWindowTarget();
    const observer = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    } satisfies CanvasResizeObserverHandle;
    const adapter = attachCanvasResizeObserver(canvas, vi.fn(), {
      createObserver: () => observer,
      getDevicePixelRatio: () => 1,
      windowTarget: windowTarget.target,
    });

    expect(windowTarget.listenerCount()).toBe(1);

    adapter.destroy();
    adapter.destroy();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(windowTarget.listenerCount()).toBe(0);
  });

  it('rejects invalid dimensions and pixel ratios', () => {
    const canvas = createCanvas({ width: 640, height: 360 });
    const windowTarget = createWindowTarget();

    expect(() =>
      attachCanvasResizeObserver(canvas, vi.fn(), {
        createObserver: () => ({ observe: vi.fn(), disconnect: vi.fn() }),
        getDevicePixelRatio: () => 0,
        windowTarget: windowTarget.target,
      }),
    ).toThrow(RangeError);

    expect(windowTarget.listenerCount()).toBe(0);
  });

  it('does not emit entries belonging to other elements', () => {
    const canvas = createCanvas({ width: 640, height: 360 });
    const otherCanvas = createCanvas({ width: 320, height: 180 });
    const windowTarget = createWindowTarget();
    const onResize = vi.fn<(size: CanvasResize) => void>();
    const observerCallback: { current: ((entries: readonly ResizeObserverEntry[]) => void) | null } = { current: null };

    attachCanvasResizeObserver(canvas, onResize, {
      createObserver: (callback) => {
        notifyObserver = callback;
        return { observe: vi.fn(), disconnect: vi.fn() };
      },
      getDevicePixelRatio: () => 1,
      windowTarget: windowTarget.target,
    });
    onResize.mockClear();

    observerCallback.current?.([
      {
        target: otherCanvas,
        contentRect: { width: 320, height: 180 },
      } as ResizeObserverEntry,
    ]);

    expect(onResize).not.toHaveBeenCalled();
  });
});
