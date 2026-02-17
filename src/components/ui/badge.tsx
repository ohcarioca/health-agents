type BadgeVariant = "success" | "warning" | "danger" | "accent" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-[rgba(34,197,94,0.1)] text-[var(--success)]",
  warning: "bg-[rgba(245,158,11,0.1)] text-[var(--warning)]",
  danger: "bg-[rgba(239,68,68,0.1)] text-[var(--danger)]",
  accent: "bg-[rgba(139,92,246,0.1)] text-[var(--accent)]",
  neutral: "bg-[var(--nav-hover-bg)] text-[var(--text-muted)]",
};

export function Badge({ children, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
