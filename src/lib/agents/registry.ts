import type { AgentTypeConfig } from "./types";

const registry = new Map<string, AgentTypeConfig>();

export function registerAgentType(config: AgentTypeConfig): void {
  if (registry.has(config.type)) {
    throw new Error(
      `[agent-registry] Agent type "${config.type}" is already registered`
    );
  }
  registry.set(config.type, config);
}

export function getAgentType(type: string): AgentTypeConfig | undefined {
  return registry.get(type);
}

export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
