import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createElement, useRef } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  useMessageScrollOrchestration,
  type UseMessageScrollOrchestrationOptions,
  type UseMessageScrollOrchestrationResult,
} from './useMessageScrollOrchestration';

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
};

let happy: GlobalWindow;
let root: Root | null = null;

beforeEach(() => {
  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number;
  g.cancelAnimationFrame = (handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  const g = globalThis as G;
  delete g.window;
  delete g.document;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
});

type Overrides = Partial<UseMessageScrollOrchestrationOptions>;

function renderOrchestration(overrides: Overrides): {
  result: UseMessageScrollOrchestrationResult;
  opts: UseMessageScrollOrchestrationOptions;
} {
  const captured = {} as {
    result: UseMessageScrollOrchestrationResult;
    opts: UseMessageScrollOrchestrationOptions;
  };

  function Harness() {
    const scrollViewportRef = useRef<HTMLDivElement | null>(happy.document.createElement('div') as unknown as HTMLDivElement);
    const messagesContentRef = useRef<HTMLDivElement | null>(happy.document.createElement('div') as unknown as HTMLDivElement);
    const isAtBottomRef = useRef<boolean>(false);
    const historyAnchorActiveRef = useRef<boolean>(false);

    const opts: UseMessageScrollOrchestrationOptions = {
      entityId: 'c1',
      activeEntityId: 'c1',
      messageLayoutKey: 'k',
      flatItems: [],
      messagesLoading: false,
      hasOlderCursor: false,
      hasNewerPages: false,
      loadOlder: mock(() => {}),
      loadNewer: mock(() => {}),
      scrollViewportRef,
      messagesContentRef,
      isAtBottomRef,
      scrollToBottom: mock(() => {}),
      setIsAtBottom: mock(() => {}),
      pinToBottom: mock(() => {}),
      historyAnchorActiveRef,
      cachedScrollIndex: null,
      ...overrides,
    };
    captured.opts = opts;
    captured.result = useMessageScrollOrchestration(opts);
    return null;
  }

  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(Harness));
  });
  return captured;
}

const nextFrames = async () => {
  // Two nested rAFs (each polyfilled as setTimeout(0)) before the scroll lands.
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('useMessageScrollOrchestration jump-to-latest', () => {
  it('reloads the latest page when the buffer is detached (hasNewerPages)', async () => {
    const jumpToLatest = mock(async () => {});
    const pinToBottom = mock(() => {});
    const scrollToBottom = mock(() => {});
    const { result } = renderOrchestration({
      hasNewerPages: true,
      jumpToLatest,
      pinToBottom,
      scrollToBottom,
    });

    await act(async () => {
      await result.handleJumpToLatest();
      await nextFrames();
    });

    // Detached buffer must reload from the tip, not just scroll the window.
    expect(jumpToLatest).toHaveBeenCalledTimes(1);
    expect(jumpToLatest.mock.calls[0]![0]).toBe('c1');
    // Pins synchronously so follow/layout-pin engages before the scroll lands.
    expect(pinToBottom).toHaveBeenCalled();
    expect(scrollToBottom).toHaveBeenCalled();
  });

  it('does not reload on the fast path when already at the live tail', async () => {
    const jumpToLatest = mock(async () => {});
    const scrollToBottom = mock(() => {});
    const { result } = renderOrchestration({
      hasNewerPages: false,
      jumpToLatest,
      scrollToBottom,
    });

    await act(async () => {
      await result.handleJumpToLatest();
      await nextFrames();
    });

    // No latestMessageId wired (Spaces): "no newer pages, not loading" is the tip.
    expect(jumpToLatest).not.toHaveBeenCalled();
    expect(scrollToBottom).toHaveBeenCalledWith('smooth');
  });
});
