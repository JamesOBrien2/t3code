import "@fontsource-variable/inter";
import ReactDOM from "react-dom/client";

import "./index.css";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";

type QuitHintListener = (hint: unknown) => void;

const listeners = new Set<QuitHintListener>();

// The overlay only subscribes through the Electron preload bridge.
window.desktopBridge = {
  onQuitShortcut: (listener: QuitHintListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
} as unknown as typeof window.desktopBridge;

(window as unknown as { emitQuitHint: (hint: unknown) => void }).emitQuitHint = (hint) => {
  for (const listener of listeners) listener(hint);
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<QuitHoldOverlay />);
