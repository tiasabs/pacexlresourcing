import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getAirtableConfigStatus } from "@/lib/airtable/config-check";
import { getAirtableReadOverview } from "@/lib/airtable/overview";
import { getDemoSession } from "@/lib/demo/session";
import {
  canViewAllBookings,
  canViewOrganisationLoad,
  canRunPeopleRefresh,
  hasAnyRole,
  roleLabels,
} from "@/lib/auth/permissions";

export default async function HomePage() {
  const account = await getDemoSession();
  if (!account) redirect("/");

  const config = await getAirtableConfigStatus();
  const roles = roleLabels(account);
  const airtableOverview = canViewAllBookings(account) && config.connected
    ? await getAirtableReadOverview().catch(() => null)
    : null;
  const isAdmin = canViewAllBookings(account);
  const functionCards = [
    { title: "My bookings", detail: "See your bookings, check weekly hours and send a request for work agreed offline.", href: "/bookings", visible: true },
    { title: "Log actual hours", detail: "Record this week’s hours against your project milestones.", href: "/actuals", visible: true },
    { title: "Team bookings", detail: "Review your own bookings and those of your direct reports.", href: "/team", visible: isAdmin || hasAnyRole(account, ["line_manager"]) },
    { title: "Project bookings", detail: "Create projects, manage milestones and book people.", href: "/projects", visible: isAdmin || hasAnyRole(account, ["project_lead"]) },
    { title: "Demo accounts", detail: "Manage demo personas and their manually assigned roles.", href: "/accounts", visible: isAdmin },
    { title: "Quarterly utilisation", detail: "See named quarterly booked hours, capacity and peak weekly load.", href: "/leadership", visible: canViewOrganisationLoad(account) },
    { title: "People and leave", detail: "View People records, upload HR snapshots and review planned leave.", href: "/hr", visible: canRunPeopleRefresh(account) },
  ].filter((item) => item.visible);

  return (
    <AppShell account={account}>
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Resourcing overview</p>
          <h1>Hi, {account.firstName}</h1>
          <p className="dashboard-lede">Your workload, bookings and team activity.</p>
        </div>
        <div className="current-role-card">
          <span className="eyebrow">Viewing as</span>
          <strong>{account.title}</strong>
          <div className="role-chip-list">
            {roles.map((role) => <span className="role-chip" key={role}>{role}</span>)}
          </div>
        </div>
      </section>

      <section className="home-functions" aria-labelledby="home-functions-title">
        <div className="data-overview-heading"><div><p className="eyebrow">Available to you</p><h2 id="home-functions-title">Your functions</h2></div></div>
        <div className="home-function-grid">
          {functionCards.map((item) => <a className="home-function-card" href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.detail}</span><span className="home-function-arrow" aria-hidden="true">↗</span></a>)}
        </div>
      </section>

      {canViewAllBookings(account) && config.connected && (
        <section className="data-overview" aria-labelledby="data-overview-title">
          <div className="data-overview-heading">
            <div>
              <p className="eyebrow">Read-only Airtable data</p>
              <h2 id="data-overview-title">Current base snapshot</h2>
            </div>
            <span className="notice-tag">Admin view</span>
          </div>
          {airtableOverview ? (
            <>
              <dl className="data-count-grid">
                {airtableOverview.tableCounts.map(({ label, count }) => (
                  <div className="data-count-card" key={label}>
                    <dt>{label}</dt>
                    <dd>{count}</dd>
                    <span>records</span>
                  </div>
                ))}
              </dl>
              <p className="data-freshness">
                People and leave last refreshed: {airtableOverview.peopleLastSeenInHrFile
                  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                      new Date(airtableOverview.peopleLastSeenInHrFile),
                    )
                  : "No HR file date recorded"}
              </p>
            </>
          ) : (
            <p className="data-freshness" role="status">
              Airtable is reachable, but records could not be read. Check that the token includes record read access.
            </p>
          )}
        </section>
      )}

    </AppShell>
  );
}
