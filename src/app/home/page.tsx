import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getAirtableConfigStatus } from "@/lib/airtable/config-check";
import { getAirtableReadOverview } from "@/lib/airtable/overview";
import { getDemoSession } from "@/lib/demo/session";
import {
  canRunPeopleRefresh,
  canViewAllBookings,
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
          <p className="dashboard-lede">Explore the workspace from this demo persona.</p>
        </div>
        <div className="current-role-card">
          <span className="eyebrow">Viewing as</span>
          <strong>{account.title}</strong>
          <div className="role-chip-list">
            {roles.map((role) => <span className="role-chip" key={role}>{role}</span>)}
          </div>
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

      {canRunPeopleRefresh(account) && (
        <section className="hr-home-action">
          <div>
            <p className="eyebrow">Data operations</p>
            <h2>People and planned leave</h2>
            <p>Review current HR records and submit a new export.</p>
          </div>
          <a className="primary-action" href="/hr">Open HR uploads</a>
        </section>
      )}
    </AppShell>
  );
}
