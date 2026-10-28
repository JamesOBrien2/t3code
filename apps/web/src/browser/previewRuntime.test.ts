import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

vi.mock("~/env", () => ({ isElectron: true }));
vi.mock("~/previewStateStore", () => ({ isPreviewSupportedInRuntime: () => true }));
vi.mock("~/rpc/atomRegistry", () => ({ appAtomRegistry: { get: () => null } }));
vi.mock("~/state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: {} }));
vi.mock("~/state/entities", () => ({
  readEnvironmentSupportsServerBrowser: () => true,
  useEnvironmentSupportsServerBrowser: () => true,
}));

import { rendersServerTabNatively } from "./previewRuntime";

it("streams browser tabs from an existing server instead of opening a separate native page", () => {
  const bootstrap = { id: "primary", externallyManaged: true };
  vi.stubGlobal("window", { desktopBridge: { getLocalEnvironmentBootstraps: () => [bootstrap] } });
  try {
    const environmentId = EnvironmentId.make("local");
    const snapshot = { runtime: "server", headless: false } as const;
    expect(rendersServerTabNatively(environmentId, environmentId, snapshot)).toBe(false);
    bootstrap.externallyManaged = false;
    expect(rendersServerTabNatively(environmentId, environmentId, snapshot)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
