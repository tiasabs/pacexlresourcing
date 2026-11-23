import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BidActions } from "@/components/BidActions";
import { BookingsTable } from "@/components/BookingsTable";
import { BookingRequestInbox } from "@/components/BookingRequestInbox";
import { ProjectBookingForm } from "@/components/ProjectBookingForm";
import { ProjectBookingManagement } from "@/components/ProjectBookingManagement";
import { ProjectEditForm } from "@/components/ProjectEditForm";
import { ProjectMilestones } from "@/components/ProjectMilestones";
import { getPeopleChoices, getProjectDetail, getTeams } from "@/lib/airtable/resourcing-flow";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function ProjectDetailsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["project_lead"])) redirect("/home");
  const { projectId } = await params;
  const [detail, teams, leads] = await Promise.all([getProjectDetail(account, projectId), getTeams(), canViewAllBookings(account) ? getPeopleChoices() : Promise.resolve([])]);
  if (!detail) notFound();
  const { project, milestones, bookings } = detail;
  const projectBookings = bookings.filter((row) => row.bookingStatus === "Booked");
  const requests = bookings.filter((row) => row.bookingStatus === "Request" && row.requestStatus === "Requested by person");
  const capacityIssue = projectBookings.some((row) => row.clashFlagged);
  const lostBidCommitments = project.type === "Bid" && project.stage === "Lost" ? projectBookings.filter((row) => row.endDate >= new Date().toISOString().slice(0, 10)) : [];
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><Link className="text-button hr-back-link" href="/projects">‹ Projects and Bids</Link><p className="eyebrow">{project.type} · {project.client || "Client not set"}</p><h1>{project.name}</h1><p className="dashboard-lede">Milestones, availability, bookings and requests for this {project.type.toLowerCase()}.</p></div></section>
    <ProjectEditForm project={project} admin={canViewAllBookings(account)} leads={leads} />
    {project.type === "Bid" && <BidActions projectId={project.id} decision={project.decisionStatus} internalDue={project.bidDueDate} deadline={project.bidDeadline} />}
    <section className="project-detail-summary" aria-label="Resourcing summary"><div><span className="eyebrow">Bookings</span><strong>{projectBookings.length}</strong></div><div><span className="eyebrow">Requests to review</span><strong>{requests.length}</strong></div><div><span className="eyebrow">Capacity</span><strong>{capacityIssue ? "Review" : "No flag"}</strong></div></section>
    {capacityIssue && <section className="capacity-notice" role="status"><strong>Some booked weeks may be above capacity.</strong><p>Review the affected bookings and adjust the commitment if needed.</p></section>}
    {lostBidCommitments.length > 0 && <section className="capacity-notice" role="status"><strong>This Bid is lost, and some bookings are still active.</strong><p>Review each remaining commitment and update its end date or weekly hours. The booking records remain available for history.</p></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Project plan</p><h2>Milestones</h2></div><span className="notice-tag">Names and dates</span></div><ProjectMilestones projectId={project.id} milestones={milestones} /></section>
    {!['Lost', 'cancelled', 'Completed'].includes(project.stage) && <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Availability and booking</p><h2>Book a person</h2></div></div><ProjectBookingForm projectId={project.id} milestones={milestones} teams={teams} /></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Bookings</p><h2>People booked on this {project.type}</h2></div></div><BookingsTable rows={projectBookings} showPerson /><ProjectBookingManagement bookings={projectBookings} milestones={milestones} teams={teams} /></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">In-app notices</p><h2>Requests to turn into bookings</h2></div></div><BookingRequestInbox requests={requests} milestones={milestones} teams={teams} /></section>
  </AppShell>;
}
