import { PageContainer } from "@/components/layout/page-container";

export default function DashboardNotFound() {
  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          404
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Page not found
        </p>
      </div>
    </PageContainer>
  );
}
