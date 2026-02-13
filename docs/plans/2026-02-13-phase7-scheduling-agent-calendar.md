# Phase 7: Scheduling Agent + Google Calendar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable appointment booking via WhatsApp through a Scheduling Agent with Google Calendar synchronization.

**Architecture:** The scheduling agent receives conversations routed from the support agent (via `route_to_module`). It uses an availability service that combines the professional's `schedule_grid` (working hours) with existing appointments and optionally Google Calendar free/busy data to calculate open slots. Appointments are stored in DB and synced to Google Calendar when connected.

**Tech Stack:** LangChain agent (same pattern as basic-support), Google Calendar API via `googleapis`, Zod validation, Supabase admin client.

**Prerequisites completed in Phase 6:**
- Agent framework working (registry, engine, router, context-builder)
- Basic support agent with `route_to_module` tool
- WhatsApp webhook processing messages end-to-end
- DB tables: `appointments`, `professionals` (with `google_calendar_id`, `google_refresh_token`, `schedule_grid`), `services`

---

## Context for Implementers

### Key Files to Understand

| File | Purpose |
|------|---------|
| `src/lib/agents/agents/basic-support.ts` | Reference agent implementation — follow this exact pattern |
| `src/lib/agents/types.ts` | Agent interfaces: `AgentTypeConfig`, `ToolCallContext`, `ToolCallResult` |
| `src/lib/agents/index.ts` | Barrel with side-effect imports — register new agent here |
| `src/lib/agents/process-message.ts` | Message processing orchestrator — needs routing fix |
| `src/lib/validations/settings.ts` | Existing Zod schemas — add scheduling schemas here |
| `src/app/api/settings/professionals/route.ts` | Professional CRUD API — reference for auth pattern |
| `src/services/whatsapp.ts` | Service layer pattern — follow for google-calendar.ts |
| `src/types/index.ts` | Shared types — `Appointment`, `Professional`, `AppointmentStatus` already exist |

### DB Schema (already exists — no migrations needed)

```sql
-- professionals table (relevant columns)
schedule_grid jsonb not null default '{}'::jsonb,  -- Working hours per day
google_calendar_id text,                            -- Connected calendar ID
google_refresh_token text,                          -- OAuth refresh token
appointment_duration_minutes integer not null default 30,

-- appointments table
starts_at timestamptz not null,
ends_at timestamptz not null,
status text not null default 'scheduled',           -- scheduled|confirmed|completed|cancelled|no_show
google_event_id text,                               -- Synced calendar event ID
professional_id uuid references professionals(id),
patient_id uuid not null references patients(id),
service_id uuid references services(id),
cancellation_reason text,
```

### schedule_grid Format (to be defined in this phase)

```json
{
  "monday":    [{"start": "09:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}],
  "tuesday":   [{"start": "09:00", "end": "18:00"}],
  "wednesday": [],
  "thursday":  [{"start": "09:00", "end": "12:00"}, {"start": "14:00", "end": "17:00"}],
  "friday":    [{"start": "09:00", "end": "17:00"}],
  "saturday":  [{"start": "09:00", "end": "13:00"}],
  "sunday":    []
}
```

Empty array `[]` or missing key = day off.

---

## Task 1: Fix Module Routing in process-message.ts

**Why:** Currently when the support agent calls `route_to_module("scheduling")`, it returns `responseData.routedTo = "scheduling"` but `process-message.ts` ignores this — `current_module` stays as `"support"`. The next message from the patient still goes to support, not scheduling.

**Files:**
- Modify: `src/lib/agents/process-message.ts:270-280`

**Step 1: Read the current update logic**

Current code at line 270:
```ts
// 13. Update conversation
await supabase
  .from("conversations")
  .update({
    current_module: moduleType,
    ...(engineResult.newConversationStatus
      ? { status: engineResult.newConversationStatus }
      : {}),
    ...(agentRow ? { agent_id: agentRow.id } : {}),
  })
  .eq("id", conversationId);
```

**Step 2: Add routing support**

Replace the conversation update block with:
```ts
// 13. Handle module routing (if agent requested it)
const routedTo = engineResult.responseData?.routedTo as string | undefined;
const finalModule = (routedTo && getAgentType(routedTo)) ? routedTo : moduleType;

// 14. Update conversation
await supabase
  .from("conversations")
  .update({
    current_module: finalModule,
    ...(engineResult.newConversationStatus
      ? { status: engineResult.newConversationStatus }
      : {}),
    ...(agentRow ? { agent_id: agentRow.id } : {}),
  })
  .eq("id", conversationId);
```

Also update the step numbers for the remaining steps (queue and send become 15-17).

**Step 3: Verify tests pass**

Run: `npx vitest run`

**Step 4: Commit**

```bash
git add src/lib/agents/process-message.ts
git commit -m "fix: handle route_to_module by updating current_module on conversation"
```

---

## Task 2: Install googleapis + Create Scheduling Validation Schemas

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.example`
- Modify: `src/lib/validations/settings.ts` (add schedule_grid schema)
- Create: `src/lib/validations/scheduling.ts`

**Step 1: Install googleapis**

```bash
npm install googleapis
```

**Step 2: Update .env.example**

Add after the existing Google Calendar line:
```env
# Google Calendar OAuth
GOOGLE_CALENDAR_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/integrations/google-calendar/callback
```

**Step 3: Add schedule_grid schema to settings validations**

In `src/lib/validations/settings.ts`, add:

```ts
// --- Schedule Grid ---

const timeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
}).refine(
  (slot) => slot.start < slot.end,
  { message: "Start time must be before end time" }
);

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const scheduleGridSchema = z.object(
  Object.fromEntries(
    WEEKDAYS.map((day) => [day, z.array(timeSlotSchema).default([])])
  ) as Record<typeof WEEKDAYS[number], z.ZodDefault<z.ZodArray<typeof timeSlotSchema>>>
);

export type ScheduleGrid = z.infer<typeof scheduleGridSchema>;
export type TimeSlot = z.infer<typeof timeSlotSchema>;
```

Also update `createProfessionalSchema` to accept schedule_grid:
```ts
export const createProfessionalSchema = z.object({
  name: z.string().min(2).max(100),
  specialty: z.string().max(100).optional().or(z.literal("")),
  appointment_duration_minutes: z.number().int().min(5).max(480).default(30),
  schedule_grid: scheduleGridSchema.optional(),
});
```

**Step 4: Create scheduling validation schemas**

Create `src/lib/validations/scheduling.ts`:

```ts
import { z } from "zod";

