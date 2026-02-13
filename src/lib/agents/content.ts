export function extractTextContent(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: "text"; text: string } =>
          typeof b === "object" &&
          b !== null &&
          "type" in b &&
          b.type === "text" &&
          "text" in b &&
          typeof b.text === "string"
      )
      .map((b) => b.text)
      .join("");
  }
  return String(content);
}
