import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import serverPackageJson from "../../../server/package.json" with { type: "json" };
import { connectExistingServer } from "./DesktopExistingServer.ts";
import type { DesktopBackendStartConfig } from "./DesktopBackendManager.ts";

const config: DesktopBackendStartConfig = {
  executablePath: "/electron",
  args: ["/server/bin.mjs"],
  entryPath: "/server/bin.mjs",
  cwd: "/server",
  stateDir: "/selected-home/userdata",
  env: {},
  extendEnv: true,
  bootstrap: {
    mode: "desktop",
    t3Home: "/selected-home",
    noBrowser: true,
    port: 3773,
    host: "127.0.0.1",
    desktopBootstrapToken: "launch-token",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  },
  bootstrapDelivery: "fd3",
  httpBaseUrl: new URL("http://127.0.0.1:3773"),
  captureOutput: true,
  preflightFailure: Option.none(),
};

describe("connectExistingServer", () => {
  it.effect("refuses incompatible or mismatched servers before issuing a credential", () =>
    Effect.gen(function* () {
      for (const scenario of ["older", "legacy", "dev", "different-home", "unreachable"] as const) {
        const result = yield* connectExistingServer(config).pipe(
          Effect.provide(
            Layer.mergeAll(
              FileSystem.layerNoop({
                readFileString: (path) =>
                  Effect.succeed(
                    path.endsWith("environment-id")
                      ? "selected-environment"
                      : JSON.stringify({
                          version: 1,
                          pid: process.pid,
                          port: 4888,
                          origin: "http://127.0.0.1:4888",
                          startedAt: "2026-10-28T00:00:00Z",
                          ownerId: scenario === "legacy" ? undefined : "owner",
                          serverVersion: scenario === "older" ? "0.0.1" : serverPackageJson.version,
                          ...(scenario === "dev" ? { devUrl: "http://localhost:5173" } : {}),
                        }),
                  ),
              }),
              Layer.succeed(
                HttpClient.HttpClient,
                HttpClient.make((request) =>
                  Effect.succeed(
                    HttpClientResponse.fromWeb(
                      request,
                      Response.json(
                        {
                          environmentId:
                            scenario === "different-home"
                              ? "other-environment"
                              : "selected-environment",
                          label: "Local",
                          platform: { os: "darwin", arch: "arm64" },
                          serverVersion: serverPackageJson.version,
                          capabilities: {},
                        },
                        { status: scenario === "unreachable" ? 503 : 200 },
                      ),
                    ),
                  ),
                ),
              ),
              Layer.succeed(
                ChildProcessSpawner.ChildProcessSpawner,
                ChildProcessSpawner.make(() =>
                  Effect.die("must not issue a credential for an unverified server"),
                ),
              ),
            ),
          ),
          Effect.result,
        );
        assert.equal(result._tag, "Failure", scenario);
      }
    }),
  );

  it.effect("ignores a dead server record without probing its reused port", () =>
    Effect.gen(function* () {
      assert.isTrue(Option.isNone(yield* connectExistingServer(config)));
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          FileSystem.layerNoop({
            readFileString: () =>
              Effect.succeed(
                JSON.stringify({
                  version: 1,
                  pid: 2_147_483_647,
                  ownerId: "stale",
                  port: 4888,
                  origin: "http://127.0.0.1:4888",
                  startedAt: "2026-10-28T00:00:00Z",
                  serverVersion: serverPackageJson.version,
                }),
              ),
          }),
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("must not probe a stale port")),
          ),
          Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() => Effect.die("must not issue a session")),
          ),
        ),
      ),
    ),
  );
});
