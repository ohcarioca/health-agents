import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { registerAgentType } from "../registry";
import { deleteEvent } from "@/services/google-calendar";
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";
import { createCustomer, createCharge, getPixQrCode } from "@/services/asaas";
import type {
  AgentTypeConfig,
  AgentToolOptions,
  SystemPromptParams,
  RecipientContext,
  ToolCallInput,
  ToolCallContext,
  ToolCallResult,
} from "../types";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e o assistente virtual da clinica. Neste momento, esta ajudando o paciente a confirmar uma consulta agendada.

Regras:
- Use o primeiro nome do paciente para tornar a conversa mais pessoal.
- Seja breve e direto nas mensagens.
- Quando o paciente confirmar presenca, chame a ferramenta confirm_attendance imediatamente.
- Quando o paciente quiser remarcar, chame reschedule_from_confirmation IMEDIATAMENTE. Nao pergunte data, horario ou motivo antes de chamar a ferramenta.
- Apos remarcar, informe que a consulta foi cancelada e pergunte qual data e horario o paciente prefere para a nova consulta. O paciente pode remarcar agora mesmo nesta conversa.
- Nao insista mais de 2 vezes se o paciente nao responder.
- Nunca fabrique URLs ou informacoes que voce nao obteve de uma ferramenta.
- Apos chamar uma ferramenta, SEMPRE responda ao paciente em linguagem natural e amigavel. Nunca exponha resultados internos.
- Responda sempre em portugues do Brasil.`,

  en: `You are the clinic's virtual assistant. Right now, you are helping the patient confirm a scheduled appointment.

Rules:
- Use the patient's first name to make the conversation more personal.
- Keep messages brief and direct.
- When the patient confirms attendance, call the confirm_attendance tool immediately.
- When the patient wants to reschedule, call reschedule_from_confirmation IMMEDIATELY. Do not ask for date, time, or reason before calling the tool.
- After rescheduling, inform the patient their appointment was cancelled and ask what date and time they prefer for the new one. The patient can reschedule right now in this conversation.
- Do not insist more than 2 times if the patient does not respond.
- Never fabricate URLs or information you did not obtain from a tool.
- After calling a tool, ALWAYS respond to the patient in natural, friendly language. Never expose internal results.
- Always respond in English.`,

  es: `Eres el asistente virtual de la clinica. En este momento, estas ayudando al paciente a confirmar una cita programada.

Reglas:
- Usa el primer nombre del paciente para hacer la conversacion mas personal.
- Se breve y directo en los mensajes.
- Cuando el paciente confirme asistencia, llama la herramienta confirm_attendance inmediatamente.
- Cuando el paciente quiera reprogramar, llama reschedule_from_confirmation INMEDIATAMENTE. No preguntes fecha, hora o motivo antes de llamar la herramienta.
- Despues de reprogramar, informa que la cita fue cancelada y pregunta que fecha y hora prefiere para la nueva cita. El paciente puede reprogramar ahora mismo en esta conversacion.
- No insistas mas de 2 veces si el paciente no responde.
- Nunca fabriques URLs o informacion que no obtuviste de una herramienta.
- Despues de llamar una herramienta, SIEMPRE responde al paciente en lenguaje natural y amigable. Nunca expongas resultados internos.
- Responde siempre en espanol.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Confirme consultas com pacientes, registre respostas e encaminhe remarcacoes quando necessario.",
  en: "Confirm appointments with patients, record responses, and route rescheduling requests when needed.",
  es: "Confirma citas con pacientes, registra respuestas y encamina reprogramaciones cuando sea necesario.",
};

// ── Tool Definitions (Stubs) ──
// NOTE: Tools do NOT require appointment_id from the LLM.
// The handlers resolve the active confirmation automatically via patient + clinic.

const confirmAttendanceTool = tool(
  async () => {
    return JSON.stringify({ action: "confirm_attendance" });
  },
  {
    name: "confirm_attendance",
    description:
      "Confirms that the patient will attend their upcoming appointment. Call this when the patient explicitly confirms they will come. No parameters needed.",
    schema: z.object({}),
  }
);

const rescheduleFromConfirmationTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "reschedule_from_confirmation",
      reason: input.reason,
    });
  },
  {
    name: "reschedule_from_confirmation",
    description:
      "Cancels the current appointment and routes the patient to reschedule. Call this IMMEDIATELY when the patient wants to reschedule — do not ask for details.",
    schema: z.object({
      reason: z
        .string()
        .describe("Brief reason why the patient wants to reschedule"),
    }),
  }
);

const markNoShowTool = tool(
  async () => {
    return JSON.stringify({ action: "mark_no_show" });
  },
  {
    name: "mark_no_show",
    description:
      "Marks the appointment as a no-show. Use this when the patient did not attend and did not respond to confirmation attempts. No parameters needed.",
    schema: z.object({}),
  }
);

