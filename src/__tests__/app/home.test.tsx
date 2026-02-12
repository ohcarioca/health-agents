import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "@/app/(dashboard)/page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: "Dashboard",
      "kpi.appointments": "Appointments today",
      "kpi.confirmations": "Pending confirmations",
      "kpi.noShows": "No-shows",
      "kpi.nps": "Average NPS",
      funnel: "Conversion funnel",
      alerts: "Recent alerts",
    };
    return messages[key] ?? key;
  },
}));

describe("DashboardPage", () => {
  it("renders the title", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders the kpi labels", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Appointments today")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmations")).toBeInTheDocument();
    expect(screen.getByText("No-shows")).toBeInTheDocument();
    expect(screen.getByText("Average NPS")).toBeInTheDocument();
  });

  it("renders the funnel and alerts sections", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Conversion funnel")).toBeInTheDocument();
    expect(screen.getByText("Recent alerts")).toBeInTheDocument();
  });
});
