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
import {
  createCustomer,
  createCharge,
  getChargeStatus,
  getPixQrCode,
} from "@/services/asaas";

// ── Base System Prompts ──

const BASE_PROMPTS: Record<string, string> = {
  "pt-BR": `Voce e o assistente de cobranca e pagamentos da clinica. Sua funcao e ajudar pacientes com faturas, gerar links de pagamento e acompanhar o status de pagamentos.

Regras:
- Use o primeiro nome do paciente para tornar a conversa mais pessoal.
- Responda sempre em portugues do Brasil.
- Seja educado e nunca ameacador. Adapte o tom conforme necessario (gentil, direto ou urgente).
- Use a ferramenta create_payment_link para gerar links de pagamento. Nunca fabrique URLs.
- Use a ferramenta check_payment_status para verificar o status de pagamentos.
- Use a ferramenta escalate_billing para disputas ou situacoes que precisem de atencao humana.
- Nao insista mais de 2 vezes se o paciente nao responder.
- Mostre valores sempre no formato R$ (ex: R$ 150,00).
- Apos chamar uma ferramenta, SEMPRE responda ao paciente em linguagem natural e amigavel. Nunca exponha resultados internos.`,

  en: `You are the clinic's billing and payment assistant. Your role is to help patients with invoices, generate payment links, and track payment status.

Rules:
- Use the patient's first name to make the conversation more personal.
- Always respond in English.
- Be polite and never threatening. Adapt tone as needed (gentle, direct, or urgent).
- Use the create_payment_link tool to generate payment links. Never fabricate URLs.
- Use the check_payment_status tool to verify payment status.
- Use the escalate_billing tool for disputes or situations that need human attention.
- Do not insist more than 2 times if the patient does not respond.
- Show values in the appropriate currency format.
- After calling a tool, ALWAYS respond to the patient in natural, friendly language. Never expose internal results.`,

  es: `Eres el asistente de cobros y pagos de la clinica. Tu funcion es ayudar a pacientes con facturas, generar enlaces de pago y hacer seguimiento del estado de pagos.

Reglas:
- Usa el primer nombre del paciente para hacer la conversacion mas personal.
- Responde siempre en espanol.
- Se educado y nunca amenazante. Adapta el tono segun sea necesario (gentil, directo o urgente).
- Usa la herramienta create_payment_link para generar enlaces de pago. Nunca fabriques URLs.
- Usa la herramienta check_payment_status para verificar el estado de pagos.
- Usa la herramienta escalate_billing para disputas o situaciones que necesiten atencion humana.
- No insistas mas de 2 veces si el paciente no responde.
- Muestra valores siempre en el formato adecuado de moneda.
- Despues de llamar una herramienta, SIEMPRE responde al paciente en lenguaje natural y amigable. Nunca expongas resultados internos.`,
};

// ── Instructions ──

const INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "Gerencie cobrancas e pagamentos via Pix e boleto, envie lembretes com tom adaptado e processe confirmacoes de pagamento.",
  en: "Manage billing and payments via Pix and boleto, send reminders with adapted tone, and process payment confirmations.",
  es: "Gestiona cobros y pagos via Pix y boleto, envia recordatorios con tono adaptado y procesa confirmaciones de pago.",
};

// ── Tool Definitions (Stubs) ──

const createPaymentLinkTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "create_payment_link",
      invoice_id: input.invoice_id,
      method: input.method,
    });
  },
  {
    name: "create_payment_link",
    description:
      "Generates a payment link for a specific invoice. Call this when the patient needs a link to pay via Pix or boleto.",
    schema: z.object({
      invoice_id: z
        .string()
        .describe("The ID of the invoice to generate a payment link for"),
      method: z
        .enum(["pix", "boleto"])
        .describe("The payment method: 'pix' for instant Pix payment or 'boleto' for bank slip"),
    }),
  }
);

const checkPaymentStatusTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "check_payment_status",
      invoice_id: input.invoice_id,
    });
  },
  {
    name: "check_payment_status",
    description:
      "Checks the current payment status of an invoice. Call this when the patient asks about their payment or you need to verify if a payment was received.",
    schema: z.object({
      invoice_id: z
        .string()
        .describe("The ID of the invoice to check payment status for"),
    }),
  }
);

const sendPaymentReminderTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "send_payment_reminder",
      invoice_id: input.invoice_id,
      tone: input.tone,
    });
  },
  {
    name: "send_payment_reminder",
    description:
      "Sends a payment reminder for an unpaid invoice. Adapt the tone based on urgency: 'gentle' for first contact, 'direct' for follow-ups, 'urgent' for overdue invoices.",
    schema: z.object({
      invoice_id: z
        .string()
        .describe("The ID of the invoice to send a reminder for"),
      tone: z
        .enum(["gentle", "direct", "urgent"])
        .describe("The tone for the reminder: 'gentle', 'direct', or 'urgent'"),
    }),
  }
);

