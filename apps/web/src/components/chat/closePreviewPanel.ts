import type { ScopedThreadRef } from "@t3tools/contracts";

import { useRightPanelStore } from "../../rightPanelStore";

/**
 * Dismiss the right panel without inventing a floating preview.
 *
 * The mini-player store is the source of truth: a float that was already open
 * stays across a temporary dock into the panel, and clearing it via
 * "Close floating preview" must still stick when the panel closes afterward.
 */
export function closePreviewPanel(threadRef: ScopedThreadRef): void {
  useRightPanelStore.getState().setMaximized(threadRef, false);
  useRightPanelStore.getState().close(threadRef);
}
