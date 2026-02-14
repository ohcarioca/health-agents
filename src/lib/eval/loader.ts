import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { evalScenarioSchema, type EvalScenario } from "./types";

const SCENARIOS_DIR = path.resolve(process.cwd(), "evals", "scenarios");

export function loadScenarioFile(filePath: string): EvalScenario {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = parseYaml(content);
  const result = evalScenarioSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid scenario at ${filePath}:\n${errors}`);
  }

  return result.data;
}

interface LoadOptions {
  agent?: string;
  scenario?: string;
  scenariosDir?: string;
}

export function loadScenarios(options?: LoadOptions): EvalScenario[] {
  const baseDir = options?.scenariosDir ?? SCENARIOS_DIR;
  const scenarios: EvalScenario[] = [];

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Scenarios directory not found: ${baseDir}`);
  }

  const agentDirs = fs.readdirSync(baseDir);

  for (const agentDir of agentDirs) {
    const agentPath = path.join(baseDir, String(agentDir));
    const stat = fs.statSync(agentPath);
    if (!stat.isDirectory()) continue;

    // Filter by agent if specified
    if (options?.agent && String(agentDir) !== options.agent) continue;

    const files = fs.readdirSync(agentPath);
    for (const file of files) {
      const fileName = String(file);
      if (!fileName.endsWith(".yaml") && !fileName.endsWith(".yml")) continue;

      const filePath = path.join(agentPath, fileName);
      const scenario = loadScenarioFile(filePath);

      // Filter by scenario ID if specified
      if (options?.scenario && scenario.id !== options.scenario) continue;

      scenarios.push(scenario);
    }
  }

  return scenarios;
}
