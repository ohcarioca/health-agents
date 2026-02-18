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
import { enqueueConfirmations } from "@/lib/scheduling/enqueue-confirmations";
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getFreeBusy,
} from "@/services/google-calendar";
import { createCustomer, createCharge, getPixQrCode } from "@/services/asaas";
import type { ScheduleGrid } from "@/lib/validations/settings";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e o assistente virtual da clinica. Neste momento, esta ajudando o paciente com agendamento de consultas.

Regras gerais:
- Use o primeiro nome do paciente.
- Responda sempre em portugues do Brasil.
- Seja breve e direto. Nao repita informacoes que o paciente ja deu.
- Se nao conseguir ajudar apos 2 tentativas, use escalate_to_human.

Fluxo para AGENDAR:
1. Identifique o profissional (se a clinica so tem um, use-o automaticamente).
2. Se o paciente NAO informou uma data, use o proximo dia util a partir de hoje e chame check_availability IMEDIATAMENTE. Nao pergunte a data — seja proativo.
3. Chame check_availability com o professional_id e a data. O resultado contem starts_at e ends_at exatos.
4. Ofereca 2-3 opcoes de horario ao paciente.
5. Quando o paciente escolher um horario (ou pedir "o primeiro disponivel"), chame book_appointment IMEDIATAMENTE com os valores starts_at e ends_at do resultado de check_availability. Nao peca mais informacoes — o tipo de consulta e OPCIONAL.
6. Se o paciente escolheu um horario em uma mensagem anterior mas voce nao tem mais os timestamps exatos, faca TUDO NO MESMO TURNO: chame check_availability para a mesma data, encontre o slot que corresponde ao horario escolhido pelo paciente, e chame book_appointment logo em seguida. NAO apresente as opcoes novamente — o paciente ja escolheu.
7. Se o paciente pedir "o primeiro horario disponivel", chame check_availability e em seguida chame book_appointment com o PRIMEIRO slot retornado, tudo no MESMO turno. Nao apresente opcoes — o paciente ja decidiu.

IMPORTANTE:
- NUNCA invente horarios. Sempre use check_availability.
- Quando o paciente confirma um horario, sua proxima acao DEVE ser chamar book_appointment. Nao faca mais perguntas.
- O campo service_id e opcional. Nao insista em saber o tipo de consulta para agendar.
- Se o paciente ja informou profissional, data E horario, chame check_availability e book_appointment no mesmo turno sem perguntar nada.
- Seja PROATIVO: se o paciente quer agendar e voce ja sabe com qual profissional, chame check_availability sem pedir a data.`,

  en: `You are the clinic's virtual assistant. Right now, you are helping the patient with appointment scheduling.

General rules:
- Use the patient's first name.
- Always respond in English.
- Be brief and direct. Do not re-ask for information the patient already provided.
- If you cannot help after 2 attempts, use escalate_to_human.

Flow to BOOK:
1. Identify the professional (if the clinic has only one, use them automatically).
2. If the patient did NOT specify a date, use the next business day from today and call check_availability IMMEDIATELY. Do not ask for the date — be proactive.
3. Call check_availability with professional_id and date. The result contains exact starts_at and ends_at values.
4. Offer 2-3 time options to the patient.
5. When the patient chooses a time (or asks for "the first available"), call book_appointment IMMEDIATELY with the starts_at and ends_at values from check_availability. Do not ask for more info — service type is OPTIONAL.
6. If the patient chose a time in a previous message but you no longer have the exact timestamps, do EVERYTHING IN THE SAME TURN: call check_availability for the same date, find the slot matching the patient's choice, and call book_appointment right after. Do NOT present options again — the patient already chose.
7. If the patient asks for "the first available slot", call check_availability then call book_appointment with the FIRST slot returned, all in the SAME turn. Do not present options — the patient already decided.

IMPORTANT:
- NEVER fabricate times. Always use check_availability.
- When the patient confirms a time, your next action MUST be calling book_appointment. Do not ask more questions.
- The service_id field is optional. Do not insist on knowing the service type to book.
- If the patient already provided professional, date AND time, call check_availability and book_appointment in the same turn without asking anything.
- Be PROACTIVE: if the patient wants to book and you already know which professional, call check_availability without asking for the date.`,

  es: `Eres el asistente virtual de la clinica. En este momento, estas ayudando al paciente con el agendamiento de citas.

Reglas generales:
- Usa el primer nombre del paciente.
- Responde siempre en espanol.
- Se breve y directo. No vuelvas a pedir informacion que el paciente ya dio.
- Si no puedes ayudar despues de 2 intentos, usa escalate_to_human.

