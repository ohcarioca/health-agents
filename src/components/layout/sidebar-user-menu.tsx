"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";

interface SidebarUserMenuProps {
  collapsed: boolean;
  userName: string;
  userEmail: string;
}

export function SidebarUserMenu({ collapsed, userName, userEmail }: SidebarUserMenuProps) {
  const router = useRouter();
  const t = useTranslations("common");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
      <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
        <Avatar name={userName} size="sm" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {userName}
            </p>
            <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {userEmail}
            </p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={handleLogout}
            className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
            style={{ color: "var(--text-muted)" }}
            title={t("logout")}
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
