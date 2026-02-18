import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport, ScenarioResult, ImprovementProposal } from "./types";

const REPORTS_DIR = path.resolve(process.cwd(), "evals", "reports");

const TERM_ICONS: Record<string, string> = {
  done: "DONE",
  stuck: "STUCK",
  max_turns: "MAX",
  escalated: "ESC",
};

export function printResults(results: ScenarioResult[], proposals: ImprovementProposal[]): void {
  const totalScenarios = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const avgScore = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / totalScenarios
    : 0;
  const totalLlmCalls = results.reduce((sum, r) => sum + r.llmCalls, 0)
    + (proposals.length > 0 ? 1 : 0);

  console.log("");
  console.log("=".repeat(56));
  console.log(`  EVAL RESULTS -- ${new Date().toISOString().slice(0, 19)}`);
  console.log("=".repeat(56));
  console.log("");

  // Group by agent
  const byAgent = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const key = r.scenario.agent;
    const list = byAgent.get(key) ?? [];
    list.push(r);
    byAgent.set(key, list);
  }

  for (const [agent, agentResults] of byAgent) {
    console.log(`  ${agent} (${agentResults.length} scenarios)`);
    for (const r of agentResults) {
      const icon = r.status === "pass" ? "pass" : r.status === "warn" ? "WARN" : "FAIL";
      const term = TERM_ICONS[r.terminationReason] ?? r.terminationReason;
      const info = `(${r.turnCount} turns, ${r.totalToolCalls} tools)`;
      console.log(
        `    ${icon.padEnd(5)} ${r.scenario.id.padEnd(40)} [${term}] ${r.score.toFixed(1)}  ${info}`
      );
    }
    console.log("");
  }

  // Proposals
  if (proposals.length > 0) {
    console.log("  PROPOSALS");
    console.log("");
    for (const p of proposals) {
      const cat = p.category ? ` [${p.category}]` : "";
      console.log(`    ${p.priority.toUpperCase().padEnd(9)} ${p.agent}/${p.scenarioId}${cat}`);
      console.log(`             ${p.issue}`);
      console.log(`             Fix: ${p.fix}`);
      console.log("");
    }
  }

  // Summary
  console.log("-".repeat(56));
  console.log(`  Pass: ${passed} | Warn: ${warnings} | Fail: ${failed}`);
  console.log(`  Avg score: ${avgScore.toFixed(1)}/10 | LLM calls: ~${totalLlmCalls}`);
  console.log(`  Patient: OpenAI | Judge: Claude`);
  console.log("=".repeat(56));
}

export function printVerboseTranscript(result: ScenarioResult): void {
  console.log(`\n  -- ${result.scenario.id} --`);
  for (const turn of result.turns) {
    const prefix = turn.role === "patient" ? "PATIENT" : "AGENT  ";
    const content = turn.content.length > 200
      ? turn.content.slice(0, 200) + "..."
      : turn.content;
    console.log(`  [${turn.index + 1}] ${prefix}: ${content}`);
    if (turn.toolsCalled?.length) {
      console.log(`               tools: [${turn.toolsCalled.join(", ")}]`);
    }
    if (turn.guardrailViolations?.length) {
      console.log(`               GUARDRAIL: ${turn.guardrailViolations.join("; ")}`);
    }
  }
  const j = result.judge;
  console.log(`  JUDGE: goal=${j.goal_achieved} score=${result.score}`);
  console.log(`         correctness=${j.scores.correctness} helpfulness=${j.scores.helpfulness} tone=${j.scores.tone} safety=${j.scores.safety} conciseness=${j.scores.conciseness} flow=${j.scores.flow}`);
  if (j.issues.length > 0) {
    console.log(`         issues: ${j.issues.join("; ")}`);
  }
}

export function saveReport(
  results: ScenarioResult[],
  proposals: ImprovementProposal[]
): string {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(REPORTS_DIR, `${timestamp}.json`);

  const totalScenarios = results.length;

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    totalScenarios,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
    averageScore: totalScenarios > 0
      ? Math.round((results.reduce((sum, r) => sum + r.score, 0) / totalScenarios) * 10) / 10
      : 0,
    totalLlmCalls: results.reduce((sum, r) => sum + r.llmCalls, 0) + (proposals.length > 0 ? 1 : 0),
    scenarios: results,
    proposals,
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\nReport saved: ${filePath}`);
  return filePath;
}
