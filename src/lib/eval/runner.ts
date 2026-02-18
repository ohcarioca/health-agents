import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EvalScenario,
  ScenarioResult,
  ConversationTurn,
  TerminationReason,
} from "./types";
import { seedFixtures, cleanupFixtures, type SeededData } from "./fixtures";
import { checkGuardrails, checkToolExpectations, checkAssertions } from "./checker";
import { judgeConversation } from "./judge";
import { generatePatientMessage } from "./patient-simulator";

// Import from barrel to ensure agent side-effect registration
import { processMessage } from "@/lib/agents";

const DEFAULT_MAX_TURNS = 20;

interface RunScenarioOptions {
  supabase: SupabaseClient;
  scenario: EvalScenario;
  verbose?: boolean;
  maxTurnsOverride?: number;
}

export async function runScenario(options: RunScenarioOptions): Promise<ScenarioResult> {
  const { supabase, scenario, verbose, maxTurnsOverride } = options;
  const startTime = Date.now();
  const maxTurns = maxTurnsOverride ?? scenario.max_turns ?? DEFAULT_MAX_TURNS;

  let seededData: SeededData | null = null;
  let conversationId = "";
  let llmCalls = 0;

  try {
    // 1. Seed fixtures
    seededData = await seedFixtures(supabase, scenario);

    if (verbose) {
      console.log(`  Seeded: clinic=${seededData.clinicId}, patient=${seededData.patientId}`);
    }

    // 2. Conversation loop
    const turns: ConversationTurn[] = [];
    const allToolsCalled: string[] = [];
    const allGuardrailViolations: string[] = [];
    const allAgentResponses: string[] = [];
    const history: { role: "patient" | "agent"; content: string }[] = [];
    let terminationReason: TerminationReason = "max_turns";
    let turnIndex = 0;

    for (let i = 0; i < maxTurns; i++) {
      // 2a. Generate patient message
      const patientResult = await generatePatientMessage({
        persona: scenario.persona,
        locale: scenario.locale,
        history,
      });
      llmCalls++;

      const patientMessage = patientResult.content;

      if (verbose) {
        console.log(`    [${turnIndex + 1}] PATIENT: "${patientMessage}"`);
      }

      // Record patient turn
      turns.push({
        index: turnIndex,
        role: "patient",
        content: patientMessage,
        timestamp: Date.now() - startTime,
      });
      history.push({ role: "patient", content: patientMessage });
      turnIndex++;

      // Check if patient signaled termination before sending to agent
      if (patientResult.signal === "done") {
        terminationReason = "done";
        if (verbose) console.log(`    → Patient signaled [DONE]`);
        break;
      }
      if (patientResult.signal === "stuck") {
        terminationReason = "stuck";
        if (verbose) console.log(`    → Patient signaled [STUCK]`);
        break;
      }

      // 2b. Send to real agent pipeline
      const externalId = `eval-${scenario.id}-${i}-${Date.now()}`;
      const agentResult = await processMessage({
        phone: scenario.persona.phone,
        message: patientMessage,
        externalId,
        clinicId: seededData.clinicId,
      });
      llmCalls++;

      conversationId = agentResult.conversationId;
      const agentResponse = agentResult.responseText;
      const toolCallNames = agentResult.toolCallNames;

      if (verbose) {
        console.log(`    [${turnIndex + 1}] AGENT: "${agentResponse.slice(0, 150)}${agentResponse.length > 150 ? "..." : ""}"`);
        if (toolCallNames.length > 0) {
          console.log(`             tools: [${toolCallNames.join(", ")}]`);
        }
      }

      // Track tools
      for (const tool of toolCallNames) {
        if (!allToolsCalled.includes(tool)) {
          allToolsCalled.push(tool);
        }
      }
      allAgentResponses.push(agentResponse);

      // 2c. Guardrail check
      const guardrailResult = checkGuardrails(
        scenario.guardrails,
        toolCallNames,
        agentResponse
      );
      const violations = guardrailResult.failures;
      if (violations.length > 0) {
        allGuardrailViolations.push(...violations);
        if (verbose) {
          console.log(`             GUARDRAIL: ${violations.join("; ")}`);
        }
      }

      // Record agent turn
      turns.push({
        index: turnIndex,
        role: "agent",
        content: agentResponse,
        toolsCalled: toolCallNames,
        guardrailViolations: violations.length > 0 ? violations : undefined,
        timestamp: Date.now() - startTime,
      });
      history.push({ role: "agent", content: agentResponse });
      turnIndex++;

      // Check if agent escalated to human
      if (toolCallNames.includes("escalate_to_human") || toolCallNames.includes("escalate_billing")) {
        terminationReason = "escalated";
        if (verbose) console.log(`    → Agent escalated to human`);
        break;
      }
    }

    // 3. Post-conversation checks
    const toolExpectations = checkToolExpectations(
      scenario.expectations,
      allToolsCalled,
      allAgentResponses
    );

    const assertionResults = await checkAssertions(
      supabase,
      scenario.expectations.assertions,
      seededData.clinicId,
      seededData.patientId,
      conversationId
    );

    // Merge tool expectation failures into assertion results
    const combinedAssertions = {
      passed: toolExpectations.passed && assertionResults.passed,
      failures: [...toolExpectations.failures, ...assertionResults.failures],
    };

    // 4. Judge the full conversation
    const judge = await judgeConversation({
      scenario,
      transcript: turns,
      terminationReason,
      allToolsCalled,
    });
    llmCalls++;

    // 5. Calculate final score
    const baseScore = judge.overall;
    const guardrailPenalty = allGuardrailViolations.length * 1.5;
    const assertionPenalty = combinedAssertions.failures.length * 2.0;
    const goalPenalty = judge.goal_achieved ? 0 : 3.0;
    const totalPenalty = guardrailPenalty + assertionPenalty + goalPenalty;
    const score = Math.max(0, Math.min(10, baseScore - totalPenalty));
    const roundedScore = Math.round(score * 10) / 10;

    // 6. Determine status
    const status: ScenarioResult["status"] =
      roundedScore >= 7 && judge.goal_achieved && combinedAssertions.passed
        ? "pass"
        : roundedScore >= 5
          ? "warn"
          : "fail";

    return {
      scenario,
      turns,
      turnCount: Math.ceil(turns.length / 2),
      totalToolCalls: allToolsCalled.length,
      allToolsCalled,
      terminationReason,
      guardrailViolations: allGuardrailViolations,
      assertionResults: combinedAssertions,
      judge,
      score: roundedScore,
      status,
      durationMs: Date.now() - startTime,
      llmCalls,
    };
  } finally {
    if (seededData) {
      await cleanupFixtures(supabase, seededData.clinicId);
    }
  }
}
