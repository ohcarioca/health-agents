"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  UserRound,
  CreditCard,
  Blocks,
  BarChart3,
  Globe,
  Settings,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/inbox", icon: MessageSquare, labelKey: "nav.inbox" },
  { href: "/calendar", icon: CalendarDays, labelKey: "nav.calendar" },
  { href: "/patients", icon: UserRound, labelKey: "nav.patients" },
  { href: "/payments", icon: CreditCard, labelKey: "nav.payments" },
  { href: "/modules", icon: Blocks, labelKey: "nav.modules" },
  { href: "/reports", icon: BarChart3, labelKey: "nav.reports" },
  { href: "/public-page", icon: Globe, labelKey: "nav.publicPage" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

interface SidebarNavProps {
  collapsed: boolean;
}

export function SidebarNav({ collapsed }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <Tooltip.Provider delayDuration={0}>
      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const label = t(item.labelKey);

          const linkContent = (
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip.Root key={item.href}>
                <Tooltip.Trigger asChild>{linkContent}</Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={8}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--surface-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {label}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>
    </Tooltip.Provider>
  );
}