Flujo para AGENDAR:
1. Identifica al profesional (si la clinica solo tiene uno, usalo automaticamente).
2. Si el paciente NO especifico una fecha, usa el proximo dia habil a partir de hoy y llama check_availability INMEDIATAMENTE. No preguntes la fecha — se proactivo.
3. Llama check_availability con professional_id y fecha. El resultado contiene valores exactos starts_at y ends_at.
4. Ofrece 2-3 opciones de horario al paciente.
5. Cuando el paciente elija un horario (o pida "el primero disponible"), llama book_appointment INMEDIATAMENTE con los valores starts_at y ends_at de check_availability. No pidas mas informacion — el tipo de servicio es OPCIONAL.
6. Si el paciente eligio un horario en un mensaje anterior pero ya no tienes los timestamps exactos, haz TODO EN EL MISMO TURNO: llama check_availability para la misma fecha, encuentra el slot que corresponde al horario elegido, y llama book_appointment enseguida. NO presentes opciones de nuevo — el paciente ya eligio.
7. Si el paciente pide "el primer horario disponible", llama check_availability y luego book_appointment con el PRIMER slot retornado, todo en el MISMO turno. No presentes opciones — el paciente ya decidio.

IMPORTANTE:
- NUNCA inventes horarios. Siempre usa check_availability.
- Cuando el paciente confirma un horario, tu siguiente accion DEBE ser llamar book_appointment. No hagas mas preguntas.
- El campo service_id es opcional. No insistas en saber el tipo de servicio para agendar.
- Si el paciente ya proporciono profesional, fecha Y hora, llama check_availability y book_appointment en el mismo turno sin preguntar nada.
- Se PROACTIVO: si el paciente quiere agendar y ya sabes con que profesional, llama check_availability sin preguntar la fecha.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Ajude pacientes a agendar, remarcar ou cancelar consultas. Use check_availability antes de oferecer horarios. Quando o paciente escolher um horario, chame book_appointment imediatamente.",
  en: "Help patients book, reschedule, or cancel appointments. Use check_availability before offering times. When the patient picks a time, call book_appointment immediately.",
  es: "Ayuda a los pacientes a agendar, reprogramar o cancelar citas. Usa check_availability antes de ofrecer horarios. Cuando el paciente elija un horario, llama book_appointment inmediatamente.",
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
      "Checks available appointment slots for a professional on a given date. Returns a list of free time slots. ALWAYS call this IMMEDIATELY when the patient wants to book — use the next business day if no date was specified. Do not ask the patient for the date first.",
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

const savePatientBillingInfoTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "save_patient_billing_info",
      cpf: input.cpf,
      email: input.email,
    });
  },
  {
    name: "save_patient_billing_info",
    description:
      "Saves the patient's CPF and/or email for billing purposes. Call this BEFORE book_appointment when the patient is missing CPF or email and auto-billing is enabled.",
    schema: z.object({
      cpf: z
        .string()
        .optional()
        .describe("Patient's CPF (11 digits, numbers only). Only include if the patient provided it."),
      email: z
        .string()
        .optional()
        .describe("Patient's email address. Only include if the patient provided it."),
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

    // Enqueue confirmation reminders
    try {
      await enqueueConfirmations(context.supabase, {
        clinicId: context.clinicId,
        appointmentId: appointment.id as string,
        startsAt,
      });
    } catch (enqueueError) {
      console.error("[scheduling] failed to enqueue confirmations:", enqueueError);
    }

    // --- Auto-billing: create invoice + payment link ---
    let billingAppendix = "";
    const autoBilling = await isAutoBillingEnabled(context.supabase, context.clinicId);

    if (autoBilling && appointment) {
      try {
        // 1. Get price from professional_services (fallback to service base price)
        let priceCents = 0;
        if (serviceId) {
          const { data: profService } = await context.supabase
            .from("professional_services")
            .select("price_cents")
            .eq("professional_id", professionalId)
            .eq("service_id", serviceId)
            .single();

          if (profService?.price_cents) {
            priceCents = profService.price_cents as number;
          } else {
            const { data: service } = await context.supabase
              .from("services")
              .select("base_price_cents")
              .eq("id", serviceId)
              .single();
            priceCents = (service?.base_price_cents as number) ?? 0;
          }
        }

        if (priceCents > 0) {
          // 2. Create invoice
          const dueDate = startsAt.split("T")[0]; // YYYY-MM-DD
          const { data: invoice, error: invError } = await context.supabase
            .from("invoices")
            .insert({
              clinic_id: context.clinicId,
              patient_id: context.recipientId,
              appointment_id: appointment.id,
              amount_cents: priceCents,
              due_date: dueDate,
              status: "pending",
            })
            .select("id")
            .single();

          if (invError || !invoice) {
            console.error("[scheduling] Failed to create auto-invoice:", invError);
          } else {
            // 3. Try to create payment link
            const { data: billingPatient } = await context.supabase
              .from("patients")
              .select("id, name, phone, email, cpf, asaas_customer_id")
              .eq("id", context.recipientId)
              .single();

            if (billingPatient?.cpf) {
              let customerId = billingPatient.asaas_customer_id as string | null;
              if (!customerId) {
                const customerResult = await createCustomer({
                  name: billingPatient.name as string,
                  cpfCnpj: billingPatient.cpf as string,
                  phone: (billingPatient.phone as string) ?? undefined,
                  email: (billingPatient.email as string) ?? undefined,
                  externalReference: billingPatient.id as string,
                });
                if (customerResult.success && customerResult.customerId) {
                  customerId = customerResult.customerId;
                  await context.supabase
                    .from("patients")
                    .update({ asaas_customer_id: customerId })
                    .eq("id", billingPatient.id);
                }
              }

              if (customerId) {
                const chargeResult = await createCharge({
                  customerId,
                  billingType: "UNDEFINED",
                  valueCents: priceCents,
                  dueDate,
                  description: `Consulta - ${dueDate}`,
                  externalReference: invoice.id as string,
                });

                if (chargeResult.success && chargeResult.chargeId) {
                  const paymentUrl = chargeResult.invoiceUrl ?? "";
                  let pixPayload: string | undefined;

                  try {
                    const pixResult = await getPixQrCode(chargeResult.chargeId);
                    if (pixResult.success && pixResult.payload) {
                      pixPayload = pixResult.payload;
                    }
                  } catch {
                    // PIX QR is optional
                  }

                  await context.supabase.from("payment_links").insert({
                    clinic_id: context.clinicId,
                    invoice_id: invoice.id,
                    asaas_payment_id: chargeResult.chargeId,
                    url: paymentUrl,
                    invoice_url: chargeResult.invoiceUrl ?? null,
                    method: "link",
                    status: "active",
                    pix_payload: pixPayload ?? null,
                  });

                  const amountFormatted = `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;
                  billingAppendix = `\n\n💳 Pagamento: ${amountFormatted}\n🔗 Link: ${paymentUrl}`;
                  if (pixPayload) {
                    billingAppendix += `\n\nPix copia e cola:\n${pixPayload}`;
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[scheduling] Auto-billing error (non-fatal):", err);
      }
    }

    // Load clinic timezone for formatting and calendar sync
    const { data: bookClinic } = await context.supabase
      .from("clinics")
      .select("name, timezone")
      .eq("id", context.clinicId)
      .single();

    const bookTimezone =
      (bookClinic?.timezone as string) || "America/Sao_Paulo";

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
        const { data: calPatient } = await context.supabase
          .from("patients")
          .select("name")
          .eq("id", patientId)
          .single();

        const patientName = (calPatient?.name as string) ?? "Patient";
        const clinicName = (bookClinic?.name as string) ?? "Clinic";

        const eventResult = await createEvent(
          professional.google_refresh_token as string,
          professional.google_calendar_id as string,
          {
            summary: `${patientName} — ${clinicName}`,
            startTime: startsAt,
            endTime: endsAt,
            timezone: bookTimezone,
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
        timeZone: bookTimezone,
      });
      const timeFormatted = new Date(startsAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: bookTimezone,
      });

      return {
        result: `Appointment booked with ${professionalName} on ${dateFormatted} at ${timeFormatted}.`,
        appendToResponse: billingAppendix || undefined,
      };
    } catch (calendarError) {
      // Calendar sync failed but appointment was created
      console.error(
        "[scheduling] Google Calendar sync failed:",
        calendarError
      );
      return {
        result: "Appointment booked successfully. (Calendar sync skipped.)",
        appendToResponse: billingAppendix || undefined,
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

    // Load clinic timezone for formatting and calendar sync
    const { data: reschClinic } = await context.supabase
      .from("clinics")
      .select("timezone")
      .eq("id", context.clinicId)
      .single();

    const reschTimezone =
      (reschClinic?.timezone as string) || "America/Sao_Paulo";

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
          await updateEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            existing.google_event_id as string,
            {
              startTime: newStartsAt,
              endTime: newEndsAt,
              timezone: reschTimezone,
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
      timeZone: reschTimezone,
    });
    const timeFormatted = new Date(newStartsAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: reschTimezone,
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

    // Load clinic timezone for correct local time display
    const { data: listClinic } = await context.supabase
      .from("clinics")
      .select("timezone")
      .eq("id", context.clinicId)
      .single();

    const listTimezone =
      (listClinic?.timezone as string) || "America/Sao_Paulo";

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
        timeZone: listTimezone,
      });
      const timeFormatted = new Date(
        appt.starts_at as string
      ).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: listTimezone,
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

async function handleSavePatientBillingInfo(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const cpf = typeof args.cpf === "string" ? args.cpf.replace(/\D/g, "") : undefined;
  const email = typeof args.email === "string" ? args.email.trim() : undefined;

  if (cpf && cpf.length !== 11) {
    return { result: "Invalid CPF. Must be exactly 11 digits." };
  }

  if (!cpf && !email) {
    return { result: "No CPF or email provided. Ask the patient for at least one." };
  }

  const updates: Record<string, string> = {};
  if (cpf) updates.cpf = cpf;
  if (email) updates.email = email;

  const { error } = await context.supabase
    .from("patients")
    .update(updates)
    .eq("id", context.recipientId);

  if (error) {
    console.error("[scheduling] Failed to save billing info:", error);
    return { result: "Failed to save patient billing information. Try again." };
  }

  const saved = [cpf && "CPF", email && "email"].filter(Boolean).join(" and ");
  return { result: `Patient ${saved} saved successfully. You can now proceed with booking.` };
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
      case "save_patient_billing_info":
        return handleSavePatientBillingInfo(toolCall.args, context);
      default:
        console.warn(`[scheduling] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(schedulingConfig);
