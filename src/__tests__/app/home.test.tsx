import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/layout/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

import DashboardPage from "@/app/(dashboard)/page";

describe("DashboardPage", () => {
  it("renders dashboard title", () => {
    render(<DashboardPage />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders kpi cards", () => {
    render(<DashboardPage />);
    expect(screen.getByText("kpi.appointments")).toBeInTheDocument();
    expect(screen.getByText("kpi.confirmations")).toBeInTheDocument();
    expect(screen.getByText("kpi.noShows")).toBeInTheDocument();
    expect(screen.getByText("kpi.nps")).toBeInTheDocument();
  });
});
