import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: "Órbita",
      subtitle: "Healthcare agent platform",
    };
    return messages[key] ?? key;
  },
}));

describe("HomePage", () => {
  it("renders the title", () => {
    render(<HomePage />);
    expect(screen.getByText("Órbita")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<HomePage />);
    expect(screen.getByText("Healthcare agent platform")).toBeInTheDocument();
  });
});
