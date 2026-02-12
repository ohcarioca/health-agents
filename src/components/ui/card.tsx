interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export function Card({ children, className = "", interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${interactive ? "hover:border-[var(--border-strong)] transition-colors cursor-pointer" : ""} ${className}`}
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {children}
    </div>
  );
}