export const availableSlotsQuerySchema = z.object({
  professional_id: z.string().uuid("Invalid professional ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  service_id: z.string().uuid("Invalid service ID").optional(),
});

export const bookAppointmentSchema = z.object({
  professional_id: z.string().uuid("Invalid professional ID"),
  patient_id: z.string().uuid("Invalid patient ID"),
  service_id: z.string().uuid("Invalid service ID").optional(),
  starts_at: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
  ends_at: z.string().datetime({ message: "Must be ISO 8601 datetime" }),
});

export const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  cancellation_reason: z.string().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  cancellation_reason: z.string().max(500).optional(),
});

export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
```

**Step 5: Verify types**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/validations/settings.ts src/lib/validations/scheduling.ts
git commit -m "feat: add googleapis dependency and scheduling validation schemas"
```

---

## Task 3: Availability Service

**Files:**
- Create: `src/lib/scheduling/availability.ts`

**Purpose:** Pure business logic for calculating available appointment slots. Takes a professional's schedule_grid, existing appointments, and optional Google Calendar busy times, then returns available time slots.

**Step 1: Create the availability service**

Create `src/lib/scheduling/availability.ts`:

```ts
import type { ScheduleGrid, TimeSlot } from "@/lib/validations/settings";

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
] as const;

interface ExistingAppointment {
  starts_at: string;
  ends_at: string;
}

interface BusyBlock {
  start: string; // ISO datetime
  end: string;   // ISO datetime
}

export interface AvailableSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
}

/**
 * Get available appointment slots for a professional on a given date.
 *
 * @param date - The date to check (YYYY-MM-DD)
 * @param scheduleGrid - The professional's working hours
 * @param durationMinutes - Appointment duration in minutes
 * @param existingAppointments - Already booked appointments for that date
 * @param timezone - Clinic timezone (e.g., "America/Sao_Paulo")
 * @param busyBlocks - Optional Google Calendar busy blocks
 */
export function getAvailableSlots(
  date: string,
  scheduleGrid: ScheduleGrid,
  durationMinutes: number,
  existingAppointments: ExistingAppointment[],
  timezone: string,
  busyBlocks: BusyBlock[] = []
): AvailableSlot[] {
  // 1. Determine day of week
  const dateObj = new Date(`${date}T12:00:00`); // noon to avoid timezone issues
  const dayOfWeek = WEEKDAY_NAMES[dateObj.getUTCDay()];
  const workingHours = scheduleGrid[dayOfWeek];

  if (!workingHours || workingHours.length === 0) {
    return []; // Day off
  }

  // 2. Convert working hours to absolute time ranges
  const workingRanges = workingHours.map((slot) =>
    timeSlotToRange(date, slot, timezone)
  );

  // 3. Collect all busy ranges (existing appointments + calendar blocks)
  const busyRanges: { start: number; end: number }[] = [
    ...existingAppointments
      .filter((a) => a.starts_at && a.ends_at)
      .map((a) => ({
        start: new Date(a.starts_at).getTime(),
        end: new Date(a.ends_at).getTime(),
      })),
    ...busyBlocks.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    })),
  ];

  // 4. Calculate available slots
  const slots: AvailableSlot[] = [];
  const slotDurationMs = durationMinutes * 60 * 1000;

  for (const range of workingRanges) {
    let cursor = range.start;

    while (cursor + slotDurationMs <= range.end) {
      const slotEnd = cursor + slotDurationMs;

      // Check if this slot overlaps with any busy range
      const isOccupied = busyRanges.some(
        (busy) => cursor < busy.end && slotEnd > busy.start
      );

      if (!isOccupied) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(slotEnd).toISOString(),
        });
      }

      cursor += slotDurationMs;
    }
  }

  // 5. Filter out past slots (don't offer slots that have already passed)
  const now = Date.now();
  return slots.filter((s) => new Date(s.start).getTime() > now);
}

/**
 * Convert a time slot (HH:MM - HH:MM) on a given date to absolute timestamps.
 */
function timeSlotToRange(
  date: string,
  slot: TimeSlot,
  timezone: string
): { start: number; end: number } {
  const startLocal = `${date}T${slot.start}:00`;
  const endLocal = `${date}T${slot.end}:00`;

  // Use Intl to handle timezone offset
  const startUtc = localToUtc(startLocal, timezone);
  const endUtc = localToUtc(endLocal, timezone);

  return { start: startUtc, end: endUtc };
}

/**
 * Convert a local datetime string to UTC timestamp.
 * Uses Intl.DateTimeFormat to get the timezone offset.
 */
function localToUtc(localDatetime: string, timezone: string): number {
  // Create a date assuming UTC, then adjust for timezone
  const utcDate = new Date(localDatetime + "Z");
  const utcMs = utcDate.getTime();

  // Get the offset of the target timezone at this point in time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });

  // Parse the offset from the formatted string
  const parts = formatter.formatToParts(utcDate);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  const offsetStr = tzPart?.value ?? "GMT";

  // Parse offset like "GMT-3" or "GMT+5:30"
  const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return utcMs;

  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] ?? "0", 10);
  const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;

  // Local time = UTC + offset, so UTC = local - offset
  return utcMs - offsetMs;
}

/**
 * Format available slots as a readable string for the LLM.
 */
export function formatSlotsForLLM(
  slots: AvailableSlot[],
  timezone: string,
  locale: string
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
  });

  // Group slots by date
  const byDate = new Map<string, string[]>();
  for (const slot of slots) {
    const dateKey = dateFormatter.format(new Date(slot.start));
    const timeStr = timeFormatter.format(new Date(slot.start));
    const existing = byDate.get(dateKey) ?? [];
    existing.push(timeStr);
    byDate.set(dateKey, existing);
  }

  const lines: string[] = [];
  for (const [dateStr, times] of byDate) {
    lines.push(`${dateStr}: ${times.join(", ")}`);
  }

  return lines.join("\n");
}
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/scheduling/availability.ts
git commit -m "feat: add availability service for calculating appointment slots"
```

---

## Task 4: Unit Tests for Availability Service

