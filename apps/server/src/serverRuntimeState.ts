import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type { PersistedServerRuntimeState } from "@t3tools/shared/serverRuntimeState";
import packageJson from "../package.json" with { type: "json" };
import type * as ServerConfig from "./config.ts";
import { formatHostForUrl, isWildcardHost } from "./startupAccess.ts";

const runtimeOriginForConfig = (
  config: Pick<ServerConfig.ServerConfig["Service"], "host">,
  port: number,
): PersistedServerRuntimeState["origin"] => {
  const hostname =
    config.host && !isWildcardHost(config.host) ? formatHostForUrl(config.host) : "127.0.0.1";
  return `http://${hostname}:${port}`;
};

export const makePersistedServerRuntimeState = (input: {
  readonly config: Pick<
    ServerConfig.ServerConfig["Service"],
    "host" | "privateNetworkOnly" | "devUrl"
  >;
  readonly port: number;
  readonly serviceManaged?: boolean;
}): Effect.Effect<PersistedServerRuntimeState> =>
  Effect.map(DateTime.now, (now) => ({
    version: 1,
    pid: process.pid,
    ...(input.config.host ? { host: input.config.host } : {}),
    ...(input.config.privateNetworkOnly ? { privateNetworkOnly: true } : {}),
    port: input.port,
    origin: runtimeOriginForConfig(input.config, input.port),
    ...(input.config.devUrl ? { devUrl: input.config.devUrl.toString() } : {}),
    startedAt: DateTime.formatIso(now),
    ...(input.serviceManaged ? { serviceManaged: true } : {}),
    serverVersion: packageJson.version,
  }));
