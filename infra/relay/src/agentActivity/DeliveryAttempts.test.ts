import * as NodeCryptoLayer from "@effect/platform-node/NodeCrypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as RelayDb from "../db.ts";
import * as DeliveryAttempts from "./DeliveryAttempts.ts";

describe("DeliveryAttempts", () => {
  it.effect("claims a completion once across workers while allowing other runs and devices", () => {
    const receipts = new Set<string>();
    const fakeDb = {
      insert: () => ({
        values: (values: { sourceJobId: string }) => ({
          onConflictDoNothing: () => ({
            returning: () =>
              Effect.sync(() => {
                if (receipts.has(values.sourceJobId)) return [];
                receipts.add(values.sourceJobId);
                return [{ id: values.sourceJobId }];
              }),
          }),
        }),
      }),
    } as unknown as RelayDb.RelayDb["Service"];
    const layer = DeliveryAttempts.layer.pipe(
      Layer.provide(NodeCryptoLayer.layer),
      Layer.provide(Layer.succeed(RelayDb.RelayDb, fakeDb)),
    );
    const alert = {
      userId: "user-1",
      deviceId: "device-1",
      environmentId: "env-1",
      threadId: "thread-1",
      phase: "completed" as const,
      runId: "run-1",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
    const claim = (
      input: Parameters<DeliveryAttempts.DeliveryAttempts["Service"]["claimActivityAlert"]>[0],
    ) =>
      Effect.flatMap(DeliveryAttempts.DeliveryAttempts, (attempts) =>
        attempts.claimActivityAlert(input),
      ).pipe(Effect.provide(layer));

    return Effect.gen(function* () {
      const concurrent = yield* Effect.all([claim(alert), claim(alert)], { concurrency: 2 });
      expect(concurrent.toSorted()).toEqual([false, true]);
      expect(yield* claim({ ...alert, updatedAt: "1970-01-01T00:01:00.000Z" })).toBe(false);
      expect(yield* claim({ ...alert, runId: "run-2" })).toBe(true);
      expect(yield* claim({ ...alert, deviceId: "device-2" })).toBe(true);
      const { runId: _runId, ...legacyAlert } = alert;
      expect(yield* claim(legacyAlert)).toBe(true);
      expect(yield* claim(legacyAlert)).toBe(false);
    });
  });

  it.effect("reports completed source jobs when the durable claim already exists", () => {
    const fakeDb = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Effect.succeed([]),
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Effect.succeed([
                {
                  createdAt: "2026-05-26T00:00:00.000Z",
                  apnsStatus: 200,
                  apnsReason: null,
                  apnsId: null,
                  transportError: null,
                },
              ]),
          }),
        }),
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const attempts = yield* DeliveryAttempts.DeliveryAttempts;
      const claimed = yield* attempts.claimSourceJob({
        userId: "user-1",
        environmentId: null,
        threadId: null,
        deviceId: "device-1",
        kind: "live_activity_update",
        sourceJobId: "job-1",
        token: "apns-token",
      });

      expect(claimed).toBe("completed");
    }).pipe(
      Effect.provide(
        DeliveryAttempts.layer.pipe(
          Layer.provide(NodeCryptoLayer.layer),
          Layer.provide(Layer.succeed(RelayDb.RelayDb, fakeDb)),
        ),
      ),
    );
  });

  it.effect("reports in-flight source jobs while an active claim lease exists", () => {
    const fakeDb = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Effect.succeed([]),
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Effect.succeed([
                {
                  createdAt: "2999-01-01T00:00:00.000Z",
                  apnsStatus: null,
                  apnsReason: null,
                  apnsId: null,
                  transportError: null,
                },
              ]),
          }),
        }),
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const attempts = yield* DeliveryAttempts.DeliveryAttempts;
      const claimed = yield* attempts.claimSourceJob({
        userId: "user-1",
        environmentId: null,
        threadId: null,
        deviceId: "device-1",
        kind: "live_activity_update",
        sourceJobId: "job-1",
        token: "apns-token",
      });

      expect(claimed).toBe("in_flight");
    }).pipe(
      Effect.provide(
        DeliveryAttempts.layer.pipe(
          Layer.provide(NodeCryptoLayer.layer),
          Layer.provide(Layer.succeed(RelayDb.RelayDb, fakeDb)),
        ),
      ),
    );
  });

  it.effect("reclaims source jobs after the claim lease expires", () => {
    const updatedValues: Array<Record<string, unknown>> = [];
    const fakeDb = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => Effect.succeed([]),
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Effect.succeed([
                {
                  createdAt: "1969-12-31T23:00:00.000Z",
                  apnsStatus: null,
                  apnsReason: null,
                  apnsId: null,
                  transportError: null,
                },
              ]),
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updatedValues.push(values);
          return {
            where: () => ({
              returning: () => Effect.succeed([{ id: "attempt-1" }]),
            }),
          };
        },
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const attempts = yield* DeliveryAttempts.DeliveryAttempts;
      const claimed = yield* attempts.claimSourceJob({
        userId: "user-1",
        environmentId: null,
        threadId: null,
        deviceId: "device-1",
        kind: "live_activity_update",
        sourceJobId: "job-1",
        token: "apns-token",
      });

      expect(claimed).toBe("claimed");
      expect(updatedValues[0]?.createdAt).toEqual(expect.any(String));
    }).pipe(
      Effect.provide(
        DeliveryAttempts.layer.pipe(
          Layer.provide(NodeCryptoLayer.layer),
          Layer.provide(Layer.succeed(RelayDb.RelayDb, fakeDb)),
        ),
      ),
    );
  });
});
