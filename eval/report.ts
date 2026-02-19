// eval/report.ts
// Generates a colorful console summary and writes JSON to eval-results/.

import fs from "fs";
import path from "path";
import type { EvalResult, RunSummary } from "./types";

// ANSI color helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

function scoreColor(score: number): string {
  if (score >= 8) return c.green;
  if (score >= 6) return c.yellow;
  return c.red;
}

function badge(passed: boolean, criticalFail: boolean): string {
  if (criticalFail) return `${c.bgRed}${c.white} CRITICAL ${c.reset}`;
  if (passed) return `${c.bgGreen}${c.white}  PASS  ${c.reset}`;
  return `${c.bgYellow}${c.white}  FAIL  ${c.reset}`;
}

export function buildSummary(
  runId: string,
  results: EvalResult[]
): RunSummary {
  const passed = results.filter((r) => r.passed).length;
  const criticalFails = results.filter((r) => r.criticalFail).length;
  const scores = results.map((r) => r.score).filter((s) => s > 0);
  const averageScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
        10
      : 0;

  const byAgent: RunSummary["byAgent"] = {};
  for (const r of results) {
    if (!byAgent[r.agentType]) byAgent[r.agentType] = { averageScore: 0, cases: 0 };
    byAgent[r.agentType].cases++;
  }
  for (const agent of Object.keys(byAgent)) {
    const agentResults = results.filter((r) => r.agentType === agent);
    const agentScores = agentResults.map((r) => r.score).filter((s) => s > 0);
    byAgent[agent].averageScore =
      agentScores.length > 0
        ? Math.round(
            (agentScores.reduce((a, b) => a + b, 0) / agentScores.length) * 10
          ) / 10
        : 0;
  }

  return {
    runId,
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed,
    criticalFails,
    averageScore,
    byAgent,
    results,
  };
}

export function printSummary(summary: RunSummary): void {
  console.log();
  console.log(
    `${c.bold}${c.cyan}╔════════════════════════════════════════════╗${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}║        EVAL RESULTS — ${summary.runId.slice(-12).padEnd(20)}║${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}╚════════════════════════════════════════════╝${c.reset}`
  );
  console.log();

  // Per-case results
  for (const r of summary.results) {
    const sc = `${scoreColor(r.score)}${r.score.toFixed(1)}${c.reset}`;
    const tag = badge(r.passed, r.criticalFail);
    const type = r.type === "flow" ? `${c.magenta}[flow]${c.reset}` : `${c.dim}[unit]${c.reset}`;
    const ms = `${c.dim}${r.durationMs}ms${c.reset}`;

    console.log(`  ${tag} ${type} ${c.bold}${r.caseId}${c.reset}  score=${sc}  ${ms}`);

    if (r.error) {
      console.log(`         ${c.red}ERROR: ${r.error}${c.reset}`);
    } else {
      // Print per-criterion scores
      for (const cr of r.claudeEvaluation.criteria) {
        const crColor = scoreColor(cr.score);
        console.log(
          `         ${crColor}${cr.score}/10${c.reset} ${c.dim}${cr.name}${c.reset} — ${cr.justification}`
        );
      }
      if (r.claudeEvaluation.suggestions) {
        console.log(
          `         ${c.yellow}↳ ${r.claudeEvaluation.suggestions}${c.reset}`
        );
      }
    }
    console.log();
  }

  // Per-agent summary table
  console.log(`${c.bold}By agent:${c.reset}`);
  for (const [agent, stats] of Object.entries(summary.byAgent)) {
    const bar = "█".repeat(Math.round(stats.averageScore));
    console.log(
      `  ${c.bold}${agent.padEnd(14)}${c.reset} ${scoreColor(stats.averageScore)}${stats.averageScore.toFixed(1)}${c.reset}  ${scoreColor(stats.averageScore)}${bar}${c.reset}  (${stats.cases} case${stats.cases !== 1 ? "s" : ""})`
    );
  }
  console.log();

  // Overall
  const overallColor = scoreColor(summary.averageScore);
  console.log(
    `  Total:   ${c.bold}${summary.totalCases}${c.reset} cases  ` +
      `${c.green}${summary.passed} passed${c.reset}  ` +
      (summary.criticalFails > 0
        ? `${c.red}${c.bold}${summary.criticalFails} CRITICAL FAIL${c.reset}  `
        : "") +
      `avg score ${overallColor}${c.bold}${summary.averageScore}${c.reset}`
  );
  console.log();
}

export function writeJsonReport(summary: RunSummary, outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const filename = `eval-${summary.runId}.json`;
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return filePath;
}
