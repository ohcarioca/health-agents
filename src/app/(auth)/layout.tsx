import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Atmospheric background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: "var(--atmosphere-primary)",
        }}
      />

      {/* Glass card */}
      <div className="glass-elevated relative w-full max-w-sm rounded-2xl p-8">
        {/* Decorative accent icon */}
        <div
          className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Zap className="size-6 text-white" strokeWidth={2} />
        </div>

        {children}
      </div>
    </div>
  );
}
