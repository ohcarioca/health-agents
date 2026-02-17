import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
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
