"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--nav-hover-bg)]"
      style={{ color: "var(--text-secondary)" }}
    >
      {theme === "dark" ? (
        <Sun className="size-5" strokeWidth={1.75} />
      ) : (
        <Moon className="size-5" strokeWidth={1.75} />
      )}
    </button>
  );
}
