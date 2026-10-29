import { expect, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import * as LinuxMemoryPressure from "./LinuxMemoryPressure.ts";

const manager = "/user.slice/user-1000.slice/user@1000.service";
const server = `${manager}/app.slice/t3code.service`;
const agents = `${manager}/app.slice/app-t3code.slice/app-t3code-agents.slice`;
const pressure =
  "some avg10=12.50 avg60=1.00 avg300=0.10 total=1000\nfull avg10=2.00 avg60=0.50 avg300=0.10 total=50\n";
const events = (high: number) => `low 0\nhigh ${high}\nmax 0\noom 0\noom_kill 0\n`;

const makeHarness = Effect.fn("test.memoryPressure")(function* (
  platform: NodeJS.Platform = "linux",
) {
  const files: Record<string, string> = {
    "/proc/self/cgroup": `0::${server}\n`,
    "/proc/self/mountinfo":
      "42 31 0:37 /user.slice /sys/fs/cgroup/user\\040mount rw - cgroup2 cgroup2 rw\n",
    "/proc/pressure/memory": pressure,
    [`/sys/fs/cgroup/user mount${server.slice("/user.slice".length)}/memory.events`]: events(3),
    [`/sys/fs/cgroup/user mount${server.slice("/user.slice".length)}/memory.pressure`]: pressure,
    [`/sys/fs/cgroup/user mount${agents.slice("/user.slice".length)}/memory.events`]: events(9),
  };
  const reads: string[] = [];
  const missing = FileSystem.makeNoop({});
  const sample = yield* LinuxMemoryPressure.makeSampler().pipe(
    Effect.provide(
      Layer.mergeAll(
        Path.layer,
        Layer.succeed(HostProcess.Platform, platform),
        FileSystem.layerNoop({
          readFileString: (file) => {
            reads.push(file);
            return files[file] === undefined
              ? missing.readFileString(file)
              : Effect.succeed(files[file]);
          },
        }),
      ),
    ),
  );
  return { files, reads, sample };
});

it.effect("attributes pressure to the server and agent cgroups through a rooted mount", () =>
  Effect.gen(function* () {
    const { sample, files } = yield* makeHarness();
    const first = yield* sample;
    expect(first).toMatchObject({
      host: { someAvg10: 12.5, fullAvg10: 2 },
      server: { path: server, events: { high: 3 } },
      agents: { path: agents, events: { high: 9 } },
    });
    expect(first?.server?.eventsDelta).toBeUndefined();
    const agentEvents = `/sys/fs/cgroup/user mount${agents.slice("/user.slice".length)}/memory.events`;
    files[agentEvents] = events(13);
    yield* TestClock.adjust("30 seconds");
    const next = yield* sample;
    expect(next).toMatchObject({
      windowMs: 30_000,
      agents: { eventsDelta: { high: 4, max: 0, oom: 0, oom_kill: 0 } },
    });
    files[agentEvents] = events(1);
    expect((yield* sample)?.agents?.eventsDelta).toBeUndefined();
    delete files[agentEvents];
    expect((yield* sample)?.agents).toBeUndefined();
    files[agentEvents] = events(20);
    expect((yield* sample)?.agents?.eventsDelta).toBeUndefined();
  }),
);

it.effect("drops a previous server baseline when its cgroup changes", () =>
  Effect.gen(function* () {
    const { sample, files } = yield* makeHarness();
    yield* sample;
    const changed = `${server}/child`;
    files["/proc/self/cgroup"] = `0::${changed}\n`;
    files[`/sys/fs/cgroup/user mount${changed.slice("/user.slice".length)}/memory.events`] =
      events(8);
    expect((yield* sample)?.server).toEqual({
      path: changed,
      pressure: undefined,
      events: { high: 8, max: 0, oom: 0, oom_kill: 0 },
    });
  }),
);

it.effect("omits unavailable or malformed pressure without reading outside the cgroup mount", () =>
  Effect.gen(function* () {
    const { sample, files, reads } = yield* makeHarness();
    files["/proc/self/cgroup"] = "0::/unrelated/../escape\n";
    files["/proc/pressure/memory"] = "some avg10=Infinity\nfull avg10=-1\n";
    expect(yield* sample).toBeUndefined();
    expect(reads.every((file) => file.startsWith("/proc/"))).toBe(true);
    files["/proc/self/cgroup"] = "0::/outside/mount\n";
    expect(yield* sample).toBeUndefined();
    files["/proc/self/cgroup"] = `0::${server}\n`;
    files[`/sys/fs/cgroup/user mount${server.slice("/user.slice".length)}/memory.events`] =
      "high invalid\n";
    delete files[`/sys/fs/cgroup/user mount${server.slice("/user.slice".length)}/memory.pressure`];
    delete files[`/sys/fs/cgroup/user mount${agents.slice("/user.slice".length)}/memory.events`];
    expect(yield* sample).toBeUndefined();
  }),
);

it.effect("does not read Linux diagnostics on other platforms", () =>
  Effect.gen(function* () {
    const { sample, reads } = yield* makeHarness("darwin");
    expect(yield* sample).toBeUndefined();
    expect(reads).toEqual([]);
  }),
);