// ── Appointment Lookup Helper ──

interface ConfirmationAppointment {
  id: string;
  startsAt: string;
  professionalId: string | null;
  professionalName: string | null;
}

/**
 * Finds the active confirmation appointment for the current patient.
 * Prioritizes the NEAREST upcoming appointment that has a "sent"
 * confirmation_queue entry, rather than the most recently created entry.
 */
async function findActiveConfirmationAppointment(
  context: ToolCallContext
): Promise<ConfirmationAppointment | null> {
  // Find scheduled appointments for this patient, nearest first
  const { data: appointments } = await context.supabase
    .from("appointments")
    .select("id, starts_at, professional_id")
    .eq("patient_id", context.recipientId)
    .eq("clinic_id", context.clinicId)
    .in("status", ["scheduled", "confirmed"])
    .order("starts_at", { ascending: true });

  if (!appointments || appointments.length === 0) return null;

  // Find which appointments have sent confirmations
  const { data: queueEntries } = await context.supabase
    .from("confirmation_queue")
    .select("appointment_id")
    .in(
      "appointment_id",
      appointments.map((a) => a.id)
    )
    .eq("status", "sent");

  const sentIds = new Set(
    (queueEntries ?? []).map((e) => e.appointment_id as string)
  );

  // Pick the nearest appointment with a sent confirmation, fallback to nearest overall
  const target = appointments.find((a) => sentIds.has(a.id)) ?? appointments[0];

  // Fetch professional name
  let professionalName: string | null = null;
  if (target.professional_id) {
    const { data: prof } = await context.supabase
      .from("professionals")
      .select("name")
      .eq("id", target.professional_id)
      .single();
    professionalName = prof?.name ?? null;
  }

  return {
    id: target.id,
    startsAt: target.starts_at as string,
    professionalId: target.professional_id as string | null,
    professionalName,
  };
}

// ── Tool Handlers ──

