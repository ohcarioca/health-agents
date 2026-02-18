import OpenAI from "openai";
import type { ScenarioPersona } from "./types";

function buildPatientSystemPrompt(persona: ScenarioPersona, locale: string): string {
  const infoLines: string[] = [];
  if (persona.cpf) infoLines.push(`- CPF: ${persona.cpf}`);
  if (persona.email) infoLines.push(`- Email: ${persona.email}`);
  if (persona.phone) infoLines.push(`- Phone: ${persona.phone}`);

  const infoSection = infoLines.length > 0
    ? `\nINFORMATION YOU HAVE (use ONLY when the agent asks for it):\n${infoLines.join("\n")}`
    : "";

  const localeMap: Record<string, string> = {
    "pt-BR": "Brazilian Portuguese",
    "en": "English",
    "es": "Spanish",
  };

  return `You are simulating a patient in a healthcare clinic WhatsApp conversation.
You are testing an AI agent's ability to handle your request.

YOUR PERSONA:
- Name: ${persona.name}
- Personality: ${persona.personality}
- Language: ${localeMap[locale] ?? locale} (ALWAYS respond in this language)

YOUR GOAL:
${persona.goal}
${infoSection}

RULES:
1. Stay in character. Respond naturally as this patient would.
2. Only provide information (CPF, email, etc.) when the agent asks for it — do not volunteer it.
3. If the agent offers options (times, dates, professionals), pick one that aligns with your goal.
4. If the agent asks a question you cannot answer, say so naturally.
5. Keep messages short (1-3 sentences) — this is WhatsApp, not an essay.
6. NEVER break character or mention you are an AI or a simulation.
7. NEVER use markdown formatting, bullet points, or numbered lists. Write plain text like a real person on WhatsApp.

TERMINATION SIGNALS:
- When your goal is FULLY achieved (appointment booked, payment link received, score submitted, etc.), respond naturally to the agent's confirmation, then add [DONE] at the very end of your message.
- If you are stuck and cannot make progress after trying 3 different approaches, add [STUCK] at the very end of your message.
- These signals are invisible to the agent — still write a natural message before them.`;
}

export interface PatientMessage {
  content: string;
  signal: "continue" | "done" | "stuck";
}

interface PatientSimulatorOptions {
  persona: ScenarioPersona;
  locale: string;
  history: { role: "patient" | "agent"; content: string }[];
}

export async function generatePatientMessage(
  options: PatientSimulatorOptions
): Promise<PatientMessage> {
  const { persona, locale, history } = options;
  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = buildPatientSystemPrompt(persona, locale);

  // Use "developer" role (required by reasoning models like gpt-5-mini, o3-mini)
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "developer", content: systemPrompt },
  ];

  // Map conversation history — patient = assistant (from patient LLM's perspective), agent = user
  for (const msg of history) {
    messages.push({
      role: msg.role === "patient" ? "assistant" : "user",
      content: msg.content,
    });
  }

  // If history is empty, instruct patient to start the conversation
  if (history.length === 0) {
    messages.push({
      role: "user",
      content: "Start the conversation. Send your first message to the clinic's WhatsApp agent.",
    });
  }

  const response = await client.chat.completions.create({
    model: modelName,
    messages,
    max_completion_tokens: 2048,
  });

  const text = (response.choices[0]?.message?.content ?? "").trim();

  // Parse termination signals
  let signal: PatientMessage["signal"] = "continue";
  let content = text;

  if (text.includes("[DONE]")) {
    signal = "done";
    content = text.replace("[DONE]", "").trim();
  } else if (text.includes("[STUCK]")) {
    signal = "stuck";
    content = text.replace("[STUCK]", "").trim();
  }

  return { content, signal };
}
