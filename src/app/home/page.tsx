import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getAirtableConfigStatus } from "@/lib/airtable/config-check";
import { getAirtableReadOverview } from "@/lib/airtable/overview";
import { getDemoSession } from "@/lib/demo/session";
import {
  canRunPeopleRefresh,
  canViewAllBookings,
  canViewOrganisationLoad,
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

  return (
    <AppShell account={account}>
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Good to have you here</p>
          <h1>Resourcing overview</h1>
          <p className="dashboard-lede">
            A shared view of current people, projects, bookings and capacity.
          </p>
        </div>
        <div className="current-role-card">
          <span className="eyebrow">Viewing as</span>
          <strong>{account.title}</strong>
          <div className="role-chip-list">
            {roles.map((role) => <span className="role-chip" key={role}>{role}</span>)}
          </div>
        </div>
      </section>

      <section className="notice-card" aria-live="polite">
        <span className={config.connected ? "status-mark success" : "status-mark pending"} aria-hidden="true" />
        <div>
          <strong>{config.connected ? "Airtable connection is ready" : "Airtable setup is incomplete"}</strong>
          <p>{config.message}</p>
        </div>
        <span className="notice-tag">Foundation check</span>
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
                People last seen in an HR file: {airtableOverview.peopleLastSeenInHrFile
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

      <section className="overview-grid" aria-label="Resourcing summary">
        <article className="overview-card" id="bookings">
          <span className="eyebrow">Your workspace</span>
          <h2>Bookings</h2>
          <p>Bookings will show here once App Accounts and the read layer are connected.</p>
          <span className="card-footnote">Planned foundation module</span>
        </article>
        {canViewOrganisationLoad(account) && (
          <article className="overview-card warm-card" id="organisation">
            <span className="eyebrow">Organisation view</span>
            <h2>Load and trends</h2>
            <p>Leadership summaries will use named load status and quarterly trends.</p>
            <span className="card-footnote">Visible to Admin and C-Suite</span>
          </article>
        )}
        {canRunPeopleRefresh(account) && (
          <article className="overview-card" id="refresh">
            <span className="eyebrow">Data operations</span>
            <h2>People and leave refresh</h2>
            <p>Review People and planned leave, then validate and commit a weekly HR snapshot.</p>
            <Link className="text-button hr-open-link" href="/hr">Open HR refresh</Link>
            <span className="card-footnote">Visible to HR and Admin</span>
          </article>
        )}
        {account.derivedRoles.includes("line_manager") && (
          <article className="overview-card warm-card" id="team">
            <span className="eyebrow">Your line</span>
            <h2>Direct reports</h2>
            <p>Team load will show direct reports only, with detailed bookings for follow-up.</p>
            <span className="card-footnote">Visible to Line Manager</span>
          </article>
        )}
        {account.derivedRoles.includes("project_lead") && (
          <article className="overview-card" id="projects">
            <span className="eyebrow">Your projects</span>
            <h2>Staffing requests</h2>
            <p>Project Leads will see detailed bookings for their own projects and limited availability elsewhere.</p>
            <span className="card-footnote">Visible to Project Lead</span>
          </article>
        )}
      </section>

      <section className="dashboard-bottom">
        <div>
          <p className="eyebrow">Next milestone</p>
          <h2>Weekly person capacity</h2>
          <p>Calculate capacity and load by person and week, then roll weekly results into quarterly reporting.</p>
        </div>
        <span className="milestone-index">02</span>
      </section>
    </AppShell>
  );
}
