"use client";

import { useState, useEffect, useCallback } from "react";
import { PanelLeftClose, PanelLeft, Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { ClinicStatusToggle } from "./clinic-status-toggle";

interface SidebarProps {
  clinicName: string;
  isActive: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function Sidebar({ clinicName, isActive, onCollapseChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("sidebar-collapsed") === "true"
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const updateCollapsed = useCallback(
    (value: boolean) => {
      setCollapsed(value);
      onCollapseChange?.(value);
    },
    [onCollapseChange]
  );

  // Notify parent of initial collapsed state on mount
  useEffect(() => {
    if (collapsed) {
      onCollapseChange?.(collapsed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    updateCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg p-2 lg:hidden"
        style={{ color: "var(--text-primary)" }}
      >
        <Menu className="size-5" strokeWidth={1.75} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-200 ${
          mobileOpen
            ? "translate-x-0 w-[240px]"
            : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-16" : "lg:w-[240px]"}`}
        style={{
          backgroundColor: "var(--sidebar-bg)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex h-16 items-center justify-between border-b px-4"
          style={{ borderColor: "var(--border)" }}
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

        {/* Activation toggle */}
        <div
          className="border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <ClinicStatusToggle initialActive={isActive} collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}
