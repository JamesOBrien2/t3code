import { useSyncExternalStore } from "react";

import { isMacPlatform } from "../lib/utils";

const HOLD_HINT_LINGER_MS = 1200;

type QuitHintMode = "hold" | "double-click";
type QuitHint = { readonly mode: QuitHintMode; readonly remainingMs: number | null };

let visibleHint: QuitHint | null = null;
let pressedMode: QuitHintMode = "hold";
let hideTimer: number | undefined;
const listeners = new Set<() => void>();
let stopBridge: (() => void) | null = null;

function setVisibleHint(next: QuitHint | null) {
  if (next === visibleHint) return;
  visibleHint = next;
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
          setVisibleHint({
            mode: hint.mode,
            remainingMs: hint.mode === "hold" ? hint.remainingMs : null,
          });
          return;
        }
        if (pressedMode === "double-click") {
          setVisibleHint(null);
          return;
        }
        if (visibleHint) setVisibleHint({ ...visibleHint, remainingMs: null });
        hideTimer = window.setTimeout(() => setVisibleHint(null), HOLD_HINT_LINGER_MS);
      }) ?? null;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearTimeout(hideTimer);
    stopBridge?.();
    stopBridge = null;
    visibleHint = null;
  };
}

const readQuitHint = () => visibleHint;

export function QuitHoldOverlay() {
  const hint = useSyncExternalStore(subscribeQuitHint, readQuitHint, readQuitHint);

  if (!hint) return null;
  const { mode: visibleMode, remainingMs: holdRemainingMs } = hint;
  const shortcut = isMacPlatform(navigator.platform) ? "⌘ Q" : "Ctrl Q";
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[22%] z-100 flex justify-center"
    >
      <div className="relative rounded-2xl bg-popover px-6 py-4 text-center text-popover-foreground shadow-xl ring-1 ring-border">
        {visibleMode === "hold" ? (
          <svg
            aria-hidden
            focusable="false"
            data-holding={holdRemainingMs !== null ? "true" : undefined}
            className="quit-hold-trace"
          >
            <rect
              width="100%"
              height="100%"
              rx="16"
              pathLength="1"
              style={
                holdRemainingMs !== null
                  ? { animationDuration: `${Math.max(0, holdRemainingMs)}ms` }
                  : undefined
              }
            />
          </svg>
        ) : null}
        <div className="flex items-center justify-center gap-2 text-base font-medium">
          {visibleMode === "hold" ? "Hold" : "Press"}
          <kbd className="rounded-md bg-muted px-2 py-0.5 font-sans text-sm font-medium ring-1 ring-border">
            {shortcut}
          </kbd>
          {visibleMode === "hold" ? "to quit" : "again to quit"}
        </div>
        {visibleMode === "hold" ? (
          <div className="mt-1.5 text-xs text-muted-foreground">or press twice</div>
        ) : null}
      </div>
    </div>
  );
}
