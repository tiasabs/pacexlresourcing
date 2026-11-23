import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { canRunPeopleRefresh } from "@/lib/auth/permissions";
import { getHrCurrentLists } from "@/lib/airtable/hr-import";
import { getDemoSession } from "@/lib/demo/session";

const display = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);

export default async function PersonDetailsPage({ params }: { params: Promise<{ personId: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canRunPeopleRefresh(account)) redirect("/home");
  const { personId } = await params;
  const lists = await getHrCurrentLists().catch(() => ({ people: [], leave: [] }));
  const person = lists.people.find((item) => item.id === personId);
  if (!person) notFound();
  const leave = lists.leave.filter((item) => item.personIds.includes(person.id));

  return (
    <AppShell account={account}>
      <section className="dashboard-intro hr-person-intro">
        <div>
          <Link className="text-button hr-back-link" href="/hr">‹ People and leave</Link>
          <h1>{display(person.name)}</h1>
          <p className="dashboard-lede">{display(person.role)} · {display(person.team)}</p>
        </div>
      </section>

      <section className="hr-records-section">
        <div className="data-overview-heading"><div><h2>People details</h2></div></div>
        <dl className="hr-person-details">
          <div><dt>Employee ID</dt><dd>{display(person.employeeId)}</dd></div>
          <div><dt>Role level</dt><dd>{display(person.roleLevel)}</dd></div>
          <div><dt>Work email</dt><dd>{display(person.email)}</dd></div>
          <div><dt>Team</dt><dd>{display(person.team)}</dd></div>
          <div><dt>Region</dt><dd>{display(person.region)}</dd></div>
          <div><dt>Line manager</dt><dd>{person.manager || "—"}</dd></div>
          <div><dt>Contracted hours / week</dt><dd>{display(person.hours)}</dd></div>
          <div><dt>Working days / week</dt><dd>{display(person.days)}</dd></div>
          <div><dt>Status</dt><dd>{display(person.status)}</dd></div>
          <div><dt>Start date</dt><dd>{display(person.startDate)}</dd></div>
          <div><dt>End date</dt><dd>{display(person.endDate)}</dd></div>
        </dl>
      </section>

      <section className="hr-records-section">
        <div className="data-overview-heading"><div><h2>Planned leave ({leave.length})</h2></div></div>
        <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Leave ID</th><th>Title</th><th>Dates</th><th>Days</th><th>Type</th><th>Approval status</th><th>Sync status</th></tr></thead><tbody>{leave.map((record) => <tr key={record.id}><td>{display(record.leaveId)}</td><td>{display(record.title)}</td><td>{display(record.startDate)} – {display(record.endDate)}</td><td>{display(record.days)}</td><td>{display(record.type)}</td><td>{display(record.status)}</td><td>{display(record.sync)}</td></tr>)}</tbody></table>{!leave.length && <p className="empty-state">No planned leave records for this person.</p>}</div>
      </section>
    </AppShell>
  );
}
