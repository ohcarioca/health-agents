type CardVariant = "solid" | "glass";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  variant?: CardVariant;
}

export function Card({
  children,
  className = "",
  interactive = false,
  variant = "solid",
}: CardProps) {
  const isGlass = variant === "glass";

  return (
    <div
      className={`rounded-xl p-5 ${
        isGlass ? "glass" : "border"
      } ${
        interactive
          ? "hover:border-[var(--glass-border-hover)] transition-all cursor-pointer"
          : ""
      } ${className}`}
      style={
        isGlass
          ? undefined
          : {
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
            }
      }
    >
      {children}
    </div>
  );
}
