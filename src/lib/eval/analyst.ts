import { ChatOpenAI } from "@langchain/openai";
import type { MessageContent } from "@langchain/core/messages";
import type { ScenarioResult, ImprovementProposal } from "./types";

/** Extract text from LLM response content (string | ContentBlock[]) */
function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => typeof b === "string" || (typeof b === "object" && b.type === "text"))
      .map((b) => (typeof b === "string" ? b : "text" in b ? b.text : ""))
      .join("");
  }
  return String(content ?? "");
}

const ANALYST_SYSTEM_PROMPT = `You are a senior AI engineer reviewing evaluation results for healthcare clinic chatbot agents.
Analyze the failures and warnings, then propose specific, actionable improvements.

For each issue, return a JSON object with:
- agent: which agent type
- scenarioId: which scenario failed
- priority: "critical" (blocks patients), "high" (degrades experience), or "low" (minor)
- issue: what went wrong (1 sentence)
- rootCause: why it happened — prompt issue? missing tool? wrong tool behavior? (1 sentence)
- fix: exact text to add/change in the system prompt or tool description (be specific)

Return ONLY a JSON array of proposals (no markdown, no code fences).
If there are no issues, return an empty array: []`;

export async function analyzeResults(
  results: ScenarioResult[]
): Promise<ImprovementProposal[]> {
  const problemScenarios = results.filter((r) => r.status === "fail" || r.status === "warn");

  if (problemScenarios.length === 0) {
    return [];
  }

  const modelName = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const llm = new ChatOpenAI({
    model: modelName,
    maxRetries: 1,
  });

  const summaries = problemScenarios.map((r) => {
    const turnIssues = r.turnResults
      .filter((t) => !t.checkResult.passed || t.judgeResult.overall < 7)
      .map((t) => ({
        turn: t.turnIndex + 1,
        user: t.userMessage,
        agent: t.agentResponse.slice(0, 200),
        tools: t.toolCallNames,
        checkFailures: t.checkResult.failures,
        judgeScore: t.judgeResult.overall,
        judgeIssues: t.judgeResult.issues,
      }));

    return {
      scenarioId: r.scenarioId,
      agent: r.agent,
      description: r.description,
      overallScore: r.overallScore,
      status: r.status,
      assertionFailures: r.assertionResult.failures,
      turnIssues,
    };
  });

  const userPrompt = `Here are the evaluation results with issues:\n\n${JSON.stringify(summaries, null, 2)}`;

  try {
    const response = await llm.invoke([
      { role: "system", content: ANALYST_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    const text = extractText(response.content);

    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[eval-analyst] Failed to analyze results:", error);
    return [];
  }
}
