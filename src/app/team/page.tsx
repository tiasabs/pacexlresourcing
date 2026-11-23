import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getTeamPeople } from "@/lib/airtable/resourcing-flow";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function TeamBookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["line_manager"])) redirect("/home");
  const people = await getTeamPeople(account);
  const reviewPeople = people.filter((person) => person.hasCapacityAlert);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Direct reports</p><h1>Team bookings</h1><p className="dashboard-lede">Start with your team. Open a person to review their bookings and capacity details.</p></div></section>
    <section className="hr-records-section">
      <div className="data-overview-heading"><div><p className="eyebrow">Your team</p><h2>{people.length} people</h2></div></div>
      <div className="hr-table-wrap"><table className="hr-table team-roster-table"><thead><tr><th>Person</th><th>Team</th><th>Bookings</th><th>Capacity</th><th></th></tr></thead><tbody>{people.map((person) => <tr key={person.personId}>
        <td><Link className="hr-person-link" href={`/team/${person.personId}`}>{person.name}</Link></td><td>{person.team || "—"}</td><td>{person.bookingCount}</td>
        <td>{person.hasCapacityAlert ? <span className="load-status status-amber">Review capacity</span> : person.bookingCount ? "No action needed" : "No bookings"}</td>
        <td><Link className="text-button team-detail-link" href={`/team/${person.personId}`}>View bookings</Link></td>
      </tr>)}</tbody></table>{!people.length && <p className="empty-state">No team members are linked to this account.</p>}</div>
    </section>
    <section className="team-action-panel" aria-labelledby="team-actions-title">
      <div className="data-overview-heading"><div><p className="eyebrow">Action items</p><h2 id="team-actions-title">Capacity to review</h2></div><span className="notice-tag">{reviewPeople.length} item{reviewPeople.length === 1 ? "" : "s"}</span></div>
      {reviewPeople.length ? <ul className="team-action-list">{reviewPeople.map((person) => <li key={person.personId}><Link href={`/team/${person.personId}`}>{person.name}</Link><span>Review bookings for {person.flaggedProjects.join(", ")}.</span></li>)}</ul> : <p className="empty-state">No team members are currently above the capacity review threshold.</p>}
    </section>
  </AppShell>;
}
