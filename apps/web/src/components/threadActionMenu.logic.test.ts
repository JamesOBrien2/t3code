import { describe, expect, it } from "vite-plus/test";

import {
  buildShelfActionMenuItems,
  buildThreadActionMenuItems,
  type ShelfActionMenuState,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});

const baseShelfState: ShelfActionMenuState = {
  shelf: "settled",
  count: 116,
  unsettledCount: 0,
  settledCount: 116,
  canOperate: true,
  supportsSettlement: true,
  supportsSnooze: true,
  canSnoozeAll: true,
  hasRunningThread: false,
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildShelfActionMenuItems", () => {
  it("offers un-settle, snooze, archive, and delete for every settled thread", () => {
    const items = buildShelfActionMenuItems(baseShelfState);

    expect(items.map((item) => item.id)).toEqual([
      "unsettle",
      "snooze",
      "mark-unread",
      "archive",
      "delete",
    ]);
    expect(items.find((item) => item.id === "archive")?.label).toBe("Archive (116)");
  });

  it("offers settle for working threads and wake for snoozed threads", () => {
    expect(
      buildShelfActionMenuItems({
        ...baseShelfState,
        shelf: "working",
        unsettledCount: 4,
        settledCount: 0,
      }).map((item) => item.id),
    ).toContain("settle");

    const snoozedItems = buildShelfActionMenuItems({
      ...baseShelfState,
      shelf: "snoozed",
      unsettledCount: 3,
      settledCount: 0,
    });
    expect(snoozedItems.map((item) => item.id)).toEqual([
      "settle",
      "unsnooze",
      "mark-unread",
      "archive",
      "delete",
    ]);
  });

  it("offers both lifecycle directions when a shelf mixes settled states", () => {
    const items = buildShelfActionMenuItems({
      ...baseShelfState,
      shelf: "snoozed",
      count: 5,
      unsettledCount: 3,
      settledCount: 2,
    });

    expect(items.find((item) => item.id === "settle")).toBeDefined();
    expect(items.find((item) => item.id === "unsettle")).toBeDefined();
  });

  it("omits snooze when any thread cannot be snoozed now", () => {
    const items = buildShelfActionMenuItems({ ...baseShelfState, canSnoozeAll: false });

    expect(items.map((item) => item.id)).not.toContain("snooze");
  });

  it("disables archive when any thread is running", () => {
    const archiveItem = buildShelfActionMenuItems({
      ...baseShelfState,
      hasRunningThread: true,
    }).find((item) => item.id === "archive");

    expect(archiveItem?.disabled).toBe(true);
  });

  it("disables actions that need operate scope but keeps mark unread usable", () => {
    const items = buildShelfActionMenuItems({ ...baseShelfState, canOperate: false });

    expect(items.filter((item) => item.id !== "mark-unread").every((item) => item.disabled)).toBe(
      true,
    );
    expect(items.find((item) => item.id === "mark-unread")?.disabled).toBeUndefined();
  });
});
