interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  isHuman?: boolean;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  role,
  content,
  createdAt,
  isHuman,
}: MessageBubbleProps) {
  if (role === "system") {
    return (
      <div className="flex justify-center py-2">
        <span
          className="inline-block max-w-md rounded-full px-4 py-1.5 text-xs"
          style={{
            backgroundColor: "var(--nav-hover-bg)",
            color: "var(--text-muted)",
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-start" : "justify-end"} py-1`}
    >
      <div
        className="relative max-w-[75%] rounded-2xl px-4 py-2.5"
        style={
          isUser
            ? {
                backgroundColor: "var(--nav-hover-bg)",
                color: "var(--text-primary)",
              }
            : {
                backgroundColor: "var(--accent)",
                color: "#ffffff",
              }
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {content}
        </p>
        <div
          className={`mt-1 flex items-center gap-1.5 ${
            isUser ? "justify-start" : "justify-end"
          }`}
        >
          {isHuman && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "var(--accent-muted)",
                color: isUser ? "var(--text-muted)" : "rgba(255,255,255,0.8)",
              }}
            >
              human
            </span>
          )}
          <span
            className="text-[10px]"
            style={{
              color: isUser
                ? "var(--text-muted)"
                : "rgba(255,255,255,0.7)",
            }}
          >
            {formatTime(createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
