// @effect-diagnostics nodeBuiltinImport:off -- Desktop discovery reads metadata on the native host before connecting.
import * as NodePath from "node:path";

import { ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import {
  isProcessAlive,
  readPersistedServerRuntimeState,
} from "@t3tools/shared/serverRuntimeState";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import serverPackageJson from "../../../server/package.json" with { type: "json" };
import type { DesktopBackendStartConfig } from "./DesktopBackendManager.ts";

export class DesktopExistingServerError extends Schema.TaggedError<DesktopExistingServerError>()(
  "DesktopExistingServerError",
  {
    reason: Schema.Literals([
      "incompatible-server",
      "different-environment",
      "session-issue-failed",
      "server-replaced",
      "connect-failed",
    ]),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message() {
    switch (this.reason) {
      case "incompatible-server":
        return "T3 Code cannot connect to the server already using this T3 home because it is incompatible. Update or stop that server, then reopen the app.";
      case "different-environment":
        return "T3 Code found a different environment at the existing server address. Check the server address and T3 home, then reopen the app.";
      case "session-issue-failed":
        return "T3 Code could not create a desktop session for the existing server. Check the desktop logs for details, then reopen the app.";
      case "server-replaced":
        return "The existing T3 Code server changed while the app was connecting. Reopen the app to connect again.";
      case "connect-failed":
        return "T3 Code could not connect to the server already using this T3 home. Check that the server is running and inspect the desktop logs, then reopen the app.";
    }
  }
}

const decodeSession = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ token: Schema.NonEmptyString })),
);
const isDesktopExistingServerError = Schema.is(DesktopExistingServerError);

export const connectExistingServer = Effect.fn("desktop.existingServer.connect")(
  function* (config: DesktopBackendStartConfig) {
    const baseDir = config.bootstrap.t3Home;
    if (config.stateDir === undefined || baseDir === undefined)
      return Option.none<DesktopBackendStartConfig>();
    const statePath = NodePath.join(config.stateDir, "server-runtime.json");
    const runtime = yield* readPersistedServerRuntimeState(statePath);
    if (Option.isNone(runtime) || !isProcessAlive(runtime.value.pid)) {
      return Option.none<DesktopBackendStartConfig>();
    }
    const running = runtime.value;
    // The bundled CLI opens auth storage; an older server must never get newer migrations.
    if (!running.ownerId || running.devUrl || running.serverVersion !== serverPackageJson.version) {
      return yield* new DesktopExistingServerError({ reason: "incompatible-server" });
    }
    const fs = yield* FileSystem.FileSystem;
    const environmentId = (yield* fs.readFileString(
      NodePath.join(config.stateDir, "environment-id"),
    )).trim();
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.get(new URL("/.well-known/t3/environment", running.origin).href),
    );
    const descriptor = yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(ExecutionEnvironmentDescriptor)),
    );
    if (
      descriptor.environmentId !== environmentId ||
      descriptor.serverVersion !== running.serverVersion
    ) {
      return yield* new DesktopExistingServerError({ reason: "different-environment" });
    }
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const session = yield* Effect.scoped(
      Effect.gen(function* () {
        const process = yield* spawner.spawn(
          ChildProcess.make(
            config.executablePath,
            [
              ...config.args.slice(0, config.args.indexOf(config.entryPath) + 1),
              "auth",
              "session",
              "issue",
              "--base-dir",
              baseDir,
              "--label",
              "T3 Code Desktop",
              "--json",
            ],
            {
              cwd: config.cwd,
              env: config.env,
              extendEnv: config.extendEnv,
              stdin: "ignore",
              stderr: "ignore",
            },
          ),
        );
        const [stdout, code] = yield* Effect.all(
          [process.stdout.pipe(Stream.decodeText(), Stream.mkString), process.exitCode],
          { concurrency: "unbounded" },
        );
        if (code !== 0)
          return yield* new DesktopExistingServerError({
            reason: "session-issue-failed",
            cause: code,
          });
        return yield* decodeSession(stdout);
      }),
    ).pipe(
      Effect.mapError((cause) =>
        isDesktopExistingServerError(cause)
          ? cause
          : new DesktopExistingServerError({ reason: "session-issue-failed", cause }),
      ),
    );
    const latest = yield* readPersistedServerRuntimeState(statePath);
    if (Option.isNone(latest) || latest.value.ownerId !== running.ownerId) {
      return yield* new DesktopExistingServerError({ reason: "server-replaced" });
    }
    return Option.some({
      ...config,
      httpBaseUrl: new URL(running.origin),
      externalServer: session,
    });
  },
  Effect.timeout(Duration.minutes(1)),
  Effect.mapError((cause) =>
    isDesktopExistingServerError(cause)
      ? cause
      : new DesktopExistingServerError({ reason: "connect-failed", cause }),
  ),
);
