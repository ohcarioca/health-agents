export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
