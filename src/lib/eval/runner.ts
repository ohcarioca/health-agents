import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvalScenario, ScenarioResult, TurnResult } from "./types";
import { seedFixtures, cleanupFixtures, type SeededData } from "./fixtures";
import { checkTurn, checkAssertions } from "./checker";
import { judgeResponse } from "./judge";

// Import from barrel to ensure agent side-effect registration
import { processMessage } from "@/lib/agents";

interface RunScenarioOptions {
  supabase: SupabaseClient;
  scenario: EvalScenario;
  verbose?: boolean;
}

export async function runScenario(options: RunScenarioOptions): Promise<ScenarioResult> {
  const { supabase, scenario, verbose } = options;
  const startTime = Date.now();

  let seededData: SeededData | null = null;
  let conversationId = "";

  try {
    // 1. Seed fixtures
    seededData = await seedFixtures(supabase, scenario);

    if (verbose) {
      console.log(`  Seeded: clinic=${seededData.clinicId}, patient=${seededData.patientId}`);
    }

    // 2. Run each turn
    const turnResults: TurnResult[] = [];

    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i];
      const externalId = `eval-${scenario.id}-${i}-${Date.now()}`;

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Patient: "${turn.user}"`);
      }

      // Call real processMessage
      const result = await processMessage({
        phone: scenario.persona.phone,
        message: turn.user,
        externalId,
        clinicId: seededData.clinicId,
      });

      conversationId = result.conversationId;

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Agent: "${result.responseText.slice(0, 120)}..."`);
        console.log(`    [Turn ${i + 1}] Tools: [${result.toolCallNames.join(", ")}]`);
      }

      // Deterministic checks
      const checkResult = checkTurn(
        turn.expect,
        result.toolCallNames,
        result.responseText
      );

      // LLM judge
      const judgeResult = await judgeResponse({
        agentType: scenario.agent,
        userMessage: turn.user,
        agentResponse: result.responseText,
        toolsCalled: result.toolCallNames,
        expectedBehavior: turn.expect,
        personaName: scenario.persona.name,
        turnIndex: i,
      });

      if (verbose) {
        console.log(`    [Turn ${i + 1}] Score: ${judgeResult.overall}/10`);
        if (checkResult.failures.length > 0) {
          console.log(`    [Turn ${i + 1}] FAILURES: ${checkResult.failures.join("; ")}`);
        }
      }

      turnResults.push({
        turnIndex: i,
        userMessage: turn.user,
        agentResponse: result.responseText,
        toolCallNames: result.toolCallNames,
        toolCallCount: result.toolCallCount,
        checkResult,
        judgeResult,
      });
    }

    // 3. Final assertions
    const assertionResult = await checkAssertions(
      supabase,
      scenario.assertions,
      seededData.clinicId,
      seededData.patientId,
      conversationId
    );

    // 4. Calculate overall score
    const judgeScores = turnResults.map((t) => t.judgeResult.overall);
    const avgJudgeScore =
      judgeScores.length > 0
        ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length
        : 0;

    // Penalize for deterministic failures
    const deterministicFailures = turnResults.filter((t) => !t.checkResult.passed).length;
    const assertionFailures = assertionResult.failures.length;
    const penalty = (deterministicFailures + assertionFailures) * 1.5;
    const overallScore = Math.max(0, Math.min(10, avgJudgeScore - penalty));

    // Determine status
    const status: ScenarioResult["status"] =
      overallScore < 5 || deterministicFailures > 0 || assertionFailures > 0
        ? "fail"
        : overallScore < 7
          ? "warn"
          : "pass";

    return {
      scenarioId: scenario.id,
      agent: scenario.agent,
      description: scenario.description,
      turnResults,
      assertionResult,
      overallScore: Math.round(overallScore * 10) / 10,
      status,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // 5. Always cleanup
    if (seededData) {
      await cleanupFixtures(supabase, seededData.clinicId);
    }
  }
}
