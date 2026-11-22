"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DemoAccount } from "@/lib/demo/accounts";
import { canRunPeopleRefresh, canViewOrganisationLoad, roleLabels } from "@/lib/auth/permissions";
import { MotionToggle } from "@/components/MotionToggle";

export function AppShell({
  account,
  children,
}: {
  account: DemoAccount;
  children: ReactNode;
}) {
  const router = useRouter();
  const navItems = [
    { label: "Overview", href: "/home", visible: true },
    { label: "My bookings", href: "/home#bookings", visible: true },
    { label: "Team load", href: "/home#team", visible: account.derivedRoles.includes("line_manager") },
    { label: "My projects", href: "/home#projects", visible: account.derivedRoles.includes("project_lead") },
    { label: "Leadership", href: "/home#organisation", visible: canViewOrganisationLoad(account) },
    { label: "People refresh", href: "/home#refresh", visible: canRunPeopleRefresh(account) },
  ].filter((item) => item.visible);

  async function switchAccount() {
    await fetch("/api/demo-session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link className="wordmark" href="/home" aria-label="Resourcing Radar home">
          <span className="wordmark-mark" aria-hidden="true">R</span>
          <span>Resourcing Radar</span>
        </Link>
        <div className="topbar-actions">
          <span className="demo-pill">Demo</span>
          <MotionToggle />
          <button className="text-button" onClick={switchAccount} type="button">
            Switch account
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar" aria-label="Main navigation">
          <div className="sidebar-label">Workspace</div>
          <nav className="side-nav">
            {navItems.map((item, index) => (
              <Link className={index === 0 ? "side-link active" : "side-link"} href={item.href} key={item.href}>
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
