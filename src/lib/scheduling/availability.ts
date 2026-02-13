import type { ScheduleGrid } from "@/lib/validations/settings";

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

interface ExistingAppointment {
  starts_at: string; // ISO datetime
  ends_at: string; // ISO datetime
}

interface BusyBlock {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface AvailableSlot {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

/**
 * Converts a local datetime string (e.g. "2026-02-18T09:00:00") in the
 * given IANA timezone to a UTC epoch-millisecond timestamp.
 *
 * Strategy: use `Intl.DateTimeFormat` to discover the UTC offset for the
 * given timezone at the requested local time, then subtract that offset.
 */
function localToUtc(localIso: string, timezone: string): number {
  // Parse the local components manually so we never depend on the
  // host system's local timezone interpretation.
  const [datePart, timePart] = localIso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  // Build a "guess" UTC timestamp by treating the local values as UTC.
  const guessUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  // Determine what local time that guess maps to in the target timezone.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(guessUtcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const localAtGuess = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  // The difference between the guess and what it resolved to in the
  // timezone is the offset we need to correct.
  const offsetMs = localAtGuess - guessUtcMs;

  return guessUtcMs - offsetMs;
}

/** Check whether two time ranges [aStart, aEnd) and [bStart, bEnd) overlap. */
function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Calculates available appointment slots for a professional on a given
 * date, taking into account their schedule grid, existing appointments,
 * and any additional busy blocks (e.g. Google Calendar events).
 */
export function getAvailableSlots(
  date: string, // YYYY-MM-DD
  scheduleGrid: ScheduleGrid,
  durationMinutes: number,
  existingAppointments: ExistingAppointment[],
  timezone: string, // e.g. "America/Sao_Paulo"
  busyBlocks?: BusyBlock[],
): AvailableSlot[] {
  // 1. Determine day of week from the date.
  //    Use noon UTC to avoid day-boundary issues for most timezones.
  const dateObj = new Date(date + "T12:00:00Z");
  const dayName = WEEKDAY_NAMES[dateObj.getUTCDay()];

  // 2. Get working hours for that day.
  const workingBlocks = scheduleGrid[dayName];
  if (!workingBlocks || workingBlocks.length === 0) {
    return [];
  }

  // 3. Collect all busy ranges as UTC epoch-ms pairs.
  const busyRanges: Array<{ start: number; end: number }> = [];

  for (const appt of existingAppointments) {
    busyRanges.push({
      start: new Date(appt.starts_at).getTime(),
      end: new Date(appt.ends_at).getTime(),
    });
  }

  if (busyBlocks) {
    for (const block of busyBlocks) {
      busyRanges.push({
        start: new Date(block.start).getTime(),
        end: new Date(block.end).getTime(),
      });
    }
  }

  const durationMs = durationMinutes * 60 * 1000;
  const now = Date.now();
  const slots: AvailableSlot[] = [];

  // 4. Walk each working block and generate candidate slots.
  for (const block of workingBlocks) {
    const blockStartUtc = localToUtc(`${date}T${block.start}:00`, timezone);
    const blockEndUtc = localToUtc(`${date}T${block.end}:00`, timezone);

    let cursor = blockStartUtc;

    while (cursor + durationMs <= blockEndUtc) {
      const slotEnd = cursor + durationMs;

      // 5. Skip if the slot overlaps any busy range.
      const overlaps = busyRanges.some((busy) =>
        rangesOverlap(cursor, slotEnd, busy.start, busy.end),
      );

      // 6. Skip slots that start in the past.
      if (!overlaps && cursor >= now) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(slotEnd).toISOString(),
        });
      }

      cursor += durationMs;
    }
  }

  return slots;
}

/**
 * Formats available slots into a human-readable string grouped by date,
 * suitable for presenting to an LLM or directly to a user.
 *
 * Example output (pt-BR):
 *   quarta-feira, 18 de fevereiro: 09:00, 09:30, 10:00
 *   quinta-feira, 19 de fevereiro: 14:00, 14:30
 */
export function formatSlotsForLLM(
  slots: AvailableSlot[],
  timezone: string,
  locale: string, // "pt-BR", "en", "es"
): string {
  if (slots.length === 0) {
    return "No available slots.";
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Group slots by their formatted date string.
  const grouped = new Map<string, string[]>();

  for (const slot of slots) {
    const dateKey = dateFormatter.format(new Date(slot.start));
    const timeStr = timeFormatter.format(new Date(slot.start));

    const existing = grouped.get(dateKey);
    if (existing) {
      existing.push(timeStr);
    } else {
      grouped.set(dateKey, [timeStr]);
    }
  }

  const lines: string[] = [];
  for (const [dateLabel, times] of grouped) {
    lines.push(`${dateLabel}: ${times.join(", ")}`);
  }

  return lines.join("\n");
}
