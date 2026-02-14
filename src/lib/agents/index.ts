// Types
export type {
  ToolCallContext,
  ToolCallResult,
  ToolCallInput,
  WhatsAppTemplateConfig,
  RecipientContext,
  BusinessContext,
  SystemPromptParams,
  AgentTypeConfig,
  AgentToolOptions,
  EngineResult,
  RouterResult,
  ProcessMessageResult,
} from "./types";

// Registry
export { registerAgentType, getAgentType, getRegisteredTypes } from "./registry";

// Content extraction
export { extractTextContent } from "./content";

// History builder
export { buildMessages } from "./history";

// Context builder
export { buildSystemPrompt } from "./context-builder";

// Engine
export { chatWithToolLoop } from "./engine";

// Router
export { routeMessage } from "./router";

// Process message orchestrator
export { processMessage } from "./process-message";

// Outbound message runner
export {
  isWithinBusinessHours,
  canSendToPatient,
  sendOutboundMessage,
  sendOutboundTemplate,
} from "./outbound";
export type { OutboundSendResult } from "./outbound";

// Agent auto-registration (side-effect imports)
import "./agents/basic-support";
import "./agents/scheduling";
import "./agents/confirmation";
import "./agents/nps";
import "./agents/billing";
import "./agents/recall";
