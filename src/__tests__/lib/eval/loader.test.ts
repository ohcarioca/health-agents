// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadScenarios, loadScenarioFile } from "@/lib/eval/loader";
import * as fs from "node:fs";

vi.mock("node:fs");

const VALID_YAML = `
id: test-scenario
agent: support
locale: pt-BR
description: "Test scenario"
persona:
  name: Maria
  phone: "11999998888"
turns:
  - user: "Oi"
    expect: {}
`;

const INVALID_YAML = `
id: test-scenario
agent: invalid_type
`;

describe("scenario loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadScenarioFile", () => {
    it("parses valid YAML and returns EvalScenario", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);
      const result = loadScenarioFile("/fake/path.yaml");
      expect(result.id).toBe("test-scenario");
      expect(result.agent).toBe("support");
      expect(result.turns).toHaveLength(1);
    });

    it("throws on invalid scenario schema", () => {
      vi.mocked(fs.readFileSync).mockReturnValue(INVALID_YAML);
      expect(() => loadScenarioFile("/fake/path.yaml")).toThrow();
    });
  });

  describe("loadScenarios", () => {
    it("loads all YAML files from scenario directories", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith("scenarios")) {
          return ["support"] as unknown as fs.Dirent[];
        }
        return ["test.yaml"] as unknown as fs.Dirent[];
      });
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);

      const scenarios = loadScenarios();
      expect(scenarios.length).toBeGreaterThan(0);
    });

    it("filters by agent when specified", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.endsWith("scenarios")) {
          return ["support", "scheduling"] as unknown as fs.Dirent[];
        }
        return ["test.yaml"] as unknown as fs.Dirent[];
      });
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);

      const scenarios = loadScenarios({ agent: "support" });
      // All loaded scenarios should have agent matching filter
      for (const s of scenarios) {
        expect(s.agent).toBe("support");
      }
    });
  });
});
