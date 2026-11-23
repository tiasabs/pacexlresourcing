"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import type { DemoAccount } from "@/lib/demo/accounts";
import { canRunPeopleRefresh, canViewAllBookings, canViewOrganisationLoad, roleLabels } from "@/lib/auth/permissions";

export function AppShell({
  account,
  children,
}: {
  account: DemoAccount;
  children: ReactNode;
}) {
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const pathname = usePathname();
  const navItems = [
    { label: "Overview", href: "/home", visible: true },
    { label: "My bookings", href: "/bookings", visible: true },
    { label: "Team bookings", href: "/team", visible: account.derivedRoles.includes("line_manager") || canViewAllBookings(account) },
    { label: "Project bookings", href: "/projects", visible: account.derivedRoles.includes("project_lead") || canViewAllBookings(account) },
    { label: "Utilisation", href: "/leadership", visible: canViewOrganisationLoad(account) },
    { label: "People and leave", href: "/hr", visible: canRunPeopleRefresh(account) },
  ].filter((item) => item.visible);

  async function switchAccount() {
    if (switching) return;
    setSwitching(true);
    setSwitchError("");
    try {
      const response = await fetch("/api/demo-session", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error("The demo session could not be cleared.");
      window.location.replace("/");
    } catch {
      setSwitching(false);
      setSwitchError("We couldn't switch accounts. Please try again.");
    }
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link className="wordmark" href="/home" aria-label="Resourcing Radar home">
          <span className="wordmark-mark" aria-hidden="true">R</span>
          <span>Resourcing Radar</span>
        </Link>
        <div className="topbar-actions">
          <span className="topbar-greeting">Hi, {account.firstName}</span>
          <span className="demo-pill">Demo</span>
          <button className="text-button" disabled={switching} onClick={switchAccount} type="button">
            {switching ? "Switching…" : "Switch account"}
          </button>
        </div>
      </header>
      {switchError && <p className="switch-error" role="alert">{switchError}</p>}
      <div className="app-body">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="sidebar-label">Workspace</div>
          <nav className="side-nav">
            {navItems.map((item, index) => (
              <Link className={pathname === item.href ? "side-link active" : "side-link"} href={item.href} key={item.href}>
                <span className="nav-dot" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-spacer" />
          <div className="sidebar-note">
            <span className="eyebrow">Current account</span>
            <strong>{account.label}</strong>
            <div className="role-chip-list">
              {roleLabels(account).map((role) => (
                <span className="role-chip" key={role}>{role}</span>
              ))}
            </div>
          </div>
        </aside>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
