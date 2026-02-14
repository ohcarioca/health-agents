import { describe, it, expect } from "vitest";
import type { EngineResult, ProcessMessageResult } from "@/lib/agents";

describe("tool call tracking", () => {
  it("EngineResult type includes toolCallNames array", () => {
    const result: EngineResult = {
      responseText: "test",
      toolCallCount: 2,
      toolCallNames: ["check_availability", "book_appointment"],
    };
    expect(result.toolCallNames).toEqual([
      "check_availability",
      "book_appointment",
    ]);
  });

  it("ProcessMessageResult type includes toolCallNames array", () => {
    const result: ProcessMessageResult = {
      conversationId: "conv-1",
      responseText: "test",
      module: "scheduling",
      toolCallCount: 1,
      toolCallNames: ["check_availability"],
      queued: true,
    };
    expect(result.toolCallNames).toEqual(["check_availability"]);
  });
});
