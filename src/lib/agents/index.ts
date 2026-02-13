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

// Agent auto-registration (side-effect imports)
import "./agents/echo";
