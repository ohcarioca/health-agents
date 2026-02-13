import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import type {
  AgentTypeConfig,
  AgentToolOptions,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
  ToolCallResult,
} from "../types";
import { getAvailableSlots } from "@/lib/scheduling/availability";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getFreeBusy,
} from "@/services/google-calendar";
import type { ScheduleGrid } from "@/lib/validations/settings";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e um assistente de agendamento de consultas. Seu papel e ajudar pacientes a agendar, remarcar ou cancelar consultas.

Regras:
- Use o primeiro nome do paciente na conversa.
- Para agendar: primeiro pergunte qual profissional e qual tipo de consulta. Depois use check_availability para ver horarios disponiveis. Ofereca 2-3 opcoes. Confirme antes de criar o agendamento com book_appointment.
- Para remarcar: use list_patient_appointments para ver as consultas existentes. Depois use check_availability para novos horarios. Confirme antes de atualizar com reschedule_appointment.
- Para cancelar: use list_patient_appointments, confirme qual consulta, e use cancel_appointment com o motivo.
- NUNCA invente horarios disponiveis. Sempre use a ferramenta check_availability.
- NUNCA crie agendamentos sem confirmacao explicita do paciente.
- Se nao conseguir ajudar apos 2 tentativas, escale para um atendente humano.
- Responda sempre em portugues do Brasil.`,

  en: `You are an appointment scheduling assistant. Your role is to help patients book, reschedule, or cancel appointments.

Rules:
- Use the patient's first name in conversation.
- To book: first ask which professional and what type of service. Then use check_availability to see available times. Offer 2-3 options. Confirm before creating with book_appointment.
- To reschedule: use list_patient_appointments to see existing appointments. Then use check_availability for new times. Confirm before updating with reschedule_appointment.
- To cancel: use list_patient_appointments, confirm which appointment, and use cancel_appointment with the reason.
- NEVER fabricate available times. Always use the check_availability tool.
- NEVER create appointments without explicit patient confirmation.
- If you cannot help after 2 attempts, escalate to a human agent.
- Always respond in English.`,

  es: `Eres un asistente de agendamiento de citas. Tu rol es ayudar a los pacientes a agendar, reprogramar o cancelar citas.

Reglas:
- Usa el primer nombre del paciente en la conversacion.
- Para agendar: primero pregunta cual profesional y que tipo de consulta. Luego usa check_availability para ver horarios disponibles. Ofrece 2-3 opciones. Confirma antes de crear la cita con book_appointment.
- Para reprogramar: usa list_patient_appointments para ver las citas existentes. Luego usa check_availability para nuevos horarios. Confirma antes de actualizar con reschedule_appointment.
- Para cancelar: usa list_patient_appointments, confirma cual cita, y usa cancel_appointment con el motivo.
- NUNCA inventes horarios disponibles. Siempre usa la herramienta check_availability.
- NUNCA crees citas sin confirmacion explicita del paciente.
- Si no puedes ayudar despues de 2 intentos, escala a un agente humano.
- Responde siempre en espanol.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Ajude pacientes a agendar, remarcar ou cancelar consultas. Sempre verifique disponibilidade antes de oferecer horarios. Confirme com o paciente antes de qualquer acao.",
  en: "Help patients book, reschedule, or cancel appointments. Always check availability before offering times. Confirm with the patient before any action.",
  es: "Ayuda a los pacientes a agendar, reprogramar o cancelar citas. Siempre verifica disponibilidad antes de ofrecer horarios. Confirma con el paciente antes de cualquier accion.",
};

// ── Tool Definitions (Stubs) ──

const checkAvailabilityTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "check_availability",
      professional_id: input.professional_id,
      date: input.date,
      service_id: input.service_id,
    });
  },
  {
    name: "check_availability",
    description:
      "Checks available appointment slots for a professional on a given date. Returns a list of free time slots. ALWAYS call this before offering times to the patient.",
    schema: z.object({
      professional_id: z
        .string()
        .describe("UUID of the professional to check availability for"),
      date: z
        .string()
        .describe("Date to check in YYYY-MM-DD format"),
      service_id: z
        .string()
        .optional()
        .describe("Optional UUID of the service to book (affects slot duration)"),
    }),
  }
);

const bookAppointmentTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "book_appointment",
      professional_id: input.professional_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      service_id: input.service_id,
    });
  },
  {
    name: "book_appointment",
    description:
      "Books an appointment for the current patient. Only call this AFTER the patient has explicitly confirmed the time slot.",
    schema: z.object({
      professional_id: z
        .string()
        .describe("UUID of the professional"),
      starts_at: z
        .string()
        .describe("Start time in ISO 8601 format (e.g., 2026-02-18T12:00:00.000Z)"),
      ends_at: z
        .string()
        .describe("End time in ISO 8601 format"),
      service_id: z
        .string()
        .optional()
        .describe("Optional UUID of the service"),
    }),
  }
);

const rescheduleAppointmentTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "reschedule_appointment",
      appointment_id: input.appointment_id,
      new_starts_at: input.new_starts_at,
      new_ends_at: input.new_ends_at,
    });
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedules an existing appointment to a new time. Only call after confirming with the patient.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("UUID of the existing appointment to reschedule"),
      new_starts_at: z
        .string()
        .describe("New start time in ISO 8601 format"),
      new_ends_at: z
        .string()
        .describe("New end time in ISO 8601 format"),
    }),
  }
);

const cancelAppointmentTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "cancel_appointment",
      appointment_id: input.appointment_id,
      reason: input.reason,
    });
  },
  {
    name: "cancel_appointment",
    description:
      "Cancels an existing appointment. Always confirm with the patient before cancelling.",
    schema: z.object({
      appointment_id: z
        .string()
        .describe("UUID of the appointment to cancel"),
      reason: z
        .string()
        .describe("Brief reason for cancellation"),
    }),
  }
);

const listPatientAppointmentsTool = tool(
  async () => {
    return JSON.stringify({ action: "list_patient_appointments" });
  },
  {
    name: "list_patient_appointments",
    description:
      "Lists the current patient's upcoming appointments. Use this when the patient wants to reschedule, cancel, or check their appointments.",
    schema: z.object({}),
  }
);

const escalateToHumanTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "escalate_to_human",
      reason: input.reason,
    });
  },
  {
    name: "escalate_to_human",
    description:
      "Escalates the conversation to a human agent. Use when you cannot resolve the patient's issue after 2 attempts.",
    schema: z.object({
      reason: z
        .string()
        .describe("Brief reason for escalation to a human agent"),
    }),
  }
);

// ── Tool Handlers ──

async function handleCheckAvailability(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const professionalId =
      typeof args.professional_id === "string" ? args.professional_id : "";
    const date = typeof args.date === "string" ? args.date : "";
    const serviceId =
      typeof args.service_id === "string" ? args.service_id : undefined;

    if (!professionalId || !date) {
      return { result: "Error: professional_id and date are required." };
    }

    // Load professional
    const { data: professional, error: profError } = await context.supabase
      .from("professionals")
      .select(
        "schedule_grid, appointment_duration_minutes, google_calendar_id, google_refresh_token"
      )
      .eq("id", professionalId)
      .single();

    if (profError || !professional) {
      return { result: "Error: Professional not found." };
    }

    // Determine duration: service override or professional default
    let durationMinutes = professional.appointment_duration_minutes as number;

    if (serviceId) {
      const { data: service } = await context.supabase
        .from("services")
        .select("duration_minutes")
        .eq("id", serviceId)
        .single();

      if (service?.duration_minutes) {
        durationMinutes = service.duration_minutes as number;
      }
    }

    // Load existing appointments for the professional on that date
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    const { data: appointments } = await context.supabase
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("professional_id", professionalId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd);

    // Load clinic timezone
    const { data: clinic } = await context.supabase
      .from("clinics")
      .select("timezone")
      .eq("id", context.clinicId)
      .single();

    const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

    // Optionally fetch Google Calendar free/busy
    let busyBlocks: Array<{ start: string; end: string }> | undefined;

    if (professional.google_refresh_token && professional.google_calendar_id) {
      const freeBusyResult = await getFreeBusy(
        professional.google_refresh_token as string,
        professional.google_calendar_id as string,
        dayStart,
        dayEnd
      );

      if (freeBusyResult.success && freeBusyResult.busyBlocks) {
        busyBlocks = freeBusyResult.busyBlocks;
      }
    }

    const scheduleGrid = professional.schedule_grid as ScheduleGrid;
    const existingAppointments = (appointments ?? []).map((a) => ({
      starts_at: a.starts_at as string,
      ends_at: a.ends_at as string,
    }));

    const slots = getAvailableSlots(
      date,
      scheduleGrid,
      durationMinutes,
      existingAppointments,
      timezone,
      busyBlocks
    );

    if (slots.length === 0) {
      return { result: "No available slots for this date." };
    }

    // Build a machine-readable list so the LLM can pass starts_at/ends_at
    // directly to book_appointment without guessing.
    const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const slotLines = slots.map((s, i) => {
      const localTime = timeFormatter.format(new Date(s.start));
      return `${i + 1}. ${localTime} — starts_at: ${s.start}, ends_at: ${s.end}`;
    });

    return {
      result: `Available slots on ${date} (${slots.length} found, ${durationMinutes} min each):\n${slotLines.join("\n")}\n\nUse the exact starts_at and ends_at values when calling book_appointment.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error checking availability: ${message}` };
  }
}

