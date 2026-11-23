import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingsTable } from "@/components/BookingsTable";
import { BookingRequestInbox } from "@/components/BookingRequestInbox";
import { ProjectMilestones } from "@/components/ProjectMilestones";
import { getMilestoneTeamChoices, getProjectBookingRows, getProjectMilestoneRows } from "@/lib/airtable/workspace";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function ProjectDetailsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["project_lead"])) redirect("/home");
  const { projectId } = await params;
  const [{ projects, bookings }, milestones, teams] = await Promise.all([
    getProjectBookingRows(account), getProjectMilestoneRows(account, projectId), getMilestoneTeamChoices(),
  ]);
  const project = projects.find((item) => item.id === projectId);
  if (!project) notFound();
  const projectBookings = bookings.filter((row) => row.projectId === projectId && row.requestStatus !== "Declined by lead");
  const pending = projectBookings.filter((row) => row.requestStatus === "Requested by person");
  const hasCapacityIssue = projectBookings.some((row) => row.clashFlagged);
  const projectMilestones = milestones ?? [];
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><Link className="text-button hr-back-link" href="/projects">‹ Your projects</Link><p className="eyebrow">Project resourcing</p><h1>{project.name}</h1><p className="dashboard-lede">Bookings and requests for this project.</p></div></section>
    <section className="project-detail-summary" aria-label="Project resourcing summary">
      <div><span className="eyebrow">Current bookings</span><strong>{projectBookings.length}</strong></div>
      <div><span className="eyebrow">Requests to review</span><strong>{pending.length}</strong></div>
      <div><span className="eyebrow">Capacity</span><strong>{hasCapacityIssue ? "Review" : "No flag"}</strong></div>
    </section>
    {hasCapacityIssue && <section className="capacity-notice" role="status"><strong>Some booked weeks may need a capacity check.</strong><p>Review the affected people and discuss adjustments with them as needed.</p></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Project plan</p><h2>Milestones and resourcing</h2></div><span className="notice-tag">Create once, book from the milestone</span></div><ProjectMilestones projectId={projectId} milestones={projectMilestones} teams={teams} /></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Bookings</p><h2>People booked on this project</h2></div></div><BookingsTable rows={projectBookings} showPerson /></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Requests</p><h2>Requests awaiting a decision</h2></div></div><BookingRequestInbox requests={pending} /></section>
  </AppShell>;
}
