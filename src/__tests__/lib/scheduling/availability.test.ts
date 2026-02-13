import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAvailableSlots,
  formatSlotsForLLM,
} from "@/lib/scheduling/availability";
import type { ScheduleGrid } from "@/lib/validations/settings";

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const TIMEZONE = "America/Sao_Paulo"; // UTC-3 (no DST in Feb 2026)

const FULL_WEEK_GRID: ScheduleGrid = {
  monday: [
    { start: "09:00", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ],
  tuesday: [{ start: "09:00", end: "18:00" }],
  wednesday: [{ start: "09:00", end: "12:00" }],
  thursday: [{ start: "09:00", end: "18:00" }],
  friday: [{ start: "09:00", end: "17:00" }],
  saturday: [{ start: "09:00", end: "13:00" }],
  sunday: [],
};

// Fake "now": 2026-02-13 08:00 UTC = 2026-02-13 05:00 São Paulo
const FAKE_NOW = new Date("2026-02-13T08:00:00Z");

// ---------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------

describe("availability service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── getAvailableSlots ──

  describe("getAvailableSlots", () => {
    it("returns empty for a day off (Sunday)", () => {
      // 2026-02-15 is Sunday → sunday: []
      const slots = getAvailableSlots(
        "2026-02-15",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
      );

      expect(slots).toEqual([]);
    });

    it("returns empty when the grid has an explicit empty array for the day", () => {
      const gridWithEmptyMonday: ScheduleGrid = {
        ...FULL_WEEK_GRID,
        monday: [],
      };

      // 2026-02-16 is Monday
      const slots = getAvailableSlots(
        "2026-02-16",
        gridWithEmptyMonday,
        30,
        [],
        TIMEZONE,
      );

      expect(slots).toEqual([]);
    });

    it("generates 6 slots of 30 min for a morning-only block (Wed 09:00-12:00)", () => {
      // 2026-02-18 is Wednesday → 09:00-12:00 = 180 min / 30 = 6 slots
      const slots = getAvailableSlots(
        "2026-02-18",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
      );

      expect(slots).toHaveLength(6);

      // First slot starts at 09:00 São Paulo = 12:00 UTC
      expect(slots[0].start).toBe("2026-02-18T12:00:00.000Z");
      expect(slots[0].end).toBe("2026-02-18T12:30:00.000Z");

      // Last slot starts at 11:30 São Paulo = 14:30 UTC
      expect(slots[5].start).toBe("2026-02-18T14:30:00.000Z");
      expect(slots[5].end).toBe("2026-02-18T15:00:00.000Z");
    });

    it("generates 3 slots of 60 min for a morning-only block (Wed 09:00-12:00)", () => {
      // 180 min / 60 = 3 slots
      const slots = getAvailableSlots(
        "2026-02-18",
        FULL_WEEK_GRID,
        60,
        [],
        TIMEZONE,
      );

      expect(slots).toHaveLength(3);

      expect(slots[0].start).toBe("2026-02-18T12:00:00.000Z");
      expect(slots[0].end).toBe("2026-02-18T13:00:00.000Z");

      expect(slots[2].start).toBe("2026-02-18T14:00:00.000Z");
      expect(slots[2].end).toBe("2026-02-18T15:00:00.000Z");
    });

    it("generates 14 slots of 30 min for multiple time blocks (Mon 09-12 + 14-18)", () => {
      // 2026-02-16 is Monday
      // Morning: 09:00-12:00 = 180 min / 30 = 6 slots
      // Afternoon: 14:00-18:00 = 240 min / 30 = 8 slots
      // Total = 14
      const slots = getAvailableSlots(
        "2026-02-16",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
      );

      expect(slots).toHaveLength(14);

      // First slot: 09:00 SP = 12:00 UTC
      expect(slots[0].start).toBe("2026-02-16T12:00:00.000Z");

      // Last morning slot: 11:30 SP = 14:30 UTC
      expect(slots[5].start).toBe("2026-02-16T14:30:00.000Z");

      // First afternoon slot: 14:00 SP = 17:00 UTC
      expect(slots[6].start).toBe("2026-02-16T17:00:00.000Z");

      // Last slot: 17:30 SP = 20:30 UTC
      expect(slots[13].start).toBe("2026-02-16T20:30:00.000Z");
    });

    it("excludes slots that overlap with existing appointments", () => {
      // 2026-02-18 Wed: 09:00-12:00 SP → 6 baseline slots of 30 min
      // Appointment at 10:00-10:30 SP = 13:00-13:30 UTC
      const appointments = [
        {
          starts_at: "2026-02-18T13:00:00.000Z",
          ends_at: "2026-02-18T13:30:00.000Z",
        },
      ];

      const slots = getAvailableSlots(
        "2026-02-18",
        FULL_WEEK_GRID,
        30,
        appointments,
        TIMEZONE,
      );

      // 6 - 1 = 5
      expect(slots).toHaveLength(5);

      // Verify the 10:00 SP (13:00 UTC) slot is missing
      const slotStarts = slots.map((s) => s.start);
      expect(slotStarts).not.toContain("2026-02-18T13:00:00.000Z");
    });

    it("excludes slots that overlap with calendar busy blocks", () => {
      // 2026-02-18 Wed: 09:00-12:00 SP → 6 baseline slots of 30 min
      // Busy block 10:00-11:00 SP = 13:00-14:00 UTC → overlaps 10:00 and 10:30 slots
      const busyBlocks = [
        {
          start: "2026-02-18T13:00:00.000Z",
          end: "2026-02-18T14:00:00.000Z",
        },
      ];

      const slots = getAvailableSlots(
        "2026-02-18",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
        busyBlocks,
      );

      // 6 - 2 = 4
      expect(slots).toHaveLength(4);

      // Verify both 13:00 and 13:30 UTC slots are gone
      const slotStarts = slots.map((s) => s.start);
      expect(slotStarts).not.toContain("2026-02-18T13:00:00.000Z");
      expect(slotStarts).not.toContain("2026-02-18T13:30:00.000Z");
    });

    it("keeps future slots when current time is before slot start", () => {
      // Fake now: 2026-02-13 08:00 UTC = 05:00 São Paulo
      // 2026-02-13 is Friday → 09:00-17:00 SP
      // 09:00 SP = 12:00 UTC > 08:00 UTC (now) → all slots are in the future
      const slots = getAvailableSlots(
        "2026-02-13",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
      );

      // 09:00-17:00 = 480 min / 30 = 16 slots, all in the future
      expect(slots).toHaveLength(16);
      expect(slots[0].start).toBe("2026-02-13T12:00:00.000Z");
    });

    it("returns empty when all slots are in the past", () => {
      // Set now to 23:00 UTC = 20:00 São Paulo → all slots for the day
      // have already passed (Friday ends at 17:00 SP = 20:00 UTC)
      vi.setSystemTime(new Date("2026-02-13T23:00:00Z"));

      const slots = getAvailableSlots(
        "2026-02-13",
        FULL_WEEK_GRID,
        30,
        [],
        TIMEZONE,
      );

      expect(slots).toHaveLength(0);
    });

    it("handles duration that does not evenly divide the block (45-min slots)", () => {
      // 2026-02-18 Wed: 09:00-12:00 SP = 180 min / 45 = 4 slots exactly
      const slots = getAvailableSlots(
        "2026-02-18",
        FULL_WEEK_GRID,
        45,
        [],
        TIMEZONE,
      );

      expect(slots).toHaveLength(4);

      // 09:00, 09:45, 10:30, 11:15 SP
      expect(slots[0].start).toBe("2026-02-18T12:00:00.000Z"); // 09:00 SP
      expect(slots[1].start).toBe("2026-02-18T12:45:00.000Z"); // 09:45 SP
      expect(slots[2].start).toBe("2026-02-18T13:30:00.000Z"); // 10:30 SP
      expect(slots[3].start).toBe("2026-02-18T14:15:00.000Z"); // 11:15 SP
    });
  });

  // ── formatSlotsForLLM ──

  describe("formatSlotsForLLM", () => {
    it("returns 'No available slots.' for an empty array", () => {
      const result = formatSlotsForLLM([], TIMEZONE, "pt-BR");
      expect(result).toBe("No available slots.");
    });

    it("groups slots by date and formats times in the given locale", () => {
      // 3 slots across 2 dates
      const slots = [
        {
          start: "2026-02-18T12:00:00.000Z", // Wed 09:00 SP
          end: "2026-02-18T12:30:00.000Z",
        },
        {
          start: "2026-02-18T12:30:00.000Z", // Wed 09:30 SP
          end: "2026-02-18T13:00:00.000Z",
        },
        {
          start: "2026-02-19T12:00:00.000Z", // Thu 09:00 SP
          end: "2026-02-19T12:30:00.000Z",
        },
      ];

      const result = formatSlotsForLLM(slots, TIMEZONE, "pt-BR");
      const lines = result.split("\n");

      // Should have 2 lines (one per date)
      expect(lines).toHaveLength(2);

      // First line: Wednesday with 2 times
      expect(lines[0]).toContain("09:00");
      expect(lines[0]).toContain("09:30");

      // Second line: Thursday with 1 time
      expect(lines[1]).toContain("09:00");
    });
  });
});
