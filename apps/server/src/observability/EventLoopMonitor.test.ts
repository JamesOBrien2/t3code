import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import * as EventLoopMonitor from "./EventLoopMonitor.ts";

const ms = (value: number) => value * 1e6;

// Node reports a stall of S as a gap of up to S + 1 s, the histogram resolution.
const stalled: EventLoopMonitor.EventLoopReadings = {
  delayMaxNs: ms(5_950),
  activeMs: 6_200,
  utilization: 0.176,
  usage: {
    userCPUTime: 310_400,
    systemCPUTime: 95_600,
    majorPageFault: 8_412,
    minorPageFault: 20_031,
    involuntaryContextSwitches: 57,
  },
  rssBytes: 1536 * 1024 * 1024,
  heapUsedBytes: 512 * 1024 * 1024,
  elapsedMs: 30_000,
  loadAverage: 219.43,
  cpuCount: 18,
};

describe("EventLoopMonitor", () => {
  it("ignores delay the loop spent idle, such as a system sleep", () => {
    const asleep: EventLoopMonitor.EventLoopReadings = {
      ...stalled,
      delayMaxNs: ms(600_000),
      activeMs: 900,
    };
    assert.isUndefined(EventLoopMonitor.stallMs(asleep));
    assert.strictEqual(EventLoopMonitor.stallMs({ ...asleep, activeMs: 600_000 }), 599_000);
  });
});

it.layer(NodeServices.layer)("stall pressure evidence", (it) => {
  it.effect.each([true, false])("persists a stall with diagnostics available: %s", (available) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-stall-pressure-" });
      const filePath = `${directory}/stalls.ndjson`;
      const sampled = yield* Queue.unbounded<void>();
      const memoryPressure = available
        ? {
            sampledAt: "1970-01-01T00:01:00.000Z",
            windowMs: 30_000,
            host: { someAvg10: 12.5, fullAvg10: 2 },
            server: undefined,
            agents: undefined,
          }
        : undefined;
      const sample = Queue.offer(sampled, undefined).pipe(
        Effect.as({ ...stalled, memoryPressure }),
      );
      yield* Effect.gen(function* () {
        const monitor = yield* EventLoopMonitor.EventLoopMonitor;
        yield* TestClock.adjust("30 seconds");
        yield* Queue.take(sampled);
        yield* TestClock.adjust("30 seconds");
        yield* Queue.take(sampled);
        yield* monitor.latestNoticeableStall;
        const lines = (yield* fs.readFileString(filePath)).trim().split("\n");
        expect(JSON.parse(lines[0]!)).toMatchObject({ delayMaxMs: 4950, majorPageFaults: 8412 });
        expect(JSON.parse(lines[0]!).memoryPressure).toEqual(memoryPressure);
      }).pipe(
        Effect.provide(
          EventLoopMonitor.layerWith(Effect.succeed(sample), { filePath, maxBytes: 4096 }),
        ),
      );
    }),
  );
});
