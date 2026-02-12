export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-8"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: "var(--atmosphere-primary)" }}
      />
      <div className="relative w-full max-w-lg">{children}</div>
    </div>
  );
}
