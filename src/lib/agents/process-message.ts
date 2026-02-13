import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "@/services/whatsapp";

import { getAgentType } from "./registry";
import { buildMessages } from "./history";
import { buildSystemPrompt } from "./context-builder";
import { chatWithToolLoop } from "./engine";
import { routeMessage } from "./router";
import type {
  ProcessMessageResult,
  RecipientContext,
  BusinessContext,
  SystemPromptParams,
} from "./types";
import type { ModuleType } from "@/types";

interface ProcessMessageInput {
  phone: string;
  message: string;
  externalId: string;
  clinicId: string;
}

export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  const { phone, message, externalId, clinicId } = input;
  const supabase = createAdminClient();

  // 1. Idempotency: skip if external_id already exists
  const { data: existingMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("external_id", externalId)
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (existingMessage) {
    console.log(`[process-message] duplicate external_id=${externalId}, skipping`);
    return {
      conversationId: "",
      responseText: "",
      module: "",
      toolCallCount: 0,
      queued: false,
    };
  }

  // 2. Find patient by phone
  const normalizedPhone = phone.replace(/\D/g, "");
  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, phone, notes, custom_fields")
    .eq("clinic_id", clinicId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!patient) {
    console.warn(`[process-message] no patient found for phone=${normalizedPhone} in clinic=${clinicId}`);
    return {
      conversationId: "",
      responseText: "",
      module: "",
      toolCallCount: 0,
      queued: false,
    };
  }

  // 3. Find or create conversation
  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("id, current_module, status")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patient.id)
    .eq("channel", "whatsapp")
    .eq("status", "active")
    .maybeSingle();

  let conversationId: string;
  let currentModule: string | null;

  if (existingConversation) {
    conversationId = existingConversation.id;
    currentModule = existingConversation.current_module;
  } else {
    const { data: newConversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        clinic_id: clinicId,
        patient_id: patient.id,
        channel: "whatsapp",
        status: "active",
      })
      .select("id")
      .single();

    if (convError || !newConversation) {
      console.error("[process-message] failed to create conversation:", convError);
      throw new Error("failed to create conversation");
    }

    conversationId = newConversation.id;
    currentModule = null;
  }

  // 4. Save incoming message
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    clinic_id: clinicId,
    content: message,
    role: "user",
    external_id: externalId,
  });

  // 5. Load conversation history (last 30 messages)
  const { data: historyRows } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);

  const history = (historyRows ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

  // 6. Route message to module
  let moduleType: ModuleType;

  if (currentModule && getAgentType(currentModule)) {
    moduleType = currentModule as ModuleType;
  } else {
    // Get active agents from DB that are also registered in the framework
    const { data: activeAgents } = await supabase
      .from("agents")
      .select("type")
      .eq("clinic_id", clinicId)
      .eq("active", true);

    const registeredModules = (activeAgents ?? [])
      .filter((a) => getAgentType(a.type))
      .map((a) => a.type as ModuleType);

    if (registeredModules.length === 1) {
      // Single registered agent — use directly, skip router
      moduleType = registeredModules[0];
    } else if (registeredModules.length > 1) {
      // Multiple registered agents — use router to classify
      const routerResult = await routeMessage({
        message,
        activeModules: registeredModules,
      });
      moduleType = routerResult.module;
    } else {
      console.error(`[process-message] no registered agents for clinic=${clinicId}`);
      throw new Error("no registered agents for this clinic");
    }
  }

  // 7. Get agent config from registry
  const agentConfig = getAgentType(moduleType);
  if (!agentConfig) {
    console.error(`[process-message] no agent registered for module "${moduleType}"`);
    throw new Error(`no agent for module "${moduleType}"`);
  }

  // 8. Find agent row in DB
  const { data: agentRow } = await supabase
    .from("agents")
    .select("id, name, description, instructions, config")
    .eq("clinic_id", clinicId)
    .eq("type", moduleType)
    .eq("active", true)
    .maybeSingle();

  const agentName = agentRow?.name ?? moduleType;
  const agentConfig_ = (agentRow?.config ?? {}) as Record<string, unknown>;

  // 9. Build system prompt
  const firstName = patient.name.split(" ")[0];
  const recipient: RecipientContext = {
    id: patient.id,
    firstName,
    fullName: patient.name,
    phone: patient.phone,
    observations: patient.notes ?? undefined,
    customFields: patient.custom_fields as Record<string, unknown> | undefined,
  };

  // Load business context
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, phone, address, timezone")
    .eq("id", clinicId)
    .single();

  const { data: insurancePlans } = await supabase
    .from("insurance_plans")
    .select("name")
    .eq("clinic_id", clinicId);

  const { data: services } = await supabase
    .from("services")
    .select("name")
    .eq("clinic_id", clinicId);

  const { data: professionals } = await supabase
    .from("professionals")
    .select("id, name, specialty")
    .eq("clinic_id", clinicId)
    .eq("active", true);

  const businessContext: BusinessContext | undefined = clinic
    ? {
        clinicName: clinic.name,
        phone: clinic.phone ?? undefined,
        address: clinic.address ?? undefined,
        timezone: clinic.timezone,
        insurancePlans: (insurancePlans ?? []).map((p) => p.name),
        services: (services ?? []).map((s) => s.name),
        professionals: (professionals ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          specialty: (p.specialty as string) ?? null,
        })),
      }
    : undefined;

  const promptParams: SystemPromptParams = {
    agentName,
    agentDescription: agentRow?.description ?? undefined,
    customInstructions: agentRow?.instructions ?? undefined,
    successCriteria: (agentConfig_.success_criteria as string) ?? undefined,
    businessContext,
    tone: (agentConfig_.tone as "professional" | "friendly" | "casual") ?? "professional",
    locale: (agentConfig_.locale as "pt-BR" | "en" | "es") ?? "pt-BR",
  };

  const systemPrompt = buildSystemPrompt(agentConfig, promptParams, recipient);

  // 10. Build messages and run tool loop
  const messages = buildMessages(systemPrompt, history, message);

  const tools = agentConfig.getTools({
    clinicId,
    conversationId,
    locale: promptParams.locale,
  });

  const engineResult = await chatWithToolLoop({
    messages,
    tools,
    agentConfig,
    toolCallContext: {
      supabase,
      conversationId,
      recipientId: patient.id,
      clinicId,
    },
  });

  // 11. Compose final response
  let finalResponse = engineResult.responseText;
  if (engineResult.appendToResponse) {
    finalResponse += `\n\n${engineResult.appendToResponse}`;
  }

  // 12. Save assistant response
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    clinic_id: clinicId,
    content: finalResponse,
    role: "assistant",
  });

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

  // 15. Queue outbound message
  const { data: queueRow } = await supabase
    .from("message_queue")
    .insert({
      conversation_id: conversationId,
      clinic_id: clinicId,
      channel: "whatsapp",
      content: finalResponse,
      status: "pending",
      attempts: 0,
      max_attempts: 3,
    })
    .select("id")
    .single();

  // 16. Send via WhatsApp
  const sendResult = await sendTextMessage(normalizedPhone, finalResponse);

  // 17. Update queue status
  if (queueRow) {
    await supabase
      .from("message_queue")
      .update({
        status: sendResult.success ? "sent" : "failed",
        ...(sendResult.success ? { sent_at: new Date().toISOString() } : {}),
        ...(sendResult.error ? { error: sendResult.error } : {}),
        attempts: 1,
      })
      .eq("id", queueRow.id);
  }

  return {
    conversationId,
    responseText: finalResponse,
    module: finalModule,
    toolCallCount: engineResult.toolCallCount,
    queued: sendResult.success,
  };
}
