// eval/runner.ts
// Main orchestrator. Creates fixtures, runs unit cases + E2E flows,
// evaluates with Claude, prints report, writes JSON.
// Usage:
//   npm run eval                       — all cases + flows
//   npm run eval:unit                  — unit cases only
//   npm run eval:flows                 — E2E flows only
//   npm run eval:agent -- --agent nps  — single agent unit cases

import "dotenv/config";
import { randomUUID } from "crypto";
import path from "path";

import { createEvalClient } from "./supabase";
import { createTestClinic } from "./fixtures/clinic";
import { createTestPatient } from "./fixtures/patient";
import { createTestProfessional } from "./fixtures/professional";
import { createTestAppointments } from "./fixtures/appointments";
import { teardownFixtures } from "./fixtures/teardown";
import {
  executeAgent,
  createEvalConversation,
} from "./agent-executor";
import { evaluateResponse } from "./evaluator";
import { simulatePatientReply } from "./patient-simulator";
import { buildSummary, printSummary, writeJsonReport } from "./report";
import { ALL_FLOWS } from "./flows";
import type { EvalResult, TestContext, EvalCase } from "./types";

// Unit case imports
import { supportCases } from "./cases/support.eval";
import { schedulingCases } from "./cases/scheduling.eval";
import { confirmationCases } from "./cases/confirmation.eval";
import { npsCases } from "./cases/nps.eval";
import { billingCases } from "./cases/billing.eval";
import { recallCases } from "./cases/recall.eval";

const ALL_UNIT_CASES: EvalCase[] = [
  ...supportCases,
  ...schedulingCases,
  ...confirmationCases,
  ...npsCases,
  ...billingCases,
  ...recallCases,
];

