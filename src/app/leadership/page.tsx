import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getQuarterlyUtilisation } from "@/lib/airtable/workspace";
import { canViewOrganisationLoad } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

function currentQuarter() {
  const now = new Date();
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}
function hours(value: number) { return `${Math.round(value * 10) / 10}h`; }
function percent(value: number) { return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Over capacity"; }

export default async function LeadershipPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewOrganisationLoad(account)) redirect("/home");
  const params = await searchParams;
  const selectedQuarter = params.quarter && /^\d{4}-Q[1-4]$/.test(params.quarter) ? params.quarter : currentQuarter();
  const report = await getQuarterlyUtilisation(selectedQuarter);
  const thisYear = new Date().getUTCFullYear();
  const quarters = Array.from({ length: 12 }, (_, index) => `${thisYear - 1 + Math.floor(index / 4)}-Q${(index % 4) + 1}`);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Organisation-wide · read only</p><h1>Quarterly utilisation</h1><p className="dashboard-lede">{report.quarter}: each week is assigned to the quarter containing its Monday. Forward figures are based on current bookings.</p></div>
      <form className="quarter-picker" action="/leadership" method="get"><label htmlFor="quarter">Reporting quarter</label><select id="quarter" name="quarter" defaultValue={report.quarter}>{quarters.map((quarter) => <option key={quarter} value={quarter}>{quarter}</option>)}</select><button className="text-button" type="submit">View quarter</button></form>
    </section>
    <section className="data-overview"><div className="data-overview-heading"><div><p className="eyebrow">Organisation total</p><h2>{percent(report.totals.capacity ? report.totals.booked / report.totals.capacity : 0)} utilisation</h2></div><span className="notice-tag">{hours(report.totals.booked)} booked / {hours(report.totals.capacity)} capacity</span></div>
      <div className="hr-table-wrap"><table className="hr-table utilisation-table"><thead><tr><th>Person</th><th>Team</th><th>Quarter booked / capacity</th><th>Utilisation</th><th>Peak weekly load</th><th>Status</th></tr></thead><tbody>{report.summaries.map((row) => <tr key={row.personId}><td>{row.name}</td><td>{row.team}</td><td>{hours(row.quarterBooked)} / {hours(row.quarterCapacity)}</td><td>{percent(row.utilisation)}</td><td>{percent(row.peak)}</td><td><span className={`load-status status-${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}</tbody></table>{!report.summaries.length && <p className="empty-state">No active People records are available for this report.</p>}</div>
    </section>
  </AppShell>;
}