**Files:**
- Create: `src/__tests__/lib/scheduling/availability.test.ts`

**Step 1: Write comprehensive tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAvailableSlots, formatSlotsForLLM } from "@/lib/scheduling/availability";
import type { ScheduleGrid } from "@/lib/validations/settings";

// Fix "now" to 2026-02-13 08:00 UTC (05:00 São Paulo)
const FIXED_NOW = new Date("2026-02-13T08:00:00Z").getTime();

const FULL_WEEK_GRID: ScheduleGrid = {
  monday: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
  tuesday: [{ start: "09:00", end: "18:00" }],
  wednesday: [{ start: "09:00", end: "12:00" }],
  thursday: [{ start: "09:00", end: "18:00" }],
  friday: [{ start: "09:00", end: "17:00" }],
  saturday: [{ start: "09:00", end: "13:00" }],
  sunday: [],
};

const TIMEZONE = "America/Sao_Paulo";

describe("availability service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty slots for a day off (sunday)", () => {
    // 2026-02-15 is a Sunday
    const slots = getAvailableSlots("2026-02-15", FULL_WEEK_GRID, 30, [], TIMEZONE);
    expect(slots).toHaveLength(0);
  });

  it("returns empty slots for a day with empty array", () => {
    const grid: ScheduleGrid = {
      ...FULL_WEEK_GRID,
      monday: [],
    };
    // 2026-02-16 is a Monday
    const slots = getAvailableSlots("2026-02-16", grid, 30, [], TIMEZONE);
    expect(slots).toHaveLength(0);
  });

  it("calculates correct number of 30-min slots for a morning block", () => {
    // Wednesday has 09:00-12:00 = 6 slots of 30 min
    // 2026-02-18 is a Wednesday
    const slots = getAvailableSlots("2026-02-18", FULL_WEEK_GRID, 30, [], TIMEZONE);
    expect(slots).toHaveLength(6);
  });

  it("calculates correct number of 60-min slots", () => {
    // Wednesday 09:00-12:00 = 3 slots of 60 min
    const slots = getAvailableSlots("2026-02-18", FULL_WEEK_GRID, 60, [], TIMEZONE);
    expect(slots).toHaveLength(3);
  });

  it("handles multiple time blocks in one day", () => {
    // Monday: 09:00-12:00 (6 slots) + 14:00-18:00 (8 slots) = 14 slots of 30 min
    const slots = getAvailableSlots("2026-02-16", FULL_WEEK_GRID, 30, [], TIMEZONE);
    expect(slots).toHaveLength(14);
  });

  it("excludes slots that overlap with existing appointments", () => {
    // Wednesday 09:00-12:00, 30 min slots = 6 slots
    // Block 10:00-10:30 = removes 1 slot
    const appointments = [
      {
        starts_at: "2026-02-18T13:00:00.000Z", // 10:00 São Paulo
        ends_at: "2026-02-18T13:30:00.000Z",   // 10:30 São Paulo
      },
    ];
    const slots = getAvailableSlots("2026-02-18", FULL_WEEK_GRID, 30, appointments, TIMEZONE);
    expect(slots).toHaveLength(5);
    // Verify the 10:00 slot is missing
    const slotTimes = slots.map((s) => new Date(s.start).toISOString());
    expect(slotTimes).not.toContain("2026-02-18T13:00:00.000Z");
  });

  it("excludes slots that overlap with Google Calendar busy blocks", () => {
    const busyBlocks = [
      {
        start: "2026-02-18T13:00:00.000Z", // 10:00 São Paulo
        end: "2026-02-18T14:00:00.000Z",   // 11:00 São Paulo
      },
    ];
    const slots = getAvailableSlots("2026-02-18", FULL_WEEK_GRID, 30, [], TIMEZONE, busyBlocks);
    // 2 slots blocked (10:00 and 10:30)
    expect(slots).toHaveLength(4);
  });

  it("filters out past slots", () => {
    // Fixed time is 08:00 UTC = 05:00 São Paulo
    // Friday 2026-02-13: 09:00-17:00 = 16 slots
    // All slots are in the future relative to 05:00 São Paulo
    const slots = getAvailableSlots("2026-02-13", FULL_WEEK_GRID, 30, [], TIMEZONE);
    expect(slots.length).toBeGreaterThan(0);
    // All slots should be after now
    for (const slot of slots) {
      expect(new Date(slot.start).getTime()).toBeGreaterThan(FIXED_NOW);
    }
  });

  it("returns empty when all slots are in the past", () => {
    // Set time to end of day
    vi.setSystemTime(new Date("2026-02-13T23:00:00Z").getTime());
    const slots = getAvailableSlots("2026-02-13", FULL_WEEK_GRID, 30, [], TIMEZONE);
    expect(slots).toHaveLength(0);
  });

  it("handles duration that doesn't evenly divide the block", () => {
    // Wednesday 09:00-12:00 = 180 min, with 45-min slots = 4 slots (0, 45, 90, 135 = 4 fits)
    const slots = getAvailableSlots("2026-02-18", FULL_WEEK_GRID, 45, [], TIMEZONE);
    expect(slots).toHaveLength(4);
  });
});

