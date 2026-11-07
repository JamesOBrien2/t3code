import { useEffect, useState } from "react";

import { isMacPlatform } from "../lib/utils";

const HOLD_HINT_LINGER_MS = 1200;

export function QuitHoldOverlay() {
  const [visibleMode, setVisibleMode] = useState<"hold" | "double-click" | null>(null);
  const [holdRemainingMs, setHoldRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const subscribe = window.desktopBridge?.onQuitShortcut;
    if (!subscribe) return;
    let hideTimer: number | undefined;
    let pressedMode: "hold" | "double-click" = "hold";
    const unsubscribe = subscribe((hint) => {
      window.clearTimeout(hideTimer);
      if (hint.state === "down") {
        pressedMode = hint.mode;
        setVisibleMode(hint.mode);
        setHoldRemainingMs(hint.mode === "hold" ? hint.remainingMs : null);
        return;
      }
      setHoldRemainingMs(null);
      if (pressedMode === "double-click") {
        setVisibleMode(null);
        return;
      }
      hideTimer = window.setTimeout(() => setVisibleMode(null), HOLD_HINT_LINGER_MS);
    });
    return () => {
      window.clearTimeout(hideTimer);
      unsubscribe();
    };
  }, []);

  if (!visibleMode) return null;
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
