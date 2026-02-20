import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendTextMessage,
  sendTemplateMessage,
  type WhatsAppCredentials,
} from "@/services/whatsapp";

// ── Constants ──

const MAX_DAILY_MESSAGES = 3;
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 20;

// ── Types ──

export interface OutboundSendResult {
  success: boolean;
  messageId?: string;
  skippedReason?: string;
}

export interface SendOutboundMessageOptions {
  clinicId: string;
  patientId: string;
  patientPhone: string;
  text: string;
  timezone: string;
  conversationId: string;
  credentials: WhatsAppCredentials;
  skipBusinessHoursCheck?: boolean;
}

export interface SendOutboundTemplateOptions {
  clinicId: string;
  patientId: string;
  patientPhone: string;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
  localBody: string;
  timezone: string;
  conversationId: string;
  credentials: WhatsAppCredentials;
  skipBusinessHoursCheck?: boolean;
}

// ── Business Hours ──

export function isWithinBusinessHours(
  date: Date,
  timezone: string
): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourStr = parts.find((p) => p.type === "hour")?.value;

  if (!weekday || !hourStr) {
    return false;
  }

  if (weekday === "Sun") {
    return false;
  }

  const hour = parseInt(hourStr, 10);

  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

// ── Rate Limiting ──

export async function canSendToPatient(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  timezone: string
): Promise<boolean> {
  const startOfToday = getStartOfDayInTimezone(new Date(), timezone);

  const { count, error } = await supabase
    .from("message_queue")
    .select("*", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .gte("created_at", startOfToday)
    .in("status", ["sent", "pending", "processing"]);

  if (error) {
    console.error("[outbound] rate limit check failed:", error.message);
    return false;
  }

  return (count ?? 0) < MAX_DAILY_MESSAGES;
}

// ── Send Text Message ──

export async function sendOutboundMessage(
  supabase: SupabaseClient,
  options: SendOutboundMessageOptions
): Promise<OutboundSendResult> {
  const {
    clinicId,
    patientId,
    patientPhone,
    text,
    timezone,
    conversationId,
    skipBusinessHoursCheck,
  } = options;

  if (!skipBusinessHoursCheck && !isWithinBusinessHours(new Date(), timezone)) {
    return { success: false, skippedReason: "outside_business_hours" };
  }

  const allowed = await canSendToPatient(supabase, clinicId, patientId, timezone);
  if (!allowed) {
    return { success: false, skippedReason: "daily_limit_reached" };
  }

  const { data: queueRow, error: insertError } = await supabase
    .from("message_queue")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      conversation_id: conversationId,
      channel: "whatsapp",
      content: text,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !queueRow) {
    console.error("[outbound] queue insert failed:", insertError?.message);
    return { success: false, skippedReason: "queue_insert_failed" };
  }

  const result = await sendTextMessage(patientPhone, text, options.credentials);

  const newStatus = result.success ? "sent" : "failed";
  await supabase
    .from("message_queue")
    .update({ status: newStatus })
    .eq("id", queueRow.id);

  if (!result.success) {
    console.error("[outbound] send failed:", result.error);
    return { success: false, skippedReason: "send_failed" };
  }

  // Store in messages table so it appears in conversation history and internal chat
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    clinic_id: clinicId,
    content: text,
    role: "assistant",
  });

  return { success: true, messageId: result.messageId };
}

// ── Send Template Message ──

export async function sendOutboundTemplate(
  supabase: SupabaseClient,
  options: SendOutboundTemplateOptions
): Promise<OutboundSendResult> {
  const {
    clinicId,
    patientId,
    patientPhone,
    templateName,
    templateLanguage,
    templateParams,
    localBody,
    timezone,
    conversationId,
    skipBusinessHoursCheck,
  } = options;

  if (!skipBusinessHoursCheck && !isWithinBusinessHours(new Date(), timezone)) {
    return { success: false, skippedReason: "outside_business_hours" };
  }

  const allowed = await canSendToPatient(supabase, clinicId, patientId, timezone);
  if (!allowed) {
    return { success: false, skippedReason: "daily_limit_reached" };
  }

  const { data: queueRow, error: insertError } = await supabase
    .from("message_queue")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      conversation_id: conversationId,
      channel: "whatsapp",
      content: localBody,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !queueRow) {
    console.error("[outbound] queue insert failed:", insertError?.message);
    return { success: false, skippedReason: "queue_insert_failed" };
  }

  const result = await sendTemplateMessage(
    patientPhone,
    templateName,
    templateLanguage,
    templateParams,
    options.credentials
  );

  const newStatus = result.success ? "sent" : "failed";
  await supabase
    .from("message_queue")
    .update({ status: newStatus })
    .eq("id", queueRow.id);

  if (!result.success) {
    console.error("[outbound] template send failed:", result.error);
    return { success: false, skippedReason: "send_failed" };
  }

  // Store in messages table so it appears in conversation history and internal chat
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    clinic_id: clinicId,
    content: localBody,
    role: "assistant",
  });

  return { success: true, messageId: result.messageId };
}

// ── Helpers ──

function getStartOfDayInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dateStr = formatter.format(date);

  return `${dateStr}T00:00:00`;
}