const escalateBillingTool = tool(
  async (input) => {
    return JSON.stringify({
      action: "escalate_billing",
      reason: input.reason,
    });
  },
  {
    name: "escalate_billing",
    description:
      "Escalates a billing issue to a human operator. Use this for payment disputes, refund requests, or any situation requiring human judgment.",
    schema: z.object({
      reason: z
        .string()
        .describe("The reason for escalation, describing the billing issue"),
    }),
  }
);

// ── Helpers ──

/**
 * Formats a value in cents to BRL currency string.
 * Example: 15000 -> "R$ 150,00"
 */
export function formatBrl(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  return `R$ ${reais.toLocaleString("pt-BR")},${centavos.toString().padStart(2, "0")}`;
}

/**
 * Ensures the patient has an Asaas customer ID.
 * If missing, creates a customer in Asaas and saves the ID to the patients table.
 */
async function ensureAsaasCustomer(
  supabase: ToolCallContext["supabase"],
  patient: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    cpf?: string;
    asaas_customer_id?: string | null;
  }
): Promise<string | null> {
  if (patient.asaas_customer_id) {
    return patient.asaas_customer_id;
  }

  if (!patient.cpf) {
    return null;
  }

  const result = await createCustomer({
    name: patient.name,
    cpfCnpj: patient.cpf,
    phone: patient.phone,
    email: patient.email,
    externalReference: patient.id,
  });

  if (!result.success || !result.customerId) {
    console.error("[billing] Failed to create Asaas customer:", result.error);
    return null;
  }

  await supabase
    .from("patients")
    .update({ asaas_customer_id: result.customerId })
    .eq("id", patient.id);

  return result.customerId;
}

// ── Tool Handlers ──

async function handleCreatePaymentLink(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId =
    typeof args.invoice_id === "string" ? args.invoice_id : "";
  const method =
    typeof args.method === "string" ? args.method : "pix";

  try {
    // Fetch invoice with patient data
    const { data: invoice, error: invoiceError } = await context.supabase
      .from("invoices")
      .select(
        "id, amount_cents, due_date, description, clinic_id, patients!inner(id, name, phone, email, cpf, asaas_customer_id)"
      )
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return {
        result: `Invoice not found: ${invoiceError?.message ?? "no data"}`,
      };
    }

    const patient = invoice.patients as unknown as {
      id: string;
      name: string;
      phone?: string;
      email?: string;
      cpf?: string;
      asaas_customer_id?: string | null;
    };

    // Ensure customer exists in Asaas
    const customerId = await ensureAsaasCustomer(context.supabase, patient);

    if (!customerId) {
      return {
        result:
          "Could not create payment: patient CPF is required to generate a payment link.",
      };
    }

    // Create charge in Asaas
    const billingType = method === "pix" ? "PIX" : "BOLETO";
    const chargeResult = await createCharge({
      customerId,
      billingType: billingType as "PIX" | "BOLETO",
      valueCents: invoice.amount_cents as number,
      dueDate: invoice.due_date as string,
      description: (invoice.description as string) ?? undefined,
      externalReference: invoiceId,
    });

    if (!chargeResult.success || !chargeResult.chargeId) {
      return {
        result: `Failed to create payment: ${chargeResult.error ?? "unknown error"}`,
      };
    }

    let pixPayload: string | null = null;

    // For PIX: get QR code copia-e-cola
    if (method === "pix") {
      const pixResult = await getPixQrCode(chargeResult.chargeId);
      if (pixResult.success && pixResult.payload) {
        pixPayload = pixResult.payload;
      }
    }

    // Insert payment_links row
    await context.supabase.from("payment_links").insert({
      clinic_id: context.clinicId,
      invoice_id: invoiceId,
      asaas_payment_id: chargeResult.chargeId,
      url: chargeResult.invoiceUrl ?? "",
      invoice_url: chargeResult.invoiceUrl ?? "",
      method,
      status: "active",
      pix_payload: pixPayload,
    });

    const amountFormatted = formatBrl(invoice.amount_cents as number);
    const paymentUrl = chargeResult.invoiceUrl ?? "";

    return {
      result: `Payment link created successfully for ${amountFormatted} via ${method.toUpperCase()}.`,
      appendToResponse: `\n\nLink de pagamento: ${paymentUrl}${pixPayload ? `\n\nPix copia e cola:\n${pixPayload}` : ""}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error creating payment link: ${message}` };
  }
}

