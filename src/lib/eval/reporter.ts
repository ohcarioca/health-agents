import * as fs from "node:fs";
import * as path from "node:path";
import type { EvalReport, ScenarioResult, ImprovementProposal } from "./types";

const REPORTS_DIR = path.resolve(process.cwd(), "evals", "reports");

// ── CLI Output ──

export function printResults(results: ScenarioResult[], proposals: ImprovementProposal[]): void {
  const totalScenarios = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const avgScore = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.overallScore, 0) / totalScenarios
    : 0;
  const totalTurns = results.reduce((sum, r) => sum + r.turnResults.length, 0);
  // Each turn = 1 agent call + 1 judge call. Plus 1 analyst call if proposals exist.
  const totalLlmCalls = totalTurns * 2 + (proposals.length > 0 ? 1 : 0);

  console.log("");
  console.log(`Orbita Eval Suite -- ${totalScenarios} scenarios`);
  console.log("");

  // Group by agent
  const byAgent = new Map<string, ScenarioResult[]>();
  for (const r of results) {
    const list = byAgent.get(r.agent) ?? [];
    list.push(r);
    byAgent.set(r.agent, list);
  }

  for (const [agent, agentResults] of byAgent) {
    console.log(`  ${agent} (${agentResults.length} scenarios)`);
    for (const r of agentResults) {
      const icon = r.status === "pass" ? "pass" : r.status === "warn" ? "WARN" : "FAIL";
      const totalTools = r.turnResults.reduce((sum, t) => sum + t.toolCallCount, 0);
      const suffix = r.status !== "pass"
        ? `  ${getFirstFailure(r)}`
        : `  (${r.turnResults.length} turns, ${totalTools} tools)`;
      console.log(
        `    ${icon.padEnd(5)} ${r.scenarioId.padEnd(35)} ${r.overallScore.toFixed(1)}/10${suffix}`
      );
    }
    console.log("");
  }

  // Proposals
  if (proposals.length > 0) {
    console.log("--- Improvement Proposals ---");
    console.log("");
    for (const p of proposals) {
      console.log(`  [${p.priority.toUpperCase()}] ${p.agent} -- ${p.scenarioId}`);
      console.log(`    Issue: ${p.issue}`);
      console.log(`    Root cause: ${p.rootCause}`);
      console.log(`    Fix: ${p.fix}`);
      console.log("");
    }
  }

  // Summary
  console.log("=".repeat(50));
  console.log(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);
  console.log(`Average score: ${avgScore.toFixed(1)}/10`);
  console.log(`LLM calls: ~${totalLlmCalls}`);
}

function getFirstFailure(r: ScenarioResult): string {
  for (const t of r.turnResults) {
    if (t.checkResult.failures.length > 0) {
      return t.checkResult.failures[0];
    }
  }
  if (r.assertionResult.failures.length > 0) {
    return r.assertionResult.failures[0];
  }
  return `score ${r.overallScore}/10`;
}

// ── JSON Report ──

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
  const totalTurns = results.reduce((sum, r) => sum + r.turnResults.length, 0);

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    totalScenarios,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
    averageScore: totalScenarios > 0
      ? Math.round((results.reduce((sum, r) => sum + r.overallScore, 0) / totalScenarios) * 10) / 10
      : 0,
    totalLlmCalls: totalTurns * 2 + (proposals.length > 0 ? 1 : 0),
    scenarios: results,
    proposals,
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`Report: ${filePath}`);
  return filePath;
}
