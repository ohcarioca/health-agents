interface WhatsAppMessage {
  text: string;
  type: "incoming" | "outgoing";
  time?: string;
}

interface WhatsAppMockupProps {
  contactName: string;
  contactEmoji?: string;
  messages: WhatsAppMessage[];
  className?: string;
}

export function WhatsAppMockup({
  contactName,
  contactEmoji = "🏥",
  messages,
  className = "",
}: WhatsAppMockupProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-2xl ${className}`}
      style={{ maxWidth: 320, fontFamily: "var(--font-landing)" }}
    >
      {/* Phone notch + status bar */}
      <div
        className="relative flex flex-col"
        style={{ backgroundColor: "#075e54", borderRadius: "24px 24px 0 0" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-xs font-medium text-white/80">9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {[3, 2.5, 2, 1.5].map((h, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-white/80"
                  style={{ height: `${h * 3}px` }}
                />
              ))}
            </div>
            <svg className="size-3 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1.5 8.5a13 13 0 0 1 21 0M5.5 12.5a8 8 0 0 1 13 0M9 16.5a4 4 0 0 1 6 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            <svg className="size-3 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M16 11l4-2v6l-4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
        </div>

        {/* Contact header */}
        <div className="flex items-center gap-3 px-4 py-2 pb-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            {contactEmoji}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{contactName}</p>
            <p className="text-xs text-white/60">online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex flex-col gap-2 p-3"
        style={{
          backgroundColor: "#ece5dd",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c5b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          minHeight: 200,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.type === "outgoing" ? "justify-end" : "justify-start"}`}
            style={{
              animation: `lp-fade-up 0.4s ease both`,
              animationDelay: `${i * 0.15 + 0.3}s`,
            }}
          >
            <div
              className="relative max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm"
              style={{
                backgroundColor:
                  msg.type === "outgoing" ? "#dcf8c6" : "#ffffff",
                borderRadius:
                  msg.type === "outgoing"
                    ? "12px 2px 12px 12px"
                    : "2px 12px 12px 12px",
                color: "#111",
                whiteSpace: "pre-line",
              }}
            >
              {msg.text}
              <span
                className="ml-2 inline-block text-[10px]"
                style={{ color: "#999", verticalAlign: "bottom" }}
              >
                {msg.time ?? "09:41"}
                {msg.type === "outgoing" && (
                  <span className="ml-0.5" style={{ color: "#53bdeb" }}>✓✓</span>
                )}
              </span>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex justify-start">
          <div
            className="flex items-center gap-1 rounded-xl px-3 py-2.5 shadow-sm"
            style={{ backgroundColor: "#ffffff", borderRadius: "2px 12px 12px 12px" }}
          >
            {[0, 0.2, 0.4].map((delay, i) => (
              <div
                key={i}
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: "#999",
                  animation: `lp-typing 1.2s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: "#f0f0f0", borderRadius: "0 0 24px 24px" }}
      >
        <div
          className="flex flex-1 items-center rounded-full bg-white px-3 py-1.5"
        >
          <span className="text-xs text-gray-400">Digite uma mensagem</span>
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "#075e54" }}
        >
          <svg className="size-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
