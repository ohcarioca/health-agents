import "server-only";

import { google, type calendar_v3 } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

interface EventInput {
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

interface BusyBlock {
  start: string;
  end: string;
}

interface OAuthResult {
  success: boolean;
  refreshToken?: string;
  error?: string;
}

interface CalendarIdResult {
  success: boolean;
  calendarId?: string;
  error?: string;
}

interface EventResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

interface MutationResult {
  success: boolean;
  error?: string;
}

interface FreeBusyResult {
  success: boolean;
  busyBlocks?: BusyBlock[];
  error?: string;
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("missing Google Calendar OAuth configuration");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getCalendarClient(
  refreshToken: string
): calendar_v3.Calendar {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// --- OAuth helpers ---

export function getConsentUrl(oauthState: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: oauthState,
  });
}

export async function exchangeCode(code: string): Promise<OAuthResult> {
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error("[google-calendar] no refresh token in exchange response");
      return { success: false, error: "no refresh token returned" };
    }

    return { success: true, refreshToken: tokens.refresh_token };
  } catch (err) {
    console.error("[google-calendar] code exchange error:", err);
    return { success: false, error: String(err) };
  }
}

// --- Calendar ID ---

export async function getPrimaryCalendarId(
  refreshToken: string
): Promise<CalendarIdResult> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const response = await calendar.calendarList.get({ calendarId: "primary" });
    const calendarId = response.data.id;

    if (!calendarId) {
      return { success: false, error: "primary calendar not found" };
    }

    return { success: true, calendarId };
  } catch (err) {
    console.error("[google-calendar] get primary calendar error:", err);
    return { success: false, error: String(err) };
  }
}

// --- Event CRUD ---

export async function createEvent(
  refreshToken: string,
  calendarId: string,
  input: EventInput
): Promise<EventResult> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: {
          dateTime: input.startTime,
          timeZone: input.timezone,
        },
        end: {
          dateTime: input.endTime,
          timeZone: input.timezone,
        },
      },
    });

    const eventId = response.data.id;
    if (!eventId) {
      return { success: false, error: "event created but no ID returned" };
    }

    return { success: true, eventId };
  } catch (err) {
    console.error("[google-calendar] create event error:", err);
    return { success: false, error: String(err) };
  }
}

export async function updateEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  input: Partial<EventInput>
): Promise<MutationResult> {
  try {
    const calendar = getCalendarClient(refreshToken);

    const requestBody: calendar_v3.Schema$Event = {};
    if (input.summary !== undefined) {
      requestBody.summary = input.summary;
    }
    if (input.description !== undefined) {
      requestBody.description = input.description;
    }
    if (input.startTime !== undefined) {
      requestBody.start = {
        dateTime: input.startTime,
        timeZone: input.timezone,
      };
    }
    if (input.endTime !== undefined) {
      requestBody.end = {
        dateTime: input.endTime,
        timeZone: input.timezone,
      };
    }

    await calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
    });

    return { success: true };
  } catch (err) {
    console.error("[google-calendar] update event error:", err);
    return { success: false, error: String(err) };
  }
}

export async function deleteEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string
): Promise<MutationResult> {
  try {
    const calendar = getCalendarClient(refreshToken);
    await calendar.events.delete({ calendarId, eventId });
    return { success: true };
  } catch (err) {
    console.error("[google-calendar] delete event error:", err);
    return { success: false, error: String(err) };
  }
}

// --- Free/Busy ---

export async function getFreeBusy(
  refreshToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<FreeBusyResult> {
  try {
    const calendar = getCalendarClient(refreshToken);
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      },
    });

    const calendarData = response.data.calendars?.[calendarId];
    const busy = calendarData?.busy ?? [];

    const busyBlocks: BusyBlock[] = busy
      .filter(
        (block): block is { start: string; end: string } =>
          typeof block.start === "string" && typeof block.end === "string"
      )
      .map((block) => ({
        start: block.start,
        end: block.end,
      }));

    return { success: true, busyBlocks };
  } catch (err) {
    console.error("[google-calendar] free/busy query error:", err);
    return { success: false, error: String(err) };
  }
}

export type { EventInput, BusyBlock };
