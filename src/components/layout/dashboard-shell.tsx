"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface DashboardShellProps {
  clinicName: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({
  clinicName,
  userName,
  userEmail,
  children,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      <Sidebar clinicName={clinicName} onCollapseChange={setCollapsed} />
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
