import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { canViewOrganisationLoad } from "@/lib/auth/permissions";
import { getTeamQuarterlyUtilisation } from "@/lib/airtable/workspace";
import { getDemoSession } from "@/lib/demo/session";

function percent(value: number) { return `${Math.round(value * 100)}%`; }
function quarterFor(date: Date) { return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`; }

export default async function LeadershipTeamPage({ params, searchParams }: { params: Promise<{ teamName: string }>; searchParams: Promise<{ quarter?: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewOrganisationLoad(account)) redirect("/home");
  const [{ teamName: encodedTeam }, query] = await Promise.all([params, searchParams]);
  const teamName = decodeURIComponent(encodedTeam);
  const quarter = /^\d{4}-Q[1-4]$/.test(query.quarter ?? "") ? query.quarter! : quarterFor(new Date());
  const report = await getTeamQuarterlyUtilisation(quarter, teamName);
  if (!report.summaries.length) notFound();
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><Link className="text-button hr-back-link" href={`/leadership?quarter=${quarter}`}>‹ Organisation view</Link><p className="eyebrow">Team utilisation · {quarter}</p><h1>{teamName}</h1><p className="dashboard-lede">Quarterly booked hours, available capacity and named peak weekly load.</p></div></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">People in this team</p><h2>{report.summaries.length} people</h2></div><span className="notice-tag">Read-only overview</span></div>
      <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Person</th><th>Quarter booked / capacity</th><th>Peak weekly load</th><th>Peak status</th></tr></thead><tbody>{report.summaries.map((person) => <tr key={person.personId}><td><strong>{person.name}</strong></td><td>{Math.round(person.quarterBooked)} / {Math.round(person.quarterCapacity)} hours <span className="table-subtitle">({percent(person.utilisation)})</span></td><td>{percent(person.peak)}</td><td><span className={`load-status ${person.status === "Red" ? "status-red" : person.status === "Amber" ? "status-amber" : "status-green"}`}>{person.status === "Red" ? "Review" : person.status}</span></td></tr>)}</tbody></table></div>
      <p className="data-freshness">Booking details are available to Admin. This report is read-only.</p>
    </section>
  </AppShell>;
}
