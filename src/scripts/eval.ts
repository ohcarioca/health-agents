import { createClient } from "@supabase/supabase-js";
import { loadScenarios } from "../lib/eval/loader";
import { runScenario } from "../lib/eval/runner";
import { analyzeResults } from "../lib/eval/analyst";
import { printResults, printVerboseTranscript, saveReport } from "../lib/eval/reporter";
import type { ScenarioResult, EvalCliOptions } from "../lib/eval/types";

// Import agent barrel to trigger side-effect registrations.
import "../lib/agents";

function parseArgs(): EvalCliOptions {
  const args = process.argv.slice(2);
  const options: EvalCliOptions = {
    verbose: false,
    failThreshold: 5.0,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--agent":
        options.agent = args[++i];
        break;
      case "--scenario":
        options.scenario = args[++i];
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--threshold":
        options.failThreshold = parseFloat(args[++i]);
        break;
      case "--max-turns":
        options.maxTurns = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Validate env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }
  if (!claudeKey) {
    console.error("Missing CLAUDE_API_KEY (required for judge + analyst)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const scenarios = loadScenarios({
    agent: options.agent,
    scenario: options.scenario,
  });

  if (scenarios.length === 0) {
    console.log("No scenarios found matching filters.");
    process.exit(0);
  }

  console.log(`Loaded ${scenarios.length} scenario(s). Running conversational eval...\n`);
  console.log(`  Patient: OpenAI (${process.env.OPENAI_MODEL ?? "gpt-5-mini"})`);
  console.log(`  Judge:   Claude (${process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514"})`);
  console.log("");

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    if (options.verbose) {
      console.log(`\n--- ${scenario.id} (${scenario.agent}) ---`);
    }

    const result = await runScenario({
      supabase,
      scenario,
      verbose: options.verbose,
      maxTurnsOverride: options.maxTurns,
    });

    results.push(result);

    if (options.verbose) {
      printVerboseTranscript(result);
    } else {
      const icon = result.status === "pass" ? "." : result.status === "warn" ? "W" : "F";
      process.stdout.write(icon);
    }
  }

  if (!options.verbose) {
    console.log("");
  }

  // Analyze failures
  const proposals = await analyzeResults(results);

  // Report
  printResults(results, proposals);
  saveReport(results, proposals);

  // Exit code
  const hasFail = results.some((r) => r.status === "fail");
  process.exit(hasFail ? 1 : 0);
}

main().catch((error) => {
  console.error("Eval failed:", error);
  process.exit(1);
});