async function handleConfirmAttendance(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const target = await findActiveConfirmationAppointment(context);

    if (!target) {
      return { result: "No pending appointment found for this patient." };
    }

    const { data: appointment, error: appointmentError } = await context.supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", target.id)
      .select("id")
      .single();

    if (appointmentError) {
      return {
        result: `Failed to confirm appointment: ${appointmentError.message}`,
      };
    }

    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "confirmed" })
      .eq("appointment_id", target.id)
      .eq("status", "sent");

    // Format appointment details for the LLM result
    const { data: clinic } = await context.supabase
      .from("clinics")
      .select("timezone")
      .eq("id", context.clinicId)
      .single();
    const tz = (clinic?.timezone as string) ?? "America/Sao_Paulo";
    const dt = new Date(target.startsAt);
    const dateStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(dt);
    const timeStr = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
    const profStr = target.professionalName
      ? ` com ${target.professionalName}`
      : "";

    // --- Payment reminder if auto-billing enabled ---
    let paymentAppendix = "";
    const autoBilling = await isAutoBillingEnabled(context.supabase, context.clinicId);

    if (autoBilling && appointment) {
      const { data: invoice } = await context.supabase
        .from("invoices")
        .select("id, amount_cents, due_date, status")
        .eq("appointment_id", appointment.id)
        .in("status", ["pending", "overdue"])
        .single();

      if (invoice) {
        const { data: existingLink } = await context.supabase
          .from("payment_links")
          .select("url, pix_payload")
          .eq("invoice_id", invoice.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const amountFormatted = `R$ ${(invoice.amount_cents / 100).toFixed(2).replace(".", ",")}`;

        if (existingLink?.url) {
          paymentAppendix = `\n\n⚠️ Pagamento pendente: ${amountFormatted}\n🔗 Link: ${existingLink.url}`;
          if (existingLink.pix_payload) {
            paymentAppendix += `\n\nPix copia e cola:\n${existingLink.pix_payload}`;
          }
        } else {
          // Try to create payment link if none exists
          try {
            const { data: patient } = await context.supabase
              .from("patients")
              .select("id, name, phone, email, cpf, asaas_customer_id")
              .eq("id", context.recipientId)
              .single();

            if (patient?.cpf) {
              let customerId = patient.asaas_customer_id as string | null;
              if (!customerId) {
                const customerResult = await createCustomer({
                  name: patient.name,
                  cpfCnpj: patient.cpf as string,
                  phone: patient.phone ?? undefined,
                  email: patient.email ?? undefined,
                  externalReference: patient.id,
                });
                if (customerResult.success && customerResult.customerId) {
                  customerId = customerResult.customerId;
                  await context.supabase
                    .from("patients")
                    .update({ asaas_customer_id: customerId })
                    .eq("id", patient.id);
                }
              }

              if (customerId) {
                const chargeResult = await createCharge({
                  customerId,
                  billingType: "UNDEFINED",
                  valueCents: invoice.amount_cents,
                  dueDate: invoice.due_date,
                  description: `Consulta - ${invoice.due_date}`,
                  externalReference: invoice.id,
                });

                if (chargeResult.success && chargeResult.chargeId) {
                  const paymentUrl = chargeResult.invoiceUrl ?? "";
                  let pixPayload: string | undefined;

                  try {
                    const pixResult = await getPixQrCode(chargeResult.chargeId);
                    if (pixResult.success && pixResult.payload) {
                      pixPayload = pixResult.payload;
                    }
                  } catch { /* optional — Pix QR code is best-effort */ }

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

                  paymentAppendix = `\n\n⚠️ Pagamento pendente: ${amountFormatted}\n🔗 Link: ${paymentUrl}`;
                  if (pixPayload) {
                    paymentAppendix += `\n\nPix copia e cola:\n${pixPayload}`;
                  }
                }
              }
            }
          } catch (err) {
            console.error("[confirmation] Payment link creation error (non-fatal):", err);
          }
        }
      }
    }

    return {
      result: `Appointment confirmed: ${dateStr} as ${timeStr}${profStr}. Use EXACTLY these details when informing the patient.`,
      appendToResponse: paymentAppendix || undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error confirming appointment: ${message}` };
  }
}

async function handleRescheduleFromConfirmation(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  try {
    const target = await findActiveConfirmationAppointment(context);

    if (!target) {
      return { result: "No pending appointment found for this patient." };
    }

    // Fetch appointment details for Google Calendar sync
    const { data: appointment } = await context.supabase
      .from("appointments")
      .select("id, professional_id, google_event_id")
      .eq("id", target.id)
      .single();

    // Cancel the current appointment
    await context.supabase
      .from("appointments")
      .update({ status: "cancelled", cancellation_reason: reason })
      .eq("id", target.id);

    // Mark confirmation queue entries as responded
    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "rescheduled" })
      .eq("appointment_id", target.id)
      .eq("status", "sent");

    // Delete Google Calendar event if it exists
    if (appointment?.google_event_id && appointment?.professional_id) {
      try {
        const { data: professional } = await context.supabase
          .from("professionals")
          .select("google_calendar_id, google_refresh_token")
          .eq("id", appointment.professional_id)
          .single();

        if (
          professional?.google_refresh_token &&
          professional?.google_calendar_id
        ) {
          await deleteEvent(
            professional.google_refresh_token as string,
            professional.google_calendar_id as string,
            appointment.google_event_id as string
          );
        }
      } catch (calendarError) {
        console.error(
          "[confirmation] Google Calendar delete failed:",
          calendarError
        );
      }
    }

    // Cancel linked invoice (new one will be created on rebooking if auto_billing enabled)
    const { data: linkedInvoice } = await context.supabase
      .from("invoices")
      .select("id, status")
      .eq("appointment_id", target.id)
      .in("status", ["pending", "overdue"])
      .single();

    if (linkedInvoice) {
      await context.supabase
        .from("invoices")
        .update({ status: "cancelled" })
        .eq("id", linkedInvoice.id);

      await context.supabase
        .from("payment_links")
        .update({ status: "expired" })
        .eq("invoice_id", linkedInvoice.id)
        .eq("status", "active");
    }

    return {
      result: `Appointment cancelled successfully. Tell the patient their appointment was cancelled and ask "Qual data e horario voce prefere para a nova consulta?" so they can reschedule right away.`,
      responseData: {
        routedTo: "scheduling",
        routeContext: reason,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error processing reschedule: ${message}` };
  }
}

async function handleMarkNoShow(
  _args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  try {
    const target = await findActiveConfirmationAppointment(context);

    if (!target) {
      return { result: "No pending appointment found for this patient." };
    }

    const { error } = await context.supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", target.id);

    if (error) {
      return {
        result: `Failed to mark appointment as no-show: ${error.message}`,
      };
    }

    await context.supabase
      .from("confirmation_queue")
      .update({ status: "responded", response: "no_show" })
      .eq("appointment_id", target.id)
      .eq("status", "sent");

    return { result: "Appointment marked as no-show." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error marking no-show: ${message}` };
  }
}

// ── Agent Config ──

const confirmationConfig: AgentTypeConfig = {
  type: "confirmation",

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
    return [confirmAttendanceTool, rescheduleFromConfirmationTool, markNoShowTool];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "confirm_attendance":
        return handleConfirmAttendance(toolCall.args, context);
      case "reschedule_from_confirmation":
        return handleRescheduleFromConfirmation(toolCall.args, context);
      case "mark_no_show":
        return handleMarkNoShow(toolCall.args, context);
      default:
        console.warn(`[confirmation] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(confirmationConfig);