describe("formatSlotsForLLM", () => {
  it("returns 'No available slots.' for empty array", () => {
    const result = formatSlotsForLLM([], "America/Sao_Paulo", "pt-BR");
    expect(result).toBe("No available slots.");
  });

  it("groups slots by date", () => {
    const slots = [
      { start: "2026-02-18T12:00:00.000Z", end: "2026-02-18T12:30:00.000Z" },
      { start: "2026-02-18T12:30:00.000Z", end: "2026-02-18T13:00:00.000Z" },
      { start: "2026-02-19T12:00:00.000Z", end: "2026-02-19T12:30:00.000Z" },
    ];
    const result = formatSlotsForLLM(slots, "America/Sao_Paulo", "pt-BR");
    const lines = result.split("\n");
    expect(lines).toHaveLength(2); // 2 different dates
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/__tests__/lib/scheduling/availability.test.ts`

All tests should pass. If timezone calculations are off, adjust the UTC times in the test assertions.

**Step 3: Commit**

```bash
git add src/__tests__/lib/scheduling/availability.test.ts
git commit -m "test: add unit tests for availability service"
```

---

## Task 5: Google Calendar Service

**Files:**
- Create: `src/services/google-calendar.ts`

**Step 1: Create the Google Calendar service**

```ts
import "server-only";

import { google, type calendar_v3 } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// ── OAuth Helpers ──

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

/**
 * Generate the OAuth consent URL for a professional to connect their calendar.
 * The `state` parameter encodes the professional ID for the callback.
 */
export function getConsentUrl(professionalId: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: professionalId,
  });
}

/**
 * Exchange an authorization code for tokens.
 * Returns the refresh token to store in the DB.
 */
export async function exchangeCode(code: string): Promise<{
  success: boolean;
  refreshToken?: string;
  error?: string;
}> {
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return { success: false, error: "No refresh token returned. User may need to revoke and re-authorize." };
    }

    return { success: true, refreshToken: tokens.refresh_token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token exchange failed";
    console.error("[google-calendar] token exchange error:", message);
    return { success: false, error: message };
  }
}

/**
 * Build an authenticated Calendar client from a stored refresh token.
 */
function getCalendarClient(refreshToken: string): calendar_v3.Calendar {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// ── Event CRUD ──

interface EventInput {
  summary: string;
  description?: string;
  startTime: string;  // ISO datetime
  endTime: string;    // ISO datetime
  timezone: string;
}

export async function createEvent(
  refreshToken: string,
  calendarId: string,
  input: EventInput
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startTime, timeZone: input.timezone },
        end: { dateTime: input.endTime, timeZone: input.timezone },
      },
    });

    return { success: true, eventId: res.data.id ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create event";
    console.error("[google-calendar] create event error:", message);
    return { success: false, error: message };
  }
}

export async function updateEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  input: Partial<EventInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const requestBody: calendar_v3.Schema$Event = {};

    if (input.summary) requestBody.summary = input.summary;
    if (input.description) requestBody.description = input.description;
    if (input.startTime) {
      requestBody.start = { dateTime: input.startTime, timeZone: input.timezone };
    }
    if (input.endTime) {
      requestBody.end = { dateTime: input.endTime, timeZone: input.timezone };
    }

    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update event";
    console.error("[google-calendar] update event error:", message);
    return { success: false, error: message };
  }
}

export async function deleteEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const calendar = getCalendarClient(refreshToken);
    await calendar.events.delete({ calendarId, eventId });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete event";
    console.error("[google-calendar] delete event error:", message);
    return { success: false, error: message };
  }
}

// ── Free/Busy ──

interface BusyBlock {
  start: string;
  end: string;
}

export async function getFreeBusy(
  refreshToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<{ success: boolean; busyBlocks?: BusyBlock[]; error?: string }> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      },
    });

    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    const busyBlocks: BusyBlock[] = busy
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .map((b) => ({ start: b.start!, end: b.end! }));

    return { success: true, busyBlocks };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to query free/busy";
    console.error("[google-calendar] free/busy error:", message);
    return { success: false, error: message };
  }
}

// ── Get Primary Calendar ID ──

