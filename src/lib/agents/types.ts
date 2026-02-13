import type { StructuredToolInterface } from "@langchain/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleType } from "@/types";

// ── Tool Call Context ──
export interface ToolCallContext {
  supabase: SupabaseClient;
  conversationId: string;
  recipientId: string;
  clinicId: string;
  userId?: string;
}

// ── Tool Call Result ──
export interface ToolCallResult {
  result?: string;
  appendToResponse?: string;
  newConversationStatus?: string;
  responseData?: Record<string, unknown>;
}

// ── Tool Call Input ──
export interface ToolCallInput {
  name: string;
  args: Record<string, unknown>;
}

// ── WhatsApp Template Config ──
export interface WhatsAppTemplateConfig {
  templateName: string;
  templateLanguage: string;
  getTemplateParams(recipient: RecipientContext, agentName: string): string[];
  getTemplateBody(recipient: RecipientContext, agentName: string): string;
}

// ── Recipient Context ──
export interface RecipientContext {
  id: string;
  firstName: string;
  fullName: string;
  phone: string;
  observations?: string;
  customFields?: Record<string, unknown>;
}

// ── Business Context ──
export interface ProfessionalInfo {
  id: string;
  name: string;
  specialty: string | null;
}

export interface BusinessContext {
  clinicName: string;
  phone?: string;
  address?: string;
  timezone: string;
  insurancePlans: string[];
  services: string[];
  professionals: ProfessionalInfo[];
}

// ── System Prompt Build Params ──
export interface SystemPromptParams {
  agentName: string;
  agentDescription?: string;
  customInstructions?: string;
  successCriteria?: string;
  businessContext?: BusinessContext;
  tone: "professional" | "friendly" | "casual";
  locale: "pt-BR" | "en" | "es";
}

// ── Agent Type Config ──
export interface AgentTypeConfig {
  type: string;
  buildSystemPrompt(
    params: SystemPromptParams,
    recipient?: RecipientContext
  ): string;
  getInstructions(tone: string, locale: string): string;
  getTools(options: AgentToolOptions): StructuredToolInterface[];
  handleToolCall(
    toolCall: ToolCallInput,
    context: ToolCallContext
  ): Promise<ToolCallResult>;
  supportedChannels: ("gmail" | "whatsapp")[];
  whatsappTemplate?: WhatsAppTemplateConfig;
}

// ── Agent Tool Options ──
export interface AgentToolOptions {
  clinicId: string;
  conversationId: string;
  locale: string;
}

// ── Engine Result ──
export interface EngineResult {
  responseText: string;
  appendToResponse?: string;
  newConversationStatus?: string;
  responseData?: Record<string, unknown>;
  toolCallCount: number;
}

// ── Router Result ──
export interface RouterResult {
  module: ModuleType;
  reason: string;
}

// ── Message Processing Result ──
export interface ProcessMessageResult {
  conversationId: string;
  responseText: string;
  module: string;
  toolCallCount: number;
  queued: boolean;
}