async function handleCheckPaymentStatus(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId =
    typeof args.invoice_id === "string" ? args.invoice_id : "";

  try {
    // Fetch latest payment link for this invoice
    const { data: paymentLink, error: linkError } = await context.supabase
      .from("payment_links")
      .select("id, asaas_payment_id, method, status")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (linkError || !paymentLink) {
      return {
        result: `No payment link found for this invoice: ${linkError?.message ?? "no data"}`,
      };
    }

    // Check status in Asaas
    const statusResult = await getChargeStatus(
      paymentLink.asaas_payment_id as string
    );

    if (!statusResult.success) {
      return {
        result: `Failed to check payment status: ${statusResult.error ?? "unknown error"}`,
      };
    }

    const status = statusResult.status ?? "UNKNOWN";

    // Update local records based on status
    if (status === "RECEIVED" || status === "CONFIRMED") {
      await context.supabase
        .from("payment_links")
        .update({ status: "paid" })
        .eq("id", paymentLink.id);

      await context.supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);

      return {
        result: `Payment status: ${status}. The payment has been received and confirmed. Invoice marked as paid.`,
      };
    }

    if (status === "OVERDUE") {
      await context.supabase
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", invoiceId);

      return {
        result: `Payment status: ${status}. The payment is overdue. Invoice status updated.`,
      };
    }

    return {
      result: `Payment status: ${status}. The payment is pending.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error checking payment status: ${message}` };
  }
}

async function handleSendPaymentReminder(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const invoiceId =
    typeof args.invoice_id === "string" ? args.invoice_id : "";
  const tone =
    typeof args.tone === "string" ? args.tone : "gentle";

  try {
    // Fetch invoice
    const { data: invoice, error: invoiceError } = await context.supabase
      .from("invoices")
      .select("id, amount_cents, due_date, status")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return {
        result: `Invoice not found: ${invoiceError?.message ?? "no data"}`,
      };
    }

    // If already paid, no reminder needed
    if (invoice.status === "paid") {
      return {
        result:
          "This invoice is already paid. No reminder needed. Inform the patient that the payment was received.",
      };
    }

    const amountFormatted = formatBrl(invoice.amount_cents as number);
    const dueDate = invoice.due_date as string;

    // Return tone-appropriate guidance for the LLM
    const toneGuidance: Record<string, string> = {
      gentle: `Send a gentle, friendly reminder about the pending invoice of ${amountFormatted} due on ${dueDate}. Be warm and understanding. Mention the payment amount and due date naturally in conversation.`,
      direct: `Send a direct, clear reminder about the pending invoice of ${amountFormatted} due on ${dueDate}. Be professional and straightforward. State the amount owed and due date clearly.`,
      urgent: `Send an urgent reminder about the overdue invoice of ${amountFormatted} that was due on ${dueDate}. Emphasize the importance of prompt payment while remaining respectful. Offer to help if there are difficulties.`,
    };

    return {
      result: toneGuidance[tone] ?? toneGuidance["gentle"],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error preparing payment reminder: ${message}` };
  }
}

async function handleEscalateBilling(
  args: Record<string, unknown>,
  context: ToolCallContext
): Promise<ToolCallResult> {
  const reason =
    typeof args.reason === "string" ? args.reason : "No reason provided";

  try {
    await context.supabase
      .from("conversations")
      .update({ status: "escalated" })
      .eq("id", context.conversationId);

    return {
      result: `Billing issue escalated to the clinic team. Reason: ${reason}. Inform the patient that a team member will follow up shortly.`,
      newConversationStatus: "escalated",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { result: `Error escalating billing issue: ${message}` };
  }
}

// ── Agent Config ──

const billingConfig: AgentTypeConfig = {
  type: "billing",

  buildSystemPrompt(
    params: SystemPromptParams,
    _recipient?: RecipientContext
  ): string {
    return BASE_PROMPTS[params.locale] ?? BASE_PROMPTS["en"];
  },

  getInstructions(_tone: string, locale: string): string {
    return INSTRUCTIONS[locale] ?? INSTRUCTIONS["en"];
  },

  getTools(_options: AgentToolOptions) {
    return [
      createPaymentLinkTool,
      checkPaymentStatusTool,
      sendPaymentReminderTool,
      escalateBillingTool,
    ];
  },

  async handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    switch (toolCall.name) {
      case "create_payment_link":
        return handleCreatePaymentLink(toolCall.args, context);
      case "check_payment_status":
        return handleCheckPaymentStatus(toolCall.args, context);
      case "send_payment_reminder":
        return handleSendPaymentReminder(toolCall.args, context);
      case "escalate_billing":
        return handleEscalateBilling(toolCall.args, context);
      default:
        console.warn(`[billing] Unknown tool call: ${toolCall.name}`);
        return {};
    }
  },

  supportedChannels: ["whatsapp"],
};

registerAgentType(billingConfig);
