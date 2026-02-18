import Anthropic from "@anthropic-ai/sdk";
import type { ScenarioResult, ImprovementProposal } from "./types";

const ANALYST_SYSTEM_PROMPT = `You are a senior AI engineer reviewing evaluation results for healthcare clinic chatbot agents.

Analyze the failures and warnings from conversation transcripts, then propose specific, actionable improvements.

For each issue, return a JSON object with:
- agent: which agent type (e.g., "scheduling", "billing")
- scenarioId: which scenario failed
- priority: "critical" (blocks patients from completing goal), "high" (degrades experience), or "low" (minor quality issue)
- category: "prompt" (system prompt issue), "tool" (tool behavior), "routing" (module routing), "guardrail" (safety), or "fixture" (test data issue)
- issue: what went wrong (1 sentence)
- rootCause: why it happened (1 sentence)
- fix: exact text to add/change in the system prompt or tool description (be specific)
- file: which source file to change (optional, e.g., "src/lib/agents/agents/scheduling.ts")

Return ONLY a JSON array of proposals (no markdown, no code fences).
If there are no issues, return an empty array: []`;

export async function analyzeResults(
  results: ScenarioResult[]
): Promise<ImprovementProposal[]> {
  const problemScenarios = results.filter((r) => r.status === "fail" || r.status === "warn");

  if (problemScenarios.length === 0) {
    return [];
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  const model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";

  if (!apiKey) {
    console.warn("[eval-analyst] Missing CLAUDE_API_KEY, skipping analysis");
    return [];
  }

  const client = new Anthropic({ apiKey });

  const summaries = problemScenarios.map((r) => {
    const transcript = r.turns.map((t) => ({
      role: t.role,
      content: t.content.slice(0, 200),
      tools: t.toolsCalled ?? [],
      guardrailViolations: t.guardrailViolations ?? [],
    }));

    return {
      scenarioId: r.scenario.id,
      agent: r.scenario.agent,
      description: r.scenario.description,
      goal: r.scenario.persona.goal,
      score: r.score,
      status: r.status,
      terminationReason: r.terminationReason,
      goalAchieved: r.judge.goal_achieved,
      guardrailViolations: r.guardrailViolations,
      assertionFailures: r.assertionResults.failures,
      judgeIssues: r.judge.issues,
      transcript,
    };
  });

  const userPrompt = `Here are the evaluation results with issues:\n\n${JSON.stringify(summaries, null, 2)}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0,
      system: ANALYST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

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