async function handleBookAppointment(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const professionalId =
      typeof args.professional_id === "string" ? args.professional_id : "";
    const startsAt =
      typeof args.starts_at === "string" ? args.starts_at : "";
    const endsAt =
      typeof args.ends_at === "string" ? args.ends_at : "";
    const serviceId =
      typeof args.service_id === "string" ? args.service_id : undefined;

    if (!professionalId || !startsAt || !endsAt) {
      return {
        result: "Error: professional_id, starts_at, and ends_at are required.",
      };
    }

    const patientId = context.recipientId;

    // Check for time conflicts
    const { data: conflicts } = await context.supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", professionalId)
      .in("status", ["scheduled", "confirmed"])
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return { result: "Error: This time slot is already booked. Please choose a different time." };
    }

    // Insert appointment
    const { data: appointment, error: insertError } = await context.supabase
      .from("appointments")
      .insert({
        clinic_id: context.clinicId,
        professional_id: professionalId,
        patient_id: patientId,
        starts_at: startsAt,
        ends_at: endsAt,
        service_id: serviceId ?? null,
        status: "scheduled",
      })
      .select()
      .single();

    if (insertError || !appointment) {
      return {
        result: `Error creating appointment: ${insertError?.message ?? "Unknown error"}`,
      };
    }

    // Sync to Google Calendar if professional has tokens
    try {
      const { data: professional } = await context.supabase
        .from("professionals")
        .select("name, google_calendar_id, google_refresh_token")
        .eq("id", professionalId)
        .single();

      if (
        professional?.google_refresh_token &&
        professional?.google_calendar_id
      ) {
        const { data: patient } = await context.supabase
          .from("patients")
          .select("name")
          .eq("id", patientId)
          .single();

        const { data: clinic } = await context.supabase
          .from("clinics")
          .select("name, timezone")
          .eq("id", context.clinicId)
          .single();

        const patientName = (patient?.name as string) ?? "Patient";
        const clinicName = (clinic?.name as string) ?? "Clinic";
        const timezone = (clinic?.timezone as string) || "America/Sao_Paulo";

        const eventResult = await createEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          {
            summary: `${patientName} — ${clinicName}`,
            startTime: startsAt,
            endTime: endsAt,
            timezone,
          }
        );

        if (eventResult.success && eventResult.eventId) {
          await context.supabase
            .from("appointments")
            .update({ google_event_id: eventResult.eventId })
            .eq("id", appointment.id);
        }
      }

      // Get professional name for confirmation
      const professionalName =
        (professional?.name as string) ?? "the professional";

      const dateFormatted = new Date(startsAt).toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const timeFormatted = new Date(startsAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      return {
        result: `Appointment booked with ${professionalName} on ${dateFormatted} at ${timeFormatted}.`,
      };
    } catch (calendarError) {
      // Calendar sync failed but appointment was created
      console.error(
        "[scheduling] Google Calendar sync failed:",
        calendarError
      );
      return {
        result: "Appointment booked successfully. (Calendar sync skipped.)",
      };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error booking appointment: ${message}` };
  }
}

async function handleRescheduleAppointment(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const appointmentId =
      typeof args.appointment_id === "string" ? args.appointment_id : "";
    const newStartsAt =
      typeof args.new_starts_at === "string" ? args.new_starts_at : "";
    const newEndsAt =
      typeof args.new_ends_at === "string" ? args.new_ends_at : "";

    if (!appointmentId || !newStartsAt || !newEndsAt) {
      return {
        result:
          "Error: appointment_id, new_starts_at, and new_ends_at are required.",
      };
    }

    // Verify appointment belongs to the patient
    const { data: existing, error: fetchError } = await context.supabase
      .from("appointments")
      .select(
        "id, patient_id, professional_id, google_event_id, clinic_id"
      )
      .eq("id", appointmentId)
      .eq("patient_id", context.recipientId)
      .single();

    if (fetchError || !existing) {
      return { result: "Error: Appointment not found or does not belong to this patient." };
    }

    // Check for conflicts at new time
    const { data: conflicts } = await context.supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", existing.professional_id)
      .in("status", ["scheduled", "confirmed"])
      .neq("id", appointmentId)
      .lt("starts_at", newEndsAt)
      .gt("ends_at", newStartsAt)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return {
        result:
          "Error: The new time slot is already booked. Please choose a different time.",
      };
    }

    // Update appointment times
    const { error: updateError } = await context.supabase
      .from("appointments")
      .update({ starts_at: newStartsAt, ends_at: newEndsAt })
      .eq("id", appointmentId);

    if (updateError) {
      return {
        result: `Error rescheduling appointment: ${updateError.message}`,
      };
    }

    // Sync to Google Calendar if event exists
    if (existing.google_event_id && existing.professional_id) {
      try {
        const { data: professional } = await context.supabase
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", existing.professional_id)
          .single();

        if (
          professional?.google_refresh_token &&
          professional?.google_calendar_id
        ) {
          const { data: clinic } = await context.supabase
            .from("clinics")
            .select("timezone")
            .eq("id", context.clinicId)
            .single();

          const timezone =
            (clinic?.timezone as string) || "America/Sao_Paulo";

          await updateEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            existing.google_event_id as string,
            {
              startTime: newStartsAt,
              endTime: newEndsAt,
              timezone,
            }
          );
        }
      } catch (calendarError) {
        console.error(
          "[scheduling] Google Calendar update failed:",
          calendarError
        );
      }
    }

    const dateFormatted = new Date(newStartsAt).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const timeFormatted = new Date(newStartsAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return {
      result: `Appointment rescheduled to ${dateFormatted} at ${timeFormatted}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error rescheduling appointment: ${message}` };
  }
}

async function handleCancelAppointment(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const appointmentId =
      typeof args.appointment_id === "string" ? args.appointment_id : "";
    const reason =
      typeof args.reason === "string" ? args.reason : "No reason provided";

    if (!appointmentId) {
      return { result: "Error: appointment_id is required." };
    }

    // Verify appointment belongs to the patient
    const { data: existing, error: fetchError } = await context.supabase
      .from("appointments")
      .select("id, patient_id, professional_id, google_event_id")
      .eq("id", appointmentId)
      .eq("patient_id", context.recipientId)
      .single();

    if (fetchError || !existing) {
      return {
        result:
          "Error: Appointment not found or does not belong to this patient.",
      };
    }

    // Set status to cancelled with reason
    const { error: cancelError } = await context.supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: reason })
      .eq("id", appointmentId);

    if (cancelError) {
      return {
        result: `Error cancelling appointment: ${cancelError.message}`,
      };
    }

    // Delete Google Calendar event if exists
    if (existing.google_event_id && existing.professional_id) {
      try {
        const { data: professional } = await context.supabase
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", existing.professional_id)
          .single();

        if (
          professional?.google_refresh_token &&
          professional?.google_calendar_id
        ) {
          await deleteEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            existing.google_event_id as string
          );
        }
      } catch (calendarError) {
        console.error(
          "[scheduling] Google Calendar delete failed:",
          calendarError
        );
      }
    }

    return {
      result: `Appointment cancelled successfully. Reason: ${reason}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error cancelling appointment: ${message}` };
  }
}

async function handleListPatientAppointments(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const now = new Date().toISOString();

    const { data: appointments, error } = await context.supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, professional_id, service_id"
      )
      .eq("patient_id", context.recipientId)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", now)
      .order("starts_at", { ascending: true });

    if (error) {
      return {
        result: `Error listing appointments: ${error.message}`,
      };
    }

    if (!appointments || appointments.length === 0) {
      return { result: "No upcoming appointments found." };
    }

    // Fetch professional and service names
    const professionalIds = [
      ...new Set(
        appointments
          .map((a) => a.professional_id as string)
          .filter(Boolean)
      ),
    ];
    const serviceIds = [
      ...new Set(
        appointments
          .map((a) => a.service_id as string | null)
          .filter((id): id is string => id !== null)
      ),
    ];

    const { data: professionals } = await context.supabase
      .from("professionals")
      .select("id, name")
      .in("id", professionalIds);

    const professionalMap = new Map(
      (professionals ?? []).map((p) => [p.id as string, p.name as string])
    );

    let serviceMap = new Map<string, string>();
    if (serviceIds.length > 0) {
      const { data: services } = await context.supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);

      serviceMap = new Map(
        (services ?? []).map((s) => [s.id as string, s.name as string])
      );
    }

    const lines = appointments.map((appt, index) => {
      const professionalName =
        professionalMap.get(appt.professional_id as string) ?? "Unknown";
      const serviceName = appt.service_id
        ? serviceMap.get(appt.service_id as string) ?? ""
        : "";

      const dateFormatted = new Date(
        appt.starts_at as string
      ).toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const timeFormatted = new Date(
        appt.starts_at as string
      ).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const serviceLabel = serviceName ? ` (${serviceName})` : "";
      return `${index + 1}. ${dateFormatted} at ${timeFormatted} — ${professionalName}${serviceLabel} [ID: ${appt.id}]`;
    });

    return {
      result: `Upcoming appointments (${appointments.length}):\n${lines.join("\n")}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error listing appointments: ${message}` };
  }
}

async function handleEscalateToHuman(
  args: Record<string, unknown>,
  _context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  return {
    result: `Conversation escalated to a human agent. Reason: ${reason}`,
    newConversationStatus: "escalated",
  };
}

// ── Agent Config ──

const schedulingConfig: AgentTypeConfig = {
  type: "scheduling",

  buildSystemPrompt(
    params: SystemPromptParams,
    _recipient?: RecipientContext
  ): string {
    // Only return the base prompt (step 1 of the 8-step assembly).
    // Steps 2-8 (name, description, instructions, tools, business/recipient context)
    // are handled by context-builder.ts — do NOT duplicate them here.
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools(_options: AgentToolOptions) {
    return [
      checkAvailabilityTool,
      bookAppointmentTool,
      rescheduleAppointmentTool,
      cancelAppointmentTool,
      listPatientAppointmentsTool,
      escalateToHumanTool,
    ];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "check_availability":
        return handleCheckAvailability(toolCall.args, context);
      case "book_appointment":
        return handleBookAppointment(toolCall.args, context);
      case "reschedule_appointment":
        return handleRescheduleAppointment(toolCall.args, context);
      case "cancel_appointment":
        return handleCancelAppointment(toolCall.args, context);
      case "list_patient_appointments":
        return handleListPatientAppointments(toolCall.args, context);
      case "escalate_to_human":
        return handleEscalateToHuman(toolCall.args, context);
      default:
        console.warn(`[scheduling] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(schedulingConfig);
