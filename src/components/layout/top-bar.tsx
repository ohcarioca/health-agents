"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Bell, ChevronDown, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { Avatar } from "@/components/ui/avatar";

interface TopBarProps {
  userName: string;
  userEmail: string;
  collapsed: boolean;
}

export function TopBar({ userName, userEmail, collapsed }: TopBarProps) {
  const t = useTranslations("topBar");
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleMouseDown);
    }
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [dropdownOpen]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header
      className={`fixed top-0 right-0 z-40 flex h-16 items-center justify-between border-b px-4 sm:px-6 ${
        collapsed ? "left-0 lg:left-16" : "left-0 lg:left-[240px]"
      }`}
      style={{
        backgroundColor: "var(--background)",
        borderColor: "var(--border)",
      }}
    >
      {/* Search */}
      <div className="relative max-w-md flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
          strokeWidth={1.75}
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder={t("searchPlaceholder")}
          className="h-9 w-full rounded-lg border pl-9 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--accent-ring)]"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <LocaleSwitcher />

        {/* Notifications */}
        <button
          className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-[var(--nav-hover-bg)]"
          style={{ color: "var(--text-secondary)" }}
          aria-label={t("notifications")}
        >
          <Bell className="size-5" strokeWidth={1.75} />
        </button>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
          >
            <Avatar name={userName} size="sm" />
            <span
              className="hidden text-sm font-medium sm:block"
              style={{ color: "var(--text-primary)" }}
            >
              {userName}
            </span>
            <ChevronDown
              className="hidden size-4 sm:block"
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)" }}
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-56 rounded-lg border py-1 shadow-lg"
              style={{
                backgroundColor: "var(--surface-elevated)",
                borderColor: "var(--border)",
              }}
            >
              {/* User info header */}
              <div
                className="border-b px-3 py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <p
                  className="truncate text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {userName}
                </p>
                <p
                  className="truncate text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {userEmail}
                </p>
              </div>

              {/* Settings link */}
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <Settings className="size-4" strokeWidth={1.75} />
                {t("settings")}
              </Link>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--nav-hover-bg)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                {t("signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