export async function getPrimaryCalendarId(
  refreshToken: string
): Promise<{ success: boolean; calendarId?: string; error?: string }> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const res = await calendar.calendarList.list({ minAccessRole: "owner" });
    const primary = res.data.items?.find((c) => c.primary);
    return {
      success: true,
      calendarId: primary?.id ?? "primary",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get calendar";
    console.error("[google-calendar] get calendar error:", message);
    return { success: false, error: message };
  }
}
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/services/google-calendar.ts
git commit -m "feat: add Google Calendar service with OAuth, event CRUD, and free/busy"
```

---

## Task 6: Google Calendar OAuth API Routes

**Files:**
- Create: `src/app/api/integrations/google-calendar/connect/route.ts`
- Create: `src/app/api/integrations/google-calendar/callback/route.ts`
- Create: `src/app/api/integrations/google-calendar/disconnect/route.ts`

**Step 1: Connect route (generates OAuth URL)**

Create `src/app/api/integrations/google-calendar/connect/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConsentUrl } from "@/services/google-calendar";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { professional_id } = body as { professional_id?: string };
  if (!professional_id) {
    return NextResponse.json({ error: "professional_id is required" }, { status: 400 });
  }

  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify professional belongs to user's clinic
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  const { data: professional } = await admin
    .from("professionals")
    .select("id")
    .eq("id", professional_id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (!professional) {
    return NextResponse.json({ error: "Professional not found" }, { status: 404 });
  }

  const url = getConsentUrl(professional_id);
  return NextResponse.json({ data: { url } });
}
```

**Step 2: Callback route (handles OAuth redirect)**

Create `src/app/api/integrations/google-calendar/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, getPrimaryCalendarId } from "@/services/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // professional_id
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=calendar_denied", request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=missing_params", request.url)
    );
  }

  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  // Exchange code for tokens
  const tokenResult = await exchangeCode(code);
  if (!tokenResult.success || !tokenResult.refreshToken) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=token_exchange", request.url)
    );
  }

  // Get primary calendar ID
  const calendarResult = await getPrimaryCalendarId(tokenResult.refreshToken);
  const calendarId = calendarResult.calendarId ?? "primary";

  // Store tokens on professional
  const admin = createAdminClient();

  // Verify ownership
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=no_clinic", request.url)
    );
  }

  const { error: updateError } = await admin
    .from("professionals")
    .update({
      google_refresh_token: tokenResult.refreshToken,
      google_calendar_id: calendarId,
    })
    .eq("id", state)
    .eq("clinic_id", membership.clinic_id);

  if (updateError) {
    console.error("[google-calendar] failed to store tokens:", updateError.message);
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=save_failed", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/settings?tab=integrations&success=calendar_connected", request.url)
  );
}
```

**Step 3: Disconnect route**

Create `src/app/api/integrations/google-calendar/disconnect/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { professional_id } = body as { professional_id?: string };
  if (!professional_id) {
    return NextResponse.json({ error: "professional_id is required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  const { error } = await admin
    .from("professionals")
    .update({
      google_refresh_token: null,
      google_calendar_id: null,
    })
    .eq("id", professional_id)
    .eq("clinic_id", membership.clinic_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { disconnected: true } });
}
```

**Step 4: Verify types**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/api/integrations/google-calendar/
git commit -m "feat: add Google Calendar OAuth routes (connect, callback, disconnect)"
```

---

## Task 7: Appointment API Routes

**Files:**
- Create: `src/app/api/appointments/available-slots/route.ts`
- Create: `src/app/api/appointments/route.ts`
- Create: `src/app/api/appointments/[id]/route.ts`

**Step 1: Available slots endpoint**

Create `src/app/api/appointments/available-slots/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { availableSlotsQuerySchema } from "@/lib/validations/scheduling";
import { getAvailableSlots } from "@/lib/scheduling/availability";
import { getFreeBusy } from "@/services/google-calendar";
import type { ScheduleGrid } from "@/lib/validations/settings";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  // Parse query params
  const { searchParams } = request.nextUrl;
  const parsed = availableSlotsQuerySchema.safeParse({
    professional_id: searchParams.get("professional_id"),
    date: searchParams.get("date"),
    service_id: searchParams.get("service_id") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { professional_id, date, service_id } = parsed.data;

  // Load professional
  const { data: professional, error: profError } = await admin
    .from("professionals")
    .select("schedule_grid, appointment_duration_minutes, google_calendar_id, google_refresh_token")
    .eq("id", professional_id)
    .eq("clinic_id", membership.clinic_id)
    .eq("active", true)
    .single();

  if (profError || !professional) {
    return NextResponse.json({ error: "Professional not found" }, { status: 404 });
  }

  // Get service duration if specified
  let durationMinutes = professional.appointment_duration_minutes;
  if (service_id) {
    const { data: service } = await admin
      .from("services")
      .select("duration_minutes")
      .eq("id", service_id)
      .eq("clinic_id", membership.clinic_id)
      .single();

    if (service) {
      durationMinutes = service.duration_minutes;
    }
  }

  // Load existing appointments for the date
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: appointments } = await admin
    .from("appointments")
    .select("starts_at, ends_at")
    .eq("professional_id", professional_id)
    .eq("clinic_id", membership.clinic_id)
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", dayStart)
    .lte("starts_at", dayEnd);

  // Load clinic timezone
  const { data: clinic } = await admin
    .from("clinics")
    .select("timezone")
    .eq("id", membership.clinic_id)
    .single();

  const timezone = clinic?.timezone ?? "America/Sao_Paulo";

  // Optionally fetch Google Calendar busy times
  let busyBlocks: { start: string; end: string }[] = [];
  if (professional.google_refresh_token && professional.google_calendar_id) {
    const freeBusy = await getFreeBusy(
      professional.google_refresh_token,
      professional.google_calendar_id,
      dayStart,
      dayEnd
    );
    if (freeBusy.success && freeBusy.busyBlocks) {
      busyBlocks = freeBusy.busyBlocks;
    }
  }

  const slots = getAvailableSlots(
    date,
    professional.schedule_grid as ScheduleGrid,
    durationMinutes,
    appointments ?? [],
    timezone,
    busyBlocks
  );

  return NextResponse.json({ data: slots });
}
```

**Step 2: Book appointment endpoint**

Create `src/app/api/appointments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookAppointmentSchema } from "@/lib/validations/scheduling";
import { createEvent } from "@/services/google-calendar";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bookAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  const { professional_id, patient_id, service_id, starts_at, ends_at } = parsed.data;

  // Check for time conflict
  const { data: conflicts } = await admin
    .from("appointments")
    .select("id")
    .eq("professional_id", professional_id)
    .eq("clinic_id", membership.clinic_id)
    .in("status", ["scheduled", "confirmed"])
    .lt("starts_at", ends_at)
    .gt("ends_at", starts_at)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Time slot is already booked" }, { status: 409 });
  }

  // Create appointment
  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      clinic_id: membership.clinic_id,
      professional_id,
      patient_id,
      service_id: service_id ?? null,
      starts_at,
      ends_at,
      status: "scheduled",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync to Google Calendar if professional is connected
  const { data: professional } = await admin
    .from("professionals")
    .select("name, google_calendar_id, google_refresh_token")
    .eq("id", professional_id)
    .single();

  const { data: patient } = await admin
    .from("patients")
    .select("name")
    .eq("id", patient_id)
    .single();

  const { data: clinic } = await admin
    .from("clinics")
    .select("name, timezone")
    .eq("id", membership.clinic_id)
    .single();

  if (
    professional?.google_refresh_token &&
    professional?.google_calendar_id &&
    clinic
  ) {
    const calResult = await createEvent(
      professional.google_refresh_token,
      professional.google_calendar_id,
      {
        summary: `${patient?.name ?? "Patient"} — ${clinic.name}`,
        description: `Appointment booked via Órbita`,
        startTime: starts_at,
        endTime: ends_at,
        timezone: clinic.timezone,
      }
    );

    if (calResult.success && calResult.eventId) {
      await admin
        .from("appointments")
        .update({ google_event_id: calResult.eventId })
        .eq("id", appointment.id);
    }
  }

  return NextResponse.json({ data: appointment }, { status: 201 });
}
```

**Step 3: Update/cancel appointment endpoint**

Create `src/app/api/appointments/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAppointmentSchema } from "@/lib/validations/scheduling";
import { updateEvent, deleteEvent } from "@/services/google-calendar";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  // Verify appointment belongs to clinic
  const { data: existing } = await admin
    .from("appointments")
    .select("id, professional_id, google_event_id, starts_at, ends_at")
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.status) updatePayload.status = parsed.data.status;
  if (parsed.data.starts_at) updatePayload.starts_at = parsed.data.starts_at;
  if (parsed.data.ends_at) updatePayload.ends_at = parsed.data.ends_at;
  if (parsed.data.cancellation_reason) updatePayload.cancellation_reason = parsed.data.cancellation_reason;

  const { data: updated, error } = await admin
    .from("appointments")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync to Google Calendar
  if (existing.google_event_id && existing.professional_id) {
    const { data: professional } = await admin
      .from("professionals")
      .select("google_calendar_id, google_refresh_token")
      .eq("id", existing.professional_id)
      .single();

    const { data: clinic } = await admin
      .from("clinics")
      .select("timezone")
      .eq("id", membership.clinic_id)
      .single();

    if (professional?.google_refresh_token && professional?.google_calendar_id && clinic) {
      if (parsed.data.status === "cancelled") {
        await deleteEvent(
          professional.google_refresh_token,
          professional.google_calendar_id,
          existing.google_event_id
        );
      } else if (parsed.data.starts_at || parsed.data.ends_at) {
        await updateEvent(
          professional.google_refresh_token,
          professional.google_calendar_id,
          existing.google_event_id,
          {
            startTime: parsed.data.starts_at ?? existing.starts_at,
            endTime: parsed.data.ends_at ?? existing.ends_at,
            timezone: clinic.timezone,
          }
        );
      }
    }
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("clinic_users")
    .select("clinic_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No clinic found" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("appointments")
    .select("id, professional_id, google_event_id")
    .eq("id", id)
    .eq("clinic_id", membership.clinic_id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // Cancel instead of hard delete
  await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);

  // Remove from Google Calendar
  if (existing.google_event_id && existing.professional_id) {
    const { data: professional } = await admin
      .from("professionals")
      .select("google_calendar_id, google_refresh_token")
      .eq("id", existing.professional_id)
      .single();

    if (professional?.google_refresh_token && professional?.google_calendar_id) {
      await deleteEvent(
        professional.google_refresh_token,
        professional.google_calendar_id,
        existing.google_event_id
      ).catch((err) => console.error("[appointments] calendar delete failed:", err));
    }
  }

  return NextResponse.json({ data: { cancelled: true } });
}
```

**Step 4: Verify types**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/api/appointments/
git commit -m "feat: add appointment API routes (available slots, book, update, cancel)"
```

---

## Task 8: Scheduling Agent — Prompts + Config + Registration

**Files:**
- Create: `src/lib/agents/agents/scheduling.ts`
- Modify: `src/lib/agents/index.ts` (add import)

**Step 1: Create the scheduling agent**

Create `src/lib/agents/agents/scheduling.ts` following the exact same pattern as `basic-support.ts`.

**Base prompts (3 locales):**

```ts
const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de agendamento de consultas. Seu papel e ajudar pacientes a agendar, remarcar ou cancelar consultas.

Regras:
- Use o primeiro nome do paciente na conversa.
- Para agendar: primeiro pergunte qual profissional e qual tipo de consulta. Depois use check_availability para ver horarios disponiveis. Ofereça 2-3 opcoes. Confirme antes de criar o agendamento.
- Para remarcar: use list_patient_appointments para ver as consultas existentes. Depois use check_availability para novos horarios. Confirme antes de atualizar.
- Para cancelar: use list_patient_appointments, confirme qual consulta, e use cancel_appointment com o motivo.
- NUNCA invente horarios disponiveis. Sempre use a ferramenta check_availability.
- NUNCA crie agendamentos sem confirmacao explicita do paciente.
- Se nao conseguir ajudar apos 2 tentativas, escale para um atendente humano.
- Responda sempre em portugues do Brasil.`,

  en: `You are an appointment scheduling assistant. Your role is to help patients book, reschedule, or cancel appointments.

Rules:
- Use the patient's first name in conversation.
- To book: first ask which professional and what type of service. Then use check_availability to see available times. Offer 2-3 options. Confirm before creating the appointment.
- To reschedule: use list_patient_appointments to see existing appointments. Then use check_availability for new times. Confirm before updating.
- To cancel: use list_patient_appointments, confirm which appointment, and use cancel_appointment with the reason.
- NEVER fabricate available times. Always use the check_availability tool.
- NEVER create appointments without explicit patient confirmation.
- If you cannot help after 2 attempts, escalate to a human agent.
- Always respond in English.`,

  es: `Eres un asistente de agendamiento de citas. Tu rol es ayudar a los pacientes a agendar, reprogramar o cancelar citas.

Reglas:
- Usa el primer nombre del paciente en la conversacion.
- Para agendar: primero pregunta cual profesional y que tipo de servicio. Luego usa check_availability para ver horarios disponibles. Ofrece 2-3 opciones. Confirma antes de crear la cita.
- Para reprogramar: usa list_patient_appointments para ver las citas existentes. Luego usa check_availability para nuevos horarios. Confirma antes de actualizar.
- Para cancelar: usa list_patient_appointments, confirma cual cita, y usa cancel_appointment con el motivo.
- NUNCA inventes horarios disponibles. Siempre usa la herramienta check_availability.
- NUNCA crees citas sin confirmacion explicita del paciente.
- Si no puedes ayudar despues de 2 intentos, escala a un agente humano.
- Responde siempre en espanol.`,
};
```

**Instructions (3 locales):**

```ts
const INSTRUCTIONS: Record<string, string> = {
  "pt-BR": "Ajude pacientes a agendar, remarcar ou cancelar consultas. Sempre verifique disponibilidade antes de oferecer horarios. Confirme antes de criar agendamentos.",
  en: "Help patients book, reschedule, or cancel appointments. Always check availability before offering times. Confirm before creating bookings.",
  es: "Ayuda a los pacientes a agendar, reprogramar o cancelar citas. Siempre verifica disponibilidad antes de ofrecer horarios. Confirma antes de crear citas.",
};
```

**6 tool stubs:**

1. `check_availability` — params: `professional_id` (uuid), `date` (YYYY-MM-DD), `service_id` (optional uuid)
2. `book_appointment` — params: `professional_id` (uuid), `starts_at` (ISO datetime), `ends_at` (ISO datetime), `service_id` (optional uuid)
3. `reschedule_appointment` — params: `appointment_id` (uuid), `new_starts_at` (ISO datetime), `new_ends_at` (ISO datetime)
4. `cancel_appointment` — params: `appointment_id` (uuid), `reason` (string)
5. `list_patient_appointments` — no params (uses recipient context)
6. `escalate_to_human` — params: `reason` (string)

**Agent config:** `type: "scheduling"`, `supportedChannels: ["whatsapp"]`

**Step 2: Register in barrel**

Add to `src/lib/agents/index.ts` at the end:
```ts
import "./agents/scheduling";
```

**Step 3: Verify types**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts src/lib/agents/index.ts
git commit -m "feat: add scheduling agent with prompts and 6 tool definitions"
```

---

## Task 9: Scheduling Agent — Tool Handlers

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts` (add handler implementations)

This task implements the `handleToolCall` switch and each handler function.

**Handler implementations:**

### `handleCheckAvailability`
- Receives `professional_id`, `date`, optionally `service_id`
- Queries `professionals` for `schedule_grid`, `appointment_duration_minutes`, `google_calendar_id`, `google_refresh_token`
- Queries `appointments` for the date (status = scheduled|confirmed)
- Gets `clinics.timezone`
- Optionally fetches Google Calendar free/busy
- Calls `getAvailableSlots()` from availability service
- Formats with `formatSlotsForLLM()`
- Returns formatted slots as `result` string
- If professional not found, returns error string (no throw)

### `handleBookAppointment`
- Receives `professional_id`, `starts_at`, `ends_at`, optionally `service_id`
- Uses `context.recipientId` as `patient_id`
- Checks for time conflicts
- Inserts appointment into DB
- Syncs to Google Calendar if connected (same logic as API route)
- Returns confirmation string with date/time formatted in clinic locale
- Returns `appendToResponse` with appointment details

### `handleRescheduleAppointment`
- Receives `appointment_id`, `new_starts_at`, `new_ends_at`
- Verifies appointment belongs to patient (`context.recipientId`)
- Updates appointment times
- Syncs to Google Calendar (update event)
- Returns confirmation string

### `handleCancelAppointment`
- Receives `appointment_id`, `reason`
- Verifies appointment belongs to patient
- Sets `status: "cancelled"`, `cancellation_reason`
- Deletes Google Calendar event
- Returns confirmation string

### `handleListPatientAppointments`
- No args needed — uses `context.recipientId`
- Queries upcoming appointments (status = scheduled|confirmed, starts_at > now)
- Joins with `professionals.name` and `services.name`
- Formats as readable list for LLM
- Returns empty message if no appointments found

### `handleEscalateToHuman`
- Same pattern as basic-support
- Returns `newConversationStatus: "escalated"`

**Key pattern:** Each handler follows the same structure as `basic-support.ts`:
```ts
async function handleXxx(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    // ... implementation
    return { result: "Success message for LLM" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { result: `Error: ${message}` };
  }
}
```

**Step 2: Verify types**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts
git commit -m "feat: implement scheduling agent tool handlers"
```

---

## Task 10: Unit Tests for Scheduling Agent

**Files:**
- Create: `src/__tests__/lib/agents/scheduling.test.ts`

**Test coverage (same pattern as `src/__tests__/lib/agents/basic-support.test.ts`):**

1. **Registration** — `getAgentType("scheduling")` returns config
2. **Type** — `config.type === "scheduling"`
3. **Supported channels** — includes `"whatsapp"`
4. **Tools** — `getTools()` returns 6 tools
5. **Tool names** — verify all 6 names exist
6. **System prompt pt-BR** — includes Portuguese keywords
7. **System prompt en** — includes English keywords
8. **System prompt es** — includes Spanish keywords
9. **Instructions pt-BR** — non-empty string
10. **Instructions en** — non-empty string

**Tool handler tests (mock Supabase):**

11. **check_availability** — mock professional + empty appointments → returns slots string
12. **check_availability with no schedule** — returns "no available slots"
13. **book_appointment** — mock insert → returns confirmation
14. **book_appointment conflict** — mock conflict query → returns error string
15. **cancel_appointment** — mock update → returns confirmation with `newConversationStatus` undefined
16. **list_patient_appointments** — mock appointments → returns formatted list
17. **list_patient_appointments empty** — returns "no appointments" message
18. **escalate_to_human** — returns `newConversationStatus: "escalated"`
19. **unknown tool** — returns empty object, logs warning

**Step 2: Run tests**

Run: `npx vitest run`

**Step 3: Commit**

```bash
git add src/__tests__/lib/agents/scheduling.test.ts
git commit -m "test: add unit tests for scheduling agent"
```

---

## Task 11: Professional Schedule Grid UI

**Files:**
- Modify: `src/components/settings/professional-form.tsx`
- Create: `src/components/settings/schedule-grid-editor.tsx`
- Modify: `src/app/api/settings/professionals/route.ts` (accept schedule_grid in POST)
- Modify: `src/app/api/settings/professionals/[id]/route.ts` (accept schedule_grid in PUT, return it in fields)

**Step 1: Create schedule grid editor component**

Create `src/components/settings/schedule-grid-editor.tsx`:

A visual component with 7 rows (one per weekday). Each row has:
- Weekday name (from i18n)
- A toggle (on/off for working that day)
- When on: start time dropdown + end time dropdown
- "Add block" button (supports split shifts like 09:00-12:00 + 14:00-18:00)

Time options: every 30 minutes from 06:00 to 22:00.

Props:
```ts
interface ScheduleGridEditorProps {
  value: ScheduleGrid;
  onChange: (grid: ScheduleGrid) => void;
}
```

**Step 2: Integrate into ProfessionalForm**

Add the schedule grid editor below the duration input. The form already saves via POST/PUT, so extend the body to include `schedule_grid`.

**Step 3: Update API routes to accept and return schedule_grid**

In `src/app/api/settings/professionals/route.ts`:
- GET: add `schedule_grid` to select
- POST: include `schedule_grid` in insert

In `src/app/api/settings/professionals/[id]/route.ts`:
- PUT: include `schedule_grid` in update

**Step 4: Update ProfessionalForm props to include schedule_grid**

```ts
interface ProfessionalFormProps {
  professional?: {
    id: string;
    name: string;
    specialty: string | null;
    appointment_duration_minutes: number;
    schedule_grid: ScheduleGrid;
  };
  // ...
}
```

**Step 5: Verify types + build**

Run: `npx tsc --noEmit && npx next build`

**Step 6: Commit**

```bash
git add src/components/settings/schedule-grid-editor.tsx src/components/settings/professional-form.tsx src/app/api/settings/professionals/
git commit -m "feat: add schedule grid editor to professional form"
```

---

## Task 12: Google Calendar Connect UI

**Files:**
- Create: `src/components/settings/integrations-calendar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx` (replace IntegrationsPlaceholder)

**Step 1: Create calendar integration component**

Create `src/components/settings/integrations-calendar.tsx`:

```tsx
"use client";

// Shows a list of professionals with:
// - Name + specialty
// - Google Calendar status: "Connected" (green badge) or "Not Connected" (neutral badge)
// - Button: "Connect" (opens OAuth) or "Disconnect"
```

The component:
1. Fetches professionals from `/api/settings/professionals` (include `google_calendar_id`)
2. "Connect" button: calls `POST /api/integrations/google-calendar/connect` → opens returned URL in new tab/redirect
3. "Disconnect" button: calls `POST /api/integrations/google-calendar/disconnect`
4. Shows connection status per professional

**Step 2: Update settings page**

In `src/app/(dashboard)/settings/page.tsx`:
- Replace `IntegrationsPlaceholder` import with `IntegrationsCalendar` (or a new `IntegrationsTab` that includes calendar + placeholders for Gmail/Pagarme)

**Step 3: Update professionals API to return google_calendar_id**

In `src/app/api/settings/professionals/route.ts` GET, add `google_calendar_id` to select:
```ts
.select("id, name, specialty, appointment_duration_minutes, schedule_grid, google_calendar_id, active, created_at")
```

**Step 4: Verify types**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/components/settings/integrations-calendar.tsx src/app/\(dashboard\)/settings/page.tsx src/app/api/settings/professionals/route.ts
git commit -m "feat: add Google Calendar connection UI in settings"
```

---

## Task 13: i18n Strings

**Files:**
- Modify: `messages/pt-BR.json`
- Modify: `messages/en.json`
- Modify: `messages/es.json`

**Add these keys under `"settings"`:**

```json
"scheduling": {
  "title": "Agendamento",
  "description": "Agendamento de consultas via WhatsApp"
},
"scheduleGrid": {
  "title": "Horários de trabalho",
  "addBlock": "Adicionar bloco",
  "noWorkingHours": "Sem horário definido"
},
"integrations": {
  "calendarTitle": "Google Calendar",
  "connected": "Conectado",
  "notConnected": "Não conectado",
  "connect": "Conectar",
  "disconnect": "Desconectar",
  "connectDescription": "Conecte o Google Calendar de cada profissional para sincronizar consultas automaticamente.",
  "disconnectConfirm": "Desconectar o Google Calendar?",
  "connectSuccess": "Google Calendar conectado com sucesso",
  "connectError": "Falha ao conectar Google Calendar"
}
```

**Weekday names** (if not already present):
```json
"weekdays": {
  "monday": "Segunda",
  "tuesday": "Terça",
  "wednesday": "Quarta",
  "thursday": "Quinta",
  "friday": "Sexta",
  "saturday": "Sábado",
  "sunday": "Domingo"
}
```

**Under `"modules"`** add scheduling module:
```json
"scheduling": {
  "name": "Agendamento",
  "description": "Agendamento de consultas com Google Calendar"
}
```

Repeat for `en.json` and `es.json` with translated strings.

**Step 1: Verify no hardcoded strings remain**

Run: `grep -r "Conectar\|Connect\|Disconnect\|Desconectar" src/components/settings/`

All user-facing strings should come from `useTranslations()`.

**Step 2: Commit**

```bash
git add messages/
git commit -m "feat: add scheduling and calendar i18n strings for all 3 locales"
```

---

## Task 14: Build Verification + Type Check + All Tests

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Zero errors.

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (previous 32 + new availability tests + scheduling agent tests).

**Step 3: Build**

Run: `npx next build`
Expected: Build succeeds. New routes visible in output:
- `/api/appointments/available-slots`
- `/api/appointments`
- `/api/appointments/[id]`
- `/api/integrations/google-calendar/connect`
- `/api/integrations/google-calendar/callback`
- `/api/integrations/google-calendar/disconnect`

**Step 4: Verify agent registration**

Quick sanity check — in a test or REPL:
```ts
import { getAgentType, getRegisteredTypes } from "@/lib/agents";
console.log(getRegisteredTypes()); // Should include "support" and "scheduling"
```

**Step 5: Commit (if any final fixes needed)**

```bash
git commit -m "chore: verify build, types, and tests for Phase 7"
```

---

## Testing Guide (Post-Deploy)

### Prerequisites
1. Push all commits to trigger Vercel deploy
2. Set env vars on Vercel: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`
3. In Supabase: add a `scheduling` agent row for the clinic (`INSERT INTO agents (clinic_id, type, name, active) VALUES (...)`)
4. Set `schedule_grid` on at least one professional

### Test Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | WhatsApp: "Quero agendar uma consulta" | Support agent routes to scheduling |
| 2 | Scheduling agent asks which professional | Shows list of active professionals |
| 3 | Patient picks professional | Agent calls `check_availability`, shows slots |
| 4 | Patient picks a slot | Agent calls `book_appointment`, confirms booking |
| 5 | WhatsApp: "Quero remarcar" | Agent lists appointments, offers new slots |
| 6 | WhatsApp: "Quero cancelar" | Agent cancels and confirms |
| 7 | Settings > Professionals: schedule grid editor | Can set working hours per day |
| 8 | Settings > Integrations: Connect Google Calendar | OAuth flow opens Google consent screen |
| 9 | After connecting: appointment creates Calendar event | Event appears in professional's Google Calendar |
| 10 | Cancel appointment: Calendar event removed | Event deleted from Google Calendar |

---

## Summary

| Task | What | Files Changed |
|------|------|---------------|
| 1 | Fix module routing | `process-message.ts` |
| 2 | Dependencies + schemas | `package.json`, `.env.example`, `validations/` |
| 3 | Availability service | `src/lib/scheduling/availability.ts` |
| 4 | Availability tests | `src/__tests__/lib/scheduling/` |
| 5 | Google Calendar service | `src/services/google-calendar.ts` |
| 6 | Calendar OAuth routes | `src/app/api/integrations/google-calendar/` |
| 7 | Appointment API routes | `src/app/api/appointments/` |
| 8 | Scheduling agent prompts | `src/lib/agents/agents/scheduling.ts` |
| 9 | Scheduling agent handlers | `src/lib/agents/agents/scheduling.ts` |
| 10 | Scheduling agent tests | `src/__tests__/lib/agents/scheduling.test.ts` |
| 11 | Schedule grid UI | `src/components/settings/` |
| 12 | Calendar connect UI | `src/components/settings/` |
| 13 | i18n strings | `messages/*.json` |
| 14 | Build verification | — |

**Estimated new code:** ~2,500 lines across 15+ files
**New tests:** ~30 test cases
**New API routes:** 6 endpoints
