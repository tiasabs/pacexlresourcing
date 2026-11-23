import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingsTable } from "@/components/BookingsTable";
import { BookingRequestInbox } from "@/components/BookingRequestInbox";
import { getProjectBookingRows } from "@/lib/airtable/workspace";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function ProjectBookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["project_lead"])) redirect("/home");
  const { projects, bookings } = await getProjectBookingRows(account);
  const requests = bookings.filter((row) => row.requestStatus === "Requested by person");
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Project teams</p><h1>Project bookings</h1><p className="dashboard-lede">Bookings for projects you lead, plus requests from people who were approached offline.</p></div></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Your projects</p><h2>{projects.length} project{projects.length === 1 ? "" : "s"}</h2></div></div>{projects.length > 0 && <ul className="project-list">{projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul>}</section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Waiting for review</p><h2>{requests.length} booking request{requests.length === 1 ? "" : "s"}</h2></div></div><BookingRequestInbox requests={requests} /></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">People on your projects</p><h2>Bookings</h2></div></div><BookingsTable rows={bookings} showPerson /></section>
  </AppShell>;
}
