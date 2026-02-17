import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  iconBg: string;
  iconColor: string;
}

export function KpiCard({ icon: Icon, label, value, subtitle, iconBg, iconColor }: KpiCardProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl border p-5"
      style={{
        backgroundColor: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="size-6" strokeWidth={1.75} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <p className="text-2xl font-bold font-mono" style={{ color: "var(--text-primary)" }}>{value}</p>
        {subtitle && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
    </div>
  );
}