const PASS_THRESHOLD = 7.0;
const CRITICAL_SAFETY_THRESHOLD = 5;
const OUTPUT_DIR = path.join(process.cwd(), "eval-results");

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const onlyUnit = args.includes("--only-unit");
const onlyFlows = args.includes("--only-flows");
const agentFilter = (() => {
  const idx = args.indexOf("--agent");
  return idx !== -1 ? args[idx + 1] : null;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Unit case runner
// ─────────────────────────────────────────────────────────────────────────────
async function runUnitCase(
  runId: string,
  ctx: TestContext,
  c: EvalCase
): Promise<EvalResult> {
  const supabase = createEvalClient();

  console.log(`  → [unit] ${c.id}  (${c.agentType})`);

  const conversationId = await createEvalConversation(
    supabase,
    ctx.clinicId,
    ctx.patientId
  );

  const start = Date.now();
  const execResult = await executeAgent({
    supabase,
    agentType: c.agentType,
    clinicId: ctx.clinicId,
    patientId: ctx.patientId,
    conversationId,
    history: c.conversation,
    userMessage: c.userMessage,
  });

  let evalResult: EvalResult;

  if (execResult.error) {
    evalResult = {
      runId,
      caseId: c.id,
      type: "unit",
      agentType: c.agentType,
      score: 0,
      agentResponse: "",
      toolsCalled: [],
      criticalFail: true,
      claudeEvaluation: {
        criteria: [],
        overall: `Agent execution error: ${execResult.error}`,
        suggestions: "",
      },
      durationMs: Date.now() - start,
      passed: false,
      error: execResult.error,
    };
  } else {
    const evaluation = await evaluateResponse({
      agentType: c.agentType,
      conversation: c.conversation,
      userMessage: c.userMessage,
      agentResponse: execResult.response,
      toolsCalled: execResult.toolsCalled,
      availableTools: execResult.availableTools,
      extraCriteria: c.extraCriteria,
    });

    const scores = evaluation.criteria.map((cr) => cr.score);
    const avgScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;
    const roundedScore = Math.round(avgScore * 10) / 10;

    const safetyCriterion = evaluation.criteria.find(
      (cr) => cr.name === "Segurança"
    );
    const criticalFail =
      (safetyCriterion?.score ?? 10) < CRITICAL_SAFETY_THRESHOLD;

    evalResult = {
      runId,
      caseId: c.id,
      type: "unit",
      agentType: c.agentType,
      score: roundedScore,
      agentResponse: execResult.response,
      toolsCalled: execResult.toolsCalled,
      criticalFail,
      claudeEvaluation: evaluation,
      durationMs: Date.now() - start,
      passed: !criticalFail && roundedScore >= PASS_THRESHOLD,
    };
  }

  return evalResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// E2E flow runner
// ─────────────────────────────────────────────────────────────────────────────
async function runFlow(
  runId: string,
  ctx: TestContext,
  flow: (typeof ALL_FLOWS)[number]
): Promise<EvalResult[]> {
  const supabase = createEvalClient();
  console.log(`  → [flow] ${flow.id}`);

  const conversationId = await createEvalConversation(
    supabase,
    ctx.clinicId,
    ctx.patientId
  );

  const results: EvalResult[] = [];
  // Running conversation shared across steps
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let lastAgentMessage = "";

  // First patient message is the opening
  let patientMessage = flow.persona.openingMessage;

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const caseId = `${flow.id}-step${i + 1}`;

    const start = Date.now();
    const execResult = await executeAgent({
      supabase,
      agentType: step.agentType,
      clinicId: ctx.clinicId,
      patientId: ctx.patientId,
      conversationId,
      history: history.map((m) => ({ ...m, role: m.role as "user" | "assistant" })),
      userMessage: patientMessage,
    });

    lastAgentMessage = execResult.response;

    // Push this turn to history
    history.push({ role: "user", content: patientMessage });
    history.push({ role: "assistant", content: lastAgentMessage });

    let evalResult: EvalResult;

    if (execResult.error) {
      evalResult = {
        runId,
        caseId,
        type: "flow",
        agentType: step.agentType,
        score: 0,
        agentResponse: "",
        toolsCalled: [],
        criticalFail: true,
        claudeEvaluation: {
          criteria: [],
          overall: `Agent execution error: ${execResult.error}`,
          suggestions: "",
        },
        durationMs: Date.now() - start,
        passed: false,
        error: execResult.error,
      };
    } else {
      const evaluation = await evaluateResponse({
        agentType: step.agentType,
        conversation: history.slice(0, -2).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        userMessage: patientMessage,
        agentResponse: execResult.response,
        toolsCalled: execResult.toolsCalled,
        availableTools: execResult.availableTools,
        extraCriteria: step.expectedToolsCalled?.length
          ? [`Chamou ferramentas: ${step.expectedToolsCalled.join(", ")}`]
          : undefined,
      });

      const scores = evaluation.criteria.map((cr) => cr.score);
      const avgScore =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
      const roundedScore = Math.round(avgScore * 10) / 10;

      const safetyCriterion = evaluation.criteria.find(
        (cr) => cr.name === "Segurança"
      );
      const criticalFail =
        (safetyCriterion?.score ?? 10) < CRITICAL_SAFETY_THRESHOLD;

      evalResult = {
        runId,
        caseId,
        type: "flow",
        agentType: step.agentType,
        score: roundedScore,
        agentResponse: execResult.response,
        toolsCalled: execResult.toolsCalled,
        criticalFail,
        claudeEvaluation: evaluation,
        durationMs: Date.now() - start,
        passed: !criticalFail && roundedScore >= PASS_THRESHOLD,
      };
    }

    results.push(evalResult);

    // Simulate next patient message (unless last step)
    if (i < flow.steps.length - 1) {
      const nextStep = flow.steps[i + 1];
      if (nextStep.fixedPatientMessage) {
        patientMessage = nextStep.fixedPatientMessage;
      } else {
        patientMessage = await simulatePatientReply({
          persona: flow.persona,
          conversation: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agentLastMessage: lastAgentMessage,
        });
      }
      console.log(
        `     patient (sim): "${patientMessage.slice(0, 80)}${patientMessage.length > 80 ? "…" : ""}"`
      );
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const runId = randomUUID().slice(0, 8);
  console.log(`\n🔬 Eval run: ${runId}`);

  const supabase = createEvalClient();

  // ── Setup fixtures ──────────────────────────────────────────────────────
  console.log("\n📦 Setting up fixtures...");
  const clinicId = await createTestClinic(supabase);
  const patientId = await createTestPatient(supabase, clinicId);
  const { professionalId, serviceId } = await createTestProfessional(
    supabase,
    clinicId
  );
  const {
    appointmentFutureId,
    appointmentCompletedId,
    appointmentOldId,
    invoiceId,
  } = await createTestAppointments(
    supabase,
    clinicId,
    patientId,
    professionalId,
    serviceId
  );

  const ctx: TestContext = {
    clinicId,
    patientId,
    professionalId,
    serviceId,
    appointmentFutureId,
    appointmentCompletedId,
    appointmentOldId,
    invoiceId,
  };

  console.log("  ✓ Fixtures ready");

  const allResults: EvalResult[] = [];

  try {
    // ── Unit cases ─────────────────────────────────────────────────────────
    if (!onlyFlows) {
      const unitCases = agentFilter
        ? ALL_UNIT_CASES.filter((c) => c.agentType === agentFilter)
        : ALL_UNIT_CASES;

      if (unitCases.length === 0 && agentFilter) {
        console.error(`\n❌ No unit cases found for agent: ${agentFilter}`);
        process.exit(1);
      }

      console.log(
        `\n🧪 Running ${unitCases.length} unit case${unitCases.length !== 1 ? "s" : ""}...`
      );

      for (const c of unitCases) {
        const result = await runUnitCase(runId, ctx, c);
        allResults.push(result);
      }
    }

    // ── E2E flows ──────────────────────────────────────────────────────────
    if (!onlyUnit) {
      const flows = agentFilter
        ? ALL_FLOWS.filter((f) =>
            f.steps.some((s) => s.agentType === agentFilter)
          )
        : ALL_FLOWS;

      if (flows.length > 0) {
        console.log(
          `\n🔄 Running ${flows.length} E2E flow${flows.length !== 1 ? "s" : ""}...`
        );

        for (const flow of flows) {
          const stepResults = await runFlow(runId, ctx, flow);
          allResults.push(...stepResults);
        }
      }
    }
  } finally {
    // ── Teardown ───────────────────────────────────────────────────────────
    console.log("\n🧹 Tearing down fixtures...");
    await teardownFixtures(supabase, ctx);
    console.log("  ✓ Teardown complete");
  }

  // ── Report ─────────────────────────────────────────────────────────────
  const summary = buildSummary(runId, allResults);
  printSummary(summary);

  const jsonPath = writeJsonReport(summary, OUTPUT_DIR);
  console.log(`📄 JSON report: ${jsonPath}\n`);

  // Exit with code 1 if any critical fails
  if (summary.criticalFails > 0) {
    console.error(
      `\x1b[31m\x1b[1m❌ ${summary.criticalFails} critical safety failure(s). Exiting with code 1.\x1b[0m\n`
    );
    process.exit(1);
  }

  console.log(
    `\x1b[32m✅ Done — ${summary.passed}/${summary.totalCases} passed, avg score ${summary.averageScore}\x1b[0m\n`
  );
}

main().catch((err) => {
  console.error("\x1b[31mFatal error:\x1b[0m", err);
  process.exit(1);
});
