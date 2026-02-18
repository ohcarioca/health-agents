import type {
  AgentTypeConfig,
  SystemPromptParams,
  RecipientContext,
  BusinessContext,
} from "./types";

export function buildSystemPrompt(
  agentConfig: AgentTypeConfig,
  params: SystemPromptParams,
  recipient?: RecipientContext
): string {
  const sections: string[] = [];

  // 1. Base prompt from agent type
  const basePrompt = agentConfig.buildSystemPrompt(params, recipient);
  if (basePrompt) {
    sections.push(basePrompt);
  }

  // 2. Agent name
  sections.push(`Your name is "${params.agentName}".`);

  // 3. Description
  if (params.agentDescription) {
    sections.push(`About you: ${params.agentDescription}`);
  }

  // 4. Custom instructions
  if (params.customInstructions) {
    sections.push(`Specific instructions:\n${params.customInstructions}`);
  }

  // 5. Success criteria
  if (params.successCriteria) {
    sections.push(`Success criteria:\n${params.successCriteria}`);
  }

  // 6. Tool instructions
  const tools = agentConfig.getTools({
    clinicId: "",
    conversationId: "",
    locale: params.locale,
    agentConfig: params.agentDbConfig,
  });
  if (tools.length > 0) {
    const toolDescriptions = tools
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
    sections.push(`Available tools:\n${toolDescriptions}`);
  }

  // 7. Business context
  if (params.businessContext) {
    sections.push(formatBusinessContext(params.businessContext));
  }

  // 8. Recipient context (always last)
  if (recipient) {
    sections.push(formatRecipientContext(recipient));
  }

  return sections.join("\n\n");
}

function formatBusinessContext(ctx: BusinessContext): string {
  const lines: string[] = [`Business context:`];
  lines.push(`- Clinic: ${ctx.clinicName}`);
  if (ctx.phone) lines.push(`- Phone: ${ctx.phone}`);
  if (ctx.address) lines.push(`- Address: ${ctx.address}`);
  lines.push(`- Timezone: ${ctx.timezone}`);
  if (ctx.services.length > 0) {
    lines.push(`- Services: ${ctx.services.join(", ")}`);
  }
  if (ctx.insurancePlans.length > 0) {
    lines.push(`- Insurance plans: ${ctx.insurancePlans.join(", ")}`);
  }
  if (ctx.professionals.length > 0) {
    const profList = ctx.professionals
      .map((p) => {
        const spec = p.specialty ? ` (${p.specialty})` : "";
        return `  - ${p.name}${spec} [ID: ${p.id}]`;
      })
      .join("\n");
    lines.push(`- Professionals:\n${profList}`);
  }
  return lines.join("\n");
}

function formatRecipientContext(recipient: RecipientContext): string {
  const lines: string[] = [`Recipient context:`];
  lines.push(`- Name: ${recipient.fullName}`);
  lines.push(`- Phone: ${recipient.phone}`);
  if (recipient.isNewPatient) {
    lines.push(
      `- NEW PATIENT: This is the patient's first contact. ` +
        `Greet them warmly, introduce yourself, and ask how you can help. ` +
        `Do not assume any prior history.`
    );
  }
  if (recipient.observations) {
    lines.push(`- Observations: ${recipient.observations}`);
  }
  return lines.join("\n");
}
