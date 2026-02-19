// eval/agent-executor.ts
// Runs a real agent via the LangChain engine, bypassing the Next.js HTTP layer.
// Agents are registered via side-effect imports. Uses eval Supabase client.
// WhatsApp sends fail gracefully (fake credentials in test clinic).

// Side-effect: registers all 6 production agents
import "@/lib/agents/agents/basic-support";
import "@/lib/agents/agents/scheduling";
import "@/lib/agents/agents/confirmation";
import "@/lib/agents/agents/nps";
import "@/lib/agents/agents/billing";
import "@/lib/agents/agents/recall";

import { getAgentType } from "@/lib/agents/registry";
import { buildSystemPrompt } from "@/lib/agents/context-builder";
import { chatWithToolLoop } from "@/lib/agents/engine";
import { buildMessages } from "@/lib/agents/history";
import type {
  SystemPromptParams,
  RecipientContext,
  BusinessContext,
  ToolCallContext,
} from "@/lib/agents/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalSupabaseClient } from "./supabase";
import type { HistoryMessage } from "./types";

export interface ExecuteResult {
  response: string;
  toolsCalled: string[];
  availableTools: string[];
  durationMs: number;
  error?: string;
}

export async function executeAgent(params: {
  supabase: EvalSupabaseClient;
  agentType: string;
  clinicId: string;
  patientId: string;
  conversationId: string;
  history: HistoryMessage[];
  userMessage: string;
}): Promise<ExecuteResult> {
  const start = Date.now();
  const { supabase, agentType, clinicId, patientId, conversationId } = params;

  try {
    const agentConfig = getAgentType(agentType);
    if (!agentConfig) {
      throw new Error(`Agent type not registered: "${agentType}"`);
    }

    // Load agent DB row for this clinic
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, name, description, instructions, config")
      .eq("clinic_id", clinicId)
      .eq("type", agentType)
      .eq("active", true)
      .maybeSingle();

    if (!agentRow) {
      throw new Error(
        `No active agent of type "${agentType}" for clinic ${clinicId}`
      );
    }

    const agentDbConfig = (agentRow.config ?? {}) as Record<string, unknown>;

    // Load patient
    const { data: patient } = await supabase
      .from("patients")
      .select("id, name, phone, notes, custom_fields")
      .eq("id", patientId)
      .single();

    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    // Load clinic + business context
    const { data: clinic } = await supabase
      .from("clinics")
      .select("name, phone, address, timezone")
      .eq("id", clinicId)
      .single();

    const { data: services } = await supabase
      .from("services")
      .select("id, name, price_cents, duration_minutes")
      .eq("clinic_id", clinicId);

    const { data: professionals } = await supabase
      .from("professionals")
      .select("id, name, specialty")
      .eq("clinic_id", clinicId)
      .eq("active", true);

    const { data: insurancePlans } = await supabase
      .from("insurance_plans")
      .select("name")
      .eq("clinic_id", clinicId);

    const businessContext: BusinessContext | undefined = clinic
      ? {
          clinicName: clinic.name as string,
          phone: (clinic.phone as string) ?? undefined,
          address: (clinic.address as string) ?? undefined,
          timezone: clinic.timezone as string,
          insurancePlans: (insurancePlans ?? []).map((p) => p.name as string),
          services: (services ?? []).map((s) => {
            const price = s.price_cents
              ? ` — R$ ${((s.price_cents as number) / 100).toFixed(2).replace(".", ",")}`
              : "";
            const dur = s.duration_minutes
              ? ` (${s.duration_minutes}min)`
              : "";
            return `${s.name}${dur}${price} [ID: ${s.id}]`;
          }),
          professionals: (professionals ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            specialty: (p.specialty as string) ?? null,
          })),
        }
      : undefined;

    const recipient: RecipientContext = {
      id: patient.id as string,
      firstName: (patient.name as string).split(" ")[0],
      fullName: patient.name as string,
      phone: patient.phone as string,
      observations: (patient.notes as string) ?? undefined,
      customFields:
        (patient.custom_fields as Record<string, unknown>) ?? undefined,
      isNewPatient: false,
    };

    const promptParams: SystemPromptParams = {
      agentName: (agentRow.name as string) ?? agentType,
      agentDescription: (agentRow.description as string) ?? undefined,
      customInstructions: (agentRow.instructions as string) ?? undefined,
      businessContext,
      tone:
        (agentDbConfig.tone as "professional" | "friendly" | "casual") ??
        "professional",
      locale:
        (agentDbConfig.locale as "pt-BR" | "en" | "es") ?? "pt-BR",
      agentDbConfig,
    };

    const systemPrompt = buildSystemPrompt(agentConfig, promptParams, recipient);

    const tools = agentConfig.getTools({
      clinicId,
      conversationId,
      locale: promptParams.locale,
      agentConfig: agentDbConfig,
    });

    const availableTools = tools.map((t) => t.name);

    const messages = buildMessages(
      systemPrompt,
      params.history,
      params.userMessage
    );

    const toolCallContext: ToolCallContext = {
      supabase: supabase as unknown as SupabaseClient,
      conversationId,
      recipientId: patientId,
      clinicId,
    };

    const engineResult = await chatWithToolLoop({
      messages,
      tools,
      agentConfig,
      toolCallContext,
    });

    const fullResponse = engineResult.appendToResponse
      ? `${engineResult.responseText}\n\n${engineResult.appendToResponse}`
      : engineResult.responseText;

    return {
      response: fullResponse,
      toolsCalled: engineResult.toolCallNames,
      availableTools,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      response: "",
      toolsCalled: [],
      availableTools: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function createEvalConversation(
  supabase: EvalSupabaseClient,
  clinicId: string,
  patientId: string
): Promise<string> {
  // Use status "resolved" — this is a valid status that falls OUTSIDE the partial
  // unique index (conversations_one_open_per_patient WHERE status IN ('active', 'escalated')),
  // so multiple eval conversations can coexist without constraint violations.
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      channel: "whatsapp",
      status: "resolved",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create eval conversation: ${error?.message}`);
  }

  return data.id as string;
}
