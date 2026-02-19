import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage, type WhatsAppCredentials } from "@/services/whatsapp";
import { normalizeBRPhone, phoneLookupVariants } from "@/lib/utils/phone";

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
  contactName?: string;
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
      toolCallNames: [],
      queued: false,
    };
  }

  // 2. Find patient by phone (handle 9th digit variants)
  const normalizedPhone = normalizeBRPhone(phone);
  const phoneVariants = phoneLookupVariants(normalizedPhone);
  let { data: patient } = await supabase
    .from("patients")
    .select("id, name, phone, notes, custom_fields")
    .eq("clinic_id", clinicId)
    .in("phone", phoneVariants)
    .maybeSingle();

  let isNewPatient = false;

  if (!patient) {
    const patientName = input.contactName?.trim() || normalizedPhone;
    const { data: newPatient, error: insertError } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinicId,
        name: patientName,
        phone: normalizedPhone,
      })
      .select("id, name, phone, notes, custom_fields")
      .single();

    if (insertError) {
      // Race condition: another request may have created the patient
      if (insertError.code === "23505") {
        const { data: existingPatient } = await supabase
          .from("patients")
          .select("id, name, phone, notes, custom_fields")
          .eq("clinic_id", clinicId)
          .in("phone", phoneVariants)
          .single();

        if (!existingPatient) {
          console.error("[process-message] patient insert conflict but re-query failed:", insertError);
          return {
            conversationId: "",
            responseText: "",
            module: "",
            toolCallCount: 0,
            toolCallNames: [],
            queued: false,
          };
        }

        patient = existingPatient;
      } else {
        console.error("[process-message] failed to create patient:", insertError);
        return {
          conversationId: "",
          responseText: "",
          module: "",
          toolCallCount: 0,
          toolCallNames: [],
          queued: false,
        };
      }
    } else {
      patient = newPatient;
    }

    isNewPatient = true;
    console.log(
      `[process-message] auto-created patient name="${patient.name}" phone=${normalizedPhone} clinic=${clinicId}`
    );
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

  // Fetch disabled module types so routing skips them
  const { data: moduleConfigRows } = await supabase
    .from("module_configs")
    .select("module_type, enabled")
    .eq("clinic_id", clinicId);

  const disabledModules = new Set(
    (moduleConfigRows ?? [])
      .filter((c) => c.enabled === false)
      .map((c) => c.module_type as string)
  );

  const isModuleEnabled = (type: string) => !disabledModules.has(type);

  if (currentModule && getAgentType(currentModule) && isModuleEnabled(currentModule)) {
    moduleType = currentModule as ModuleType;
  } else if (isNewPatient && getAgentType("support")) {
    moduleType = "support" as ModuleType;
  } else {
    // Get active agents from DB that are also registered in the framework
    const { data: activeAgents } = await supabase
      .from("agents")
      .select("type")
      .eq("clinic_id", clinicId)
      .eq("active", true);

    const registeredModules = (activeAgents ?? [])
      .filter((a) => getAgentType(a.type) && isModuleEnabled(a.type))
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

  // Check auto_billing from module_configs
  const { data: billingModuleConfig } = await supabase
    .from("module_configs")
    .select("settings")
    .eq("clinic_id", clinicId)
    .eq("module_type", "billing")
    .single();

  const autoBilling = (billingModuleConfig?.settings as Record<string, unknown> | null)?.auto_billing === true;
  if (autoBilling) {
    agentConfig_.auto_billing = true;
  }

  // 9. Build system prompt
  const firstName = patient.name.split(" ")[0];
  const recipient: RecipientContext = {
    id: patient.id,
    firstName,
    fullName: patient.name,
    phone: patient.phone,
    observations: patient.notes ?? undefined,
    customFields: patient.custom_fields as Record<string, unknown> | undefined,
    isNewPatient,
  };

  // Load business context
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name, phone, address, timezone, whatsapp_phone_number_id, whatsapp_access_token")
    .eq("id", clinicId)
    .single();

  const { data: insurancePlans } = await supabase
    .from("insurance_plans")
    .select("name")
    .eq("clinic_id", clinicId);

  const { data: services } = await supabase
    .from("services")
    .select("id, name, price_cents, duration_minutes, modality")
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
        services: (services ?? []).map((s) => {
          const price = s.price_cents
            ? ` — R$ ${(s.price_cents / 100).toFixed(2).replace(".", ",")}`
            : "";
          const duration = s.duration_minutes
            ? ` (${s.duration_minutes}min)`
            : "";
          const modalityMap: Record<string, string> = {
            in_person: "presencial",
            online: "online",
            both: "presencial/online",
          };
          const modStr = s.modality ? ` [${modalityMap[s.modality as string] ?? s.modality}]` : "";
          return `${s.name}${duration}${price}${modStr} [ID: ${s.id}]`;
        }),
        professionals: (professionals ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          specialty: (p.specialty as string) ?? null,
        })),
      }
    : undefined;

  const whatsappCredentials: WhatsAppCredentials = {
    phoneNumberId: (clinic?.whatsapp_phone_number_id as string) ?? "",
    accessToken: (clinic?.whatsapp_access_token as string) ?? "",
  };

  const promptParams: SystemPromptParams = {
    agentName,
    agentDescription: agentRow?.description ?? undefined,
    customInstructions: agentRow?.instructions ?? undefined,
    successCriteria: (agentConfig_.success_criteria as string) ?? undefined,
    businessContext,
    tone: (agentConfig_.tone as "professional" | "friendly" | "casual") ?? "professional",
    locale: (agentConfig_.locale as "pt-BR" | "en" | "es") ?? "pt-BR",
    agentDbConfig: agentConfig_,
  };

  const systemPrompt = buildSystemPrompt(agentConfig, promptParams, recipient);

  // 10. Build messages and run tool loop
  const messages = buildMessages(systemPrompt, history, message);

  const tools = agentConfig.getTools({
    clinicId,
    conversationId,
    locale: promptParams.locale,
    agentConfig: agentConfig_,
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

  // 11. Compose final response — split into parts for separate WhatsApp messages
  const mainResponse = engineResult.responseText;
  const appendix = engineResult.appendToResponse ?? "";
  const fullResponse = appendix
    ? `${mainResponse}\n\n${appendix}`
    : mainResponse;

  // 12. Save assistant response (full content for conversation history)
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    clinic_id: clinicId,
    content: fullResponse,
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

  // 15-17. Queue + send via WhatsApp — split long messages
  const messageParts = appendix
    ? [mainResponse, appendix]
    : splitLongMessage(mainResponse);

  for (const part of messageParts) {
    const { data: queueRow } = await supabase
      .from("message_queue")
      .insert({
        conversation_id: conversationId,
        clinic_id: clinicId,
        channel: "whatsapp",
        content: part,
        status: "pending",
        attempts: 0,
        max_attempts: 3,
      })
      .select("id")
      .single();

    const sendResult = await sendTextMessage(normalizedPhone, part, whatsappCredentials);

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
  }

  return {
    conversationId,
    responseText: fullResponse,
    module: finalModule,
    toolCallCount: engineResult.toolCallCount,
    toolCallNames: engineResult.toolCallNames,
    queued: true,
  };
}

// ── Helpers ──

const WHATSAPP_MAX_LENGTH = 4000;

function splitLongMessage(text: string): string[] {
  if (text.length <= WHATSAPP_MAX_LENGTH) {
    return [text];
  }

  const parts: string[] = [];
  const paragraphs = text.split("\n\n");
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > WHATSAPP_MAX_LENGTH && current) {
      parts.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.length > 0 ? parts : [text];
}
