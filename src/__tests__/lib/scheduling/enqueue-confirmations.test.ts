import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { buildConfirmationEntries } from "@/lib/scheduling/enqueue-confirmations";

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const CLINIC_ID = "clinic-001";
const APPOINTMENT_ID = "appt-001";

// Fake "now": 2026-02-13 08:00 UTC
const FAKE_NOW = new Date("2026-02-13T08:00:00Z");

// ---------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------

describe("buildConfirmationEntries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates 3 entries for an appointment far in the future", () => {
    // Appointment 7 days from now — all 3 stages (48h, 24h, 2h) are in the future
    const startsAt = "2026-02-20T14:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    expect(entries).toHaveLength(3);

    // Verify stages are present
    const stages = entries.map((e) => e.stage);
    expect(stages).toEqual(["48h", "24h", "2h"]);
  });

  it("computes correct scheduled_at for each stage", () => {
    const startsAt = "2026-02-20T14:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    // 48h before: 2026-02-18T14:00:00.000Z
    expect(entries[0].scheduled_at).toBe("2026-02-18T14:00:00.000Z");
    expect(entries[0].stage).toBe("48h");

    // 24h before: 2026-02-19T14:00:00.000Z
    expect(entries[1].scheduled_at).toBe("2026-02-19T14:00:00.000Z");
    expect(entries[1].stage).toBe("24h");

    // 2h before: 2026-02-20T12:00:00.000Z
    expect(entries[2].scheduled_at).toBe("2026-02-20T12:00:00.000Z");
    expect(entries[2].stage).toBe("2h");
  });

  it("all entries have status pending and attempts 0", () => {
    const startsAt = "2026-02-20T14:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    for (const entry of entries) {
      expect(entry.status).toBe("pending");
      expect(entry.attempts).toBe(0);
      expect(entry.clinic_id).toBe(CLINIC_ID);
      expect(entry.appointment_id).toBe(APPOINTMENT_ID);
    }
  });

  it("skips all stages for an appointment in 1 hour (0 entries)", () => {
    // Now is 2026-02-13T08:00:00Z, appointment at 09:00 → 1 hour from now
    // 48h before = 2026-02-11T09:00:00Z → past
    // 24h before = 2026-02-12T09:00:00Z → past
    //  2h before = 2026-02-13T07:00:00Z → past
    const startsAt = "2026-02-13T09:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    expect(entries).toHaveLength(0);
  });

  it("returns only the 2h entry for an appointment in 3 hours", () => {
    // Now is 2026-02-13T08:00:00Z, appointment at 11:00 → 3 hours from now
    // 48h before = 2026-02-11T11:00:00Z → past
    // 24h before = 2026-02-12T11:00:00Z → past
    //  2h before = 2026-02-13T09:00:00Z → future (09:00 > 08:00)
    const startsAt = "2026-02-13T11:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].stage).toBe("2h");
    expect(entries[0].scheduled_at).toBe("2026-02-13T09:00:00.000Z");
  });

  it("returns 24h and 2h entries for an appointment in 25 hours", () => {
    // Now is 2026-02-13T08:00:00Z, appointment at 2026-02-14T09:00:00Z → 25h from now
    // 48h before = 2026-02-12T09:00:00Z → past
    // 24h before = 2026-02-13T09:00:00Z → future (09:00 > 08:00)
    //  2h before = 2026-02-14T07:00:00Z → future
    const startsAt = "2026-02-14T09:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    expect(entries).toHaveLength(2);

    const stages = entries.map((e) => e.stage);
    expect(stages).toEqual(["24h", "2h"]);
  });

  it("excludes an entry whose scheduled_at is exactly now", () => {
    // Now is 2026-02-13T08:00:00Z
    // If 2h before = exactly now → not strictly in the future → skip
    // startsAt = 2026-02-13T10:00:00Z → 2h before = 08:00 = now
    const startsAt = "2026-02-13T10:00:00.000Z";

    const entries = buildConfirmationEntries({
      clinicId: CLINIC_ID,
      appointmentId: APPOINTMENT_ID,
      startsAt,
    });

    // 48h and 24h are past, 2h is exactly now → 0 entries
    expect(entries).toHaveLength(0);
  });
});
