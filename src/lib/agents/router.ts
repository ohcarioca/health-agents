import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { extractTextContent } from "./content";
import type { ModuleType } from "@/types";
import type { RouterResult } from "./types";

const FALLBACK_MODULE: ModuleType = "support";

const ROUTER_SYSTEM_PROMPT = `You are a message classifier for a healthcare clinic. Classify the patient's message intent and return JSON only.

Return format: { "module": "<module_key>", "reason": "<brief reason>" }

Do NOT wrap in markdown code fences. Return only the JSON object.`;

interface RouteMessageOptions {
  message: string;
  patientContext?: string;
  activeModules: ModuleType[];
}

export async function routeMessage(
  options: RouteMessageOptions
): Promise<RouterResult> {
  const { message, patientContext, activeModules } = options;

  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const llm = new ChatOpenAI({
    model: modelName,
    maxRetries: 2,
    maxTokens: 100,
  });

  const moduleList = activeModules.join(", ");
  const systemContent = `${ROUTER_SYSTEM_PROMPT}\n\nAvailable modules: ${moduleList}${
    patientContext ? `\n\nPatient context:\n${patientContext}` : ""
  }`;

  try {
    const response = await llm.invoke([
      new SystemMessage(systemContent),
      new HumanMessage(message),
    ]);

    const text = extractTextContent(response.content);
    const parsed = parseRouterResponse(text, activeModules);
    return parsed;
  } catch (err) {
    console.error("[router] classification failed:", err);
    return { module: FALLBACK_MODULE, reason: "classification error" };
  }
}

function parseRouterResponse(
  text: string,
  activeModules: ModuleType[]
): RouterResult {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed: unknown = JSON.parse(cleaned);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "module" in parsed &&
      "reason" in parsed
    ) {
      const obj = parsed as { module: string; reason: string };
      const module = obj.module as ModuleType;

      if (activeModules.includes(module)) {
        return { module, reason: obj.reason };
      }

      console.warn(
        `[router] module "${obj.module}" not in active modules, falling back`
      );
    }
  } catch {
    console.warn("[router] failed to parse response:", text);
  }

  return { module: FALLBACK_MODULE, reason: "parse fallback" };
}
