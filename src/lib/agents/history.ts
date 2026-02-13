import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

const MAX_HISTORY_MESSAGES = 30;

interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export function buildMessages(
  systemPrompt: string,
  history: HistoryMessage[],
  userMessage: string
): BaseMessage[] {
  const trimmed =
    history.length > MAX_HISTORY_MESSAGES
      ? history.slice(history.length - MAX_HISTORY_MESSAGES)
      : history;

  return [
    new SystemMessage(systemPrompt),
    ...trimmed.map((m) => {
      switch (m.role) {
        case "user":
          return new HumanMessage(m.content);
        case "assistant":
          return new AIMessage(m.content);
        case "system":
          return new SystemMessage(m.content);
      }
    }),
    new HumanMessage(userMessage),
  ];
}
