import {
  AdvertisedEndpoint,
  DesktopServerExposureModeSchema,
  DesktopServerExposureStateSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopLifecycle from "../../app/DesktopLifecycle.ts";
import * as DesktopServerExposure from "../../backend/DesktopServerExposure.ts";
import * as DesktopBackendPool from "../../backend/DesktopBackendPool.ts";
import * as Option from "effect/Option";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const SetTailscaleServeEnabledInput = Schema.Struct({
  enabled: Schema.Boolean,
  port: Schema.optionalKey(Schema.Number),
});

class DesktopServerExternallyManagedError extends Schema.TaggedError<DesktopServerExternallyManagedError>()(
  "DesktopServerExternallyManagedError",
  {},
) {
  override get message() {
    return "Manage network access where the existing server was started.";
  }
}

const requireManagedPrimary = Effect.fn("desktop.ipc.serverExposure.requireManagedPrimary")(
  function* () {
    const pool = yield* DesktopBackendPool.DesktopBackendPool;
    const primary = yield* pool.primary;
    const config = yield* primary.currentConfig;
    if (Option.isSome(config) && config.value.externalServer !== undefined) {
      return yield* new DesktopServerExternallyManagedError();
    }
  },
);

export const getServerExposureState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_SERVER_EXPOSURE_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.getState")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getState;
  }),
});

export const setServerExposureMode = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_SERVER_EXPOSURE_MODE_CHANNEL,
  payload: DesktopServerExposureModeSchema,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setMode")(function* (mode) {
    yield* requireManagedPrimary();
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setMode(mode);
    if (change.requiresRelaunch) {
      yield* lifecycle.relaunch(`serverExposureMode=${mode}`);
    }
    return change.state;
  }),
});

export const setTailscaleServeEnabled = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_TAILSCALE_SERVE_ENABLED_CHANNEL,
  payload: SetTailscaleServeEnabledInput,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setTailscaleServeEnabled")(function* (input) {
    yield* requireManagedPrimary();
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setTailscaleServeEnabled(input);
    if (change.requiresRelaunch) {
      yield* lifecycle.relaunch(
        change.state.tailscaleServeEnabled ? "tailscale-serve-enabled" : "tailscale-serve-disabled",
      );
    }
    return change.state;
  }),
});

export const getAdvertisedEndpoints = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_ADVERTISED_ENDPOINTS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(AdvertisedEndpoint),
  handler: Effect.fn("desktop.ipc.serverExposure.getAdvertisedEndpoints")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getAdvertisedEndpoints;
  }),
});
