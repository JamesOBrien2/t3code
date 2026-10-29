import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  isSafeCgroupPath,
  parseCgroup2Mounts,
  parseUnifiedCgroupPath,
} from "@t3tools/shared/linuxCgroup";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { AGENT_SLICE } from "../process/agentScope.ts";

const eventNames = ["high", "max", "oom", "oom_kill"] as const;
type MemoryEvents = Record<(typeof eventNames)[number], number>;
interface CgroupSample {
  readonly path: string;
  readonly pressure: ReturnType<typeof parsePressure>;
  readonly events: MemoryEvents | undefined;
  readonly eventsDelta?: MemoryEvents;
}

export interface Sample {
  readonly sampledAt: string;
  readonly windowMs?: number;
  readonly host: ReturnType<typeof parsePressure>;
  readonly server: CgroupSample | undefined;
  readonly agents: CgroupSample | undefined;
}

function parsePressure(contents: string) {
  const value = (kind: string) => {
    const raw = new RegExp(`^${kind} avg10=(\\S+)`, "m").exec(contents)?.[1];
    const number = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : undefined;
  };
  const someAvg10 = value("some");
  const fullAvg10 = value("full");
  return someAvg10 === undefined && fullAvg10 === undefined ? undefined : { someAvg10, fullAvg10 };
}

function parseEvents(contents: string): MemoryEvents | undefined {
  const values = eventNames.map((name) => {
    const raw = new RegExp(`^${name} (\\d+)$`, "m").exec(contents)?.[1];
    return raw === undefined ? NaN : Number(raw);
  });
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) return undefined;
  return { high: values[0]!, max: values[1]!, oom: values[2]!, oom_kill: values[3]! };
}

export const makeSampler = Effect.fn("LinuxMemoryPressure.makeSampler")(function* () {
  const platform = yield* HostProcess.Platform;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
  let previous: { readonly at: number; readonly sample: Sample } | undefined;

  return Effect.gen(function* () {
    if (platform !== "linux") return undefined;
    const now = yield* DateTime.now;
    const host = parsePressure(yield* read("/proc/pressure/memory"));
    const cgroup = parseUnifiedCgroupPath(yield* read("/proc/self/cgroup"));
    const mounts = parseCgroup2Mounts(yield* read("/proc/self/mountinfo"));
    const resolve = (group: string) => {
      if (!isSafeCgroupPath(group)) return undefined;
      for (const mount of mounts) {
        if (!isSafeCgroupPath(mount.root) || !isSafeCgroupPath(mount.mountPoint)) continue;
        const relative = path.relative(mount.root, group);
        if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) continue;
        return path.join(mount.mountPoint, relative);
      }
      return undefined;
    };
    const readGroup = Effect.fnUntraced(function* (
      group: string | undefined,
      before: CgroupSample | undefined,
    ) {
      const directory = group === undefined ? undefined : resolve(group);
      if (directory === undefined) return undefined;
      const pressure = parsePressure(yield* read(path.join(directory, "memory.pressure")));
      const events = parseEvents(yield* read(path.join(directory, "memory.events")));
      if (pressure === undefined && events === undefined) return undefined;
      const old = before?.path === group ? before?.events : undefined;
      const eventsDelta =
        events !== undefined &&
        old !== undefined &&
        eventNames.every((name) => events[name] >= old[name])
          ? {
              high: events.high - old.high,
              max: events.max - old.max,
              oom: events.oom - old.oom,
              oom_kill: events.oom_kill - old.oom_kill,
            }
          : undefined;
      return {
        path: group!,
        pressure,
        events,
        ...(eventsDelta === undefined ? {} : { eventsDelta }),
      };
    });
    const parts = cgroup?.split("/") ?? [];
    const manager = parts.findLastIndex((part) => /^user@\d+\.service$/.test(part));
    const agentPath =
      manager < 0
        ? undefined
        : path.join(
            parts.slice(0, manager + 1).join("/"),
            "app.slice",
            "app-t3code.slice",
            AGENT_SLICE,
          );
    const server = yield* readGroup(cgroup, previous?.sample.server);
    const agents = yield* readGroup(agentPath, previous?.sample.agents);
    const at = DateTime.toEpochMillis(now);
    const sample: Sample = {
      sampledAt: DateTime.formatIso(now),
      host,
      server,
      agents,
      ...(previous === undefined ? {} : { windowMs: Math.max(0, at - previous.at) }),
    };
    previous = { at, sample };
    return host === undefined && server === undefined && agents === undefined ? undefined : sample;
  });
});
