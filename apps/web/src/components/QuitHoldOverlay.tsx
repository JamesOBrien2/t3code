import { useSyncExternalStore } from "react";

import { isMacPlatform } from "../lib/utils";

const HOLD_HINT_LINGER_MS = 1200;

type QuitHintMode = "hold" | "double-click";

interface QuitHintState {
  readonly mode: QuitHintMode | null;
  readonly remainingMs: number | null;
}

let state: QuitHintState = { mode: null, remainingMs: null };
let pressedMode: QuitHintMode = "hold";
let hideTimer: number | undefined;
const listeners = new Set<() => void>();
let stopBridge: (() => void) | null = null;

function setState(next: QuitHintState) {
  if (next.mode === state.mode && next.remainingMs === state.remainingMs) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribeQuitHint(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    stopBridge =
      window.desktopBridge?.onQuitShortcut((hint) => {
        window.clearTimeout(hideTimer);
        if (hint.state === "down") {
          pressedMode = hint.mode;
          setState({
            mode: hint.mode,
            remainingMs: hint.mode === "hold" ? hint.remainingMs : null,
          });
          return;
        }
        setState({ mode: state.mode, remainingMs: null });
        if (pressedMode === "double-click") {
          setState({ mode: null, remainingMs: null });
          return;
        }
        hideTimer = window.setTimeout(
          () => setState({ mode: null, remainingMs: null }),
          HOLD_HINT_LINGER_MS,
        );
      }) ?? null;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearTimeout(hideTimer);
    stopBridge?.();
    stopBridge = null;
    state = { mode: null, remainingMs: null };
  };
}

const readQuitHint = () => state;

export function QuitHoldOverlay() {
  const hint = useSyncExternalStore(subscribeQuitHint, readQuitHint, readQuitHint);

  if (!hint.mode) return null;
  const shortcut = isMacPlatform(navigator.platform) ? "⌘Q" : "Ctrl+Q";
  const message =
    hint.mode === "hold"
      ? `Hold ${shortcut} or press twice to quit`
      : `Press ${shortcut} again to quit`;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[22%] z-100 flex justify-center"
    >
      <div className="relative rounded-full bg-foreground/95 px-8 py-4 text-2xl font-bold text-background shadow-xl">
        {hint.mode === "hold" ? (
          <svg aria-hidden className="quit-hold-trace" width="100%" height="100%">
            <rect className="quit-hold-track" />
            <rect
              className="quit-hold-progress"
              data-holding={hint.remainingMs !== null ? "true" : undefined}
              style={
                hint.remainingMs !== null
                  ? { animationDuration: `${Math.max(0, hint.remainingMs)}ms` }
                  : undefined
              }
              pathLength="100"
            />
          </svg>
        ) : null}
        {message}
      </div>
    </div>
  );
}
