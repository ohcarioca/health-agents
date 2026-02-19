"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface DashboardShellProps {
  clinicName: string;
  userName: string;
  userEmail: string;
  isActive: boolean;
  children: React.ReactNode;
}

export function DashboardShell({
  clinicName,
  userName,
  userEmail,
  isActive,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("sidebar-collapsed") === "true"
  );

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      <Sidebar clinicName={clinicName} isActive={isActive} onCollapseChange={setCollapsed} />
      <TopBar
        userName={userName}
        userEmail={userEmail}
        collapsed={collapsed}
      />
      <main
        className={`min-h-screen pt-16 transition-all duration-200 ${
          collapsed ? "lg:pl-16" : "lg:pl-[240px]"
        }`}
      >
        <div className="relative">{children}</div>
      </main>
    </div>
  );
}
