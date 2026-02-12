"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface SidebarUserMenuProps {
  collapsed: boolean;
  userName: string;
  userEmail: string;
}

export function SidebarUserMenu({
  collapsed,
  userName,
  userEmail,
}: SidebarUserMenuProps) {
  return (
    <div
      className="border-t px-3 py-3"
      style={{ borderColor: "var(--glass-border)" }}
    >
      <div
        className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}
      >
        <Avatar name={userName} size="sm" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
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
        )}
        {!collapsed && (
          <Link
            href="/settings"
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--nav-hover-bg)]"
            style={{ color: "var(--text-muted)" }}
          >
            <Settings className="size-4" strokeWidth={1.75} />
          </Link>
        )}
      </div>
    </div>
  );
}
