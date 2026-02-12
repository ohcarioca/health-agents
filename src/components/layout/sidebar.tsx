"use client";

import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUserMenu } from "./sidebar-user-menu";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface SidebarProps {
  clinicName: string;
  userName: string;
  userEmail: string;
}

export function Sidebar({ clinicName, userName, userEmail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg p-2 lg:hidden"
        style={{ color: "var(--text-primary)" }}
      >
        <Menu className="size-5" strokeWidth={1.75} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-200 ${
          mobileOpen
            ? "translate-x-0 w-[280px]"
            : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-16" : "lg:w-[260px]"}`}
        style={{
          backgroundColor: "var(--sidebar-bg)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          borderColor: "var(--glass-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-4"
          style={{ borderColor: "var(--glass-border)" }}
        >
          {!collapsed && (
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {clinicName}
            </span>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 lg:hidden"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-1 transition-colors hover:bg-[var(--nav-hover-bg)] lg:block"
            style={{ color: "var(--text-muted)" }}
          >
            {collapsed ? (
              <PanelLeft className="size-5" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav collapsed={collapsed} />
        </div>

        {/* Bottom: locale + theme + user */}
        <div className="space-y-2">
          {!collapsed && (
            <div className="flex items-center justify-between px-4">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          )}
          <SidebarUserMenu
            collapsed={collapsed}
            userName={userName}
            userEmail={userEmail}
          />
        </div>
      </aside>
    </>
  );
}
