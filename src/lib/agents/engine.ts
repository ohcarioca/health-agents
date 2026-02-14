import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { extractTextContent } from "./content";
import type {
  AgentTypeConfig,
  ToolCallContext,
  EngineResult,
} from "./types";

const MAX_ITERATIONS = 5;

interface ChatWithToolLoopOptions {
  model?: string;
  messages: BaseMessage[];
  tools: StructuredToolInterface[];
  agentConfig: AgentTypeConfig;
  toolCallContext: ToolCallContext;
  maxIterations?: number;
}

export async function chatWithToolLoop(
  options: ChatWithToolLoopOptions
): Promise<EngineResult> {
  const {
    messages,
    tools,
    agentConfig,
    toolCallContext,
    maxIterations = MAX_ITERATIONS,
  } = options;

  const modelName = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const llm = new ChatOpenAI({
    model: modelName,
    maxRetries: 2,
  });

  const llmWithTools = tools.length > 0 ? llm.bindTools(tools) : llm;

  const runningMessages = [...messages];
  let toolCallCount = 0;
  const toolCallNames: string[] = [];
  let appendToResponse: string | undefined;
  let newConversationStatus: string | undefined;
  let responseData: Record<string, unknown> | undefined;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await llmWithTools.invoke(runningMessages);

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = extractTextContent(response.content);
      return {
        responseText: text,
        appendToResponse,
        newConversationStatus,
        responseData,
        toolCallCount,
        toolCallNames,
      };
    }

    // Append the AI message with tool calls
    runningMessages.push(
      new AIMessage({
        content: response.content,
        tool_calls: toolCalls,
      })
    );

    // Execute each tool call
    for (const tc of toolCalls) {
      toolCallCount++;
      toolCallNames.push(tc.name);

      const result = await agentConfig.handleToolCall(
        { name: tc.name, args: (tc.args ?? {}) as Record<string, unknown> },
        toolCallContext
      );

      // Accumulate side effects
      if (result.appendToResponse) {
        appendToResponse = appendToResponse
          ? `${appendToResponse}\n${result.appendToResponse}`
          : result.appendToResponse;
      }
      if (result.newConversationStatus) {
        newConversationStatus = result.newConversationStatus;
      }
      if (result.responseData) {
        responseData = { ...responseData, ...result.responseData };
      }

      // Feed tool result back to LLM
      runningMessages.push(
        new ToolMessage({
          content: result.result ?? "",
          tool_call_id: tc.id ?? tc.name,
        })
      );
    }
  }

  // Max iterations reached — extract whatever the LLM last said
  const lastAiMessage = runningMessages
    .filter((m): m is AIMessage => m instanceof AIMessage)
    .pop();

  return {
    responseText: lastAiMessage
      ? extractTextContent(lastAiMessage.content)
      : "I was unable to complete this request. Please try again.",
    appendToResponse,
    newConversationStatus,
    responseData,
    toolCallCount,
    toolCallNames,
  };
}
