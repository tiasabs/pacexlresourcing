import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getQuarterReport } from "@/lib/airtable/resourcing-flow";
import { canViewOrganisationLoad } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

function quarterFor(date: Date) { return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`; }
function percent(value: number) { return `${Math.round(value * 100)}%`; }

export default async function LeadershipPage({ searchParams }: { searchParams: Promise<{ quarter?: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewOrganisationLoad(account)) redirect("/home");
  const query = await searchParams;
  const quarter = /^\d{4}-Q[1-4]$/.test(query.quarter ?? "") ? query.quarter! : quarterFor(new Date());
  const report = await getQuarterReport(quarter);
  const current = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(-1)) - 1;
  const quarters = Array.from({ length: 5 }, (_, offset) => {
    const index = current + offset;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  });
  const utilisation = report.totals.capacity ? report.totals.booked / report.totals.capacity : 0;
  const reviewCount = report.summaries.filter((row) => row.status === "Red").length;
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Leadership view</p><h1>Quarterly utilisation</h1><p className="dashboard-lede">An organisation-wide view of booked hours, capacity and weekly peaks.</p></div><div className="quarter-picker" aria-label="Choose quarter">{quarters.map((item) => <Link className={item === quarter ? "quarter-link selected" : "quarter-link"} href={`/leadership?quarter=${item}`} key={item}>{item}</Link>)}</div></section>
    <p className="forecast-note">Forward views are based on current bookings.</p>
    <section className="leadership-kpi-grid" aria-label="Organisation summary">
      <article className="leadership-kpi leadership-kpi-feature"><span className="eyebrow">Quarterly booked hours / capacity</span><strong>{percent(utilisation)}</strong><div className="utilisation-meter" aria-label={`${percent(utilisation)} quarterly utilisation`}><span style={{ width: `${Math.min(100, Math.round(utilisation * 100))}%` }} /></div><p>{Math.round(report.totals.booked)} booked hours of {Math.round(report.totals.capacity)} available hours</p></article>
      <article className="leadership-kpi"><span className="eyebrow">Actual hours recorded</span><strong>{Math.round(report.totals.actual)}</strong><p>{Math.round(report.totals.actualCoverage * 100)}% of expected milestone weeks have entries</p></article>
      <article className="leadership-kpi"><span className="eyebrow">People in view</span><strong>{report.summaries.length}</strong><p>Across {report.teams.length} teams</p></article>
      <article className="leadership-kpi"><span className="eyebrow">People to review</span><strong>{reviewCount}</strong><p>At least one week above {percent(report.thresholds.red)} of capacity</p></article>
    </section>
    <section className="hr-records-section leadership-teams"><div className="data-overview-heading"><div><p className="eyebrow">Team view</p><h2>Utilisation by team</h2></div><span className="notice-tag">Select a team for details</span></div>
      <div className="team-utilisation-grid">{report.teams.map((team) => <Link className="team-utilisation-card" href={`/leadership/${encodeURIComponent(team.name)}?quarter=${quarter}`} key={team.name}>
        <div className="team-utilisation-heading"><strong>{team.name}</strong><span className={`load-status ${team.status === "Red" ? "status-red" : team.status === "Amber" ? "status-amber" : "status-green"}`}>{team.status === "Red" ? "Review" : team.status}</span></div>
        <div className="team-utilisation-value">{percent(team.utilisation)}<small>quarterly</small></div>
        <div className="utilisation-meter"><span style={{ width: `${Math.min(100, Math.round(team.utilisation * 100))}%` }} /></div>
        <div className="team-utilisation-meta"><span>{team.peopleCount} people</span><span>{Math.round(team.quarterActual)} actual hours</span><span>{team.reviewPeopleCount} peak weeks to review</span></div>
        <span className="home-function-arrow" aria-hidden="true">↗</span>
      </Link>)}{!report.teams.length && <p className="empty-state">No team capacity data is available for this quarter.</p>}</div>
    </section>
  </AppShell>;
}
