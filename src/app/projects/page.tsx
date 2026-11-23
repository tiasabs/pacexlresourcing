import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProjectCreateForm } from "@/components/ProjectCreateForm";
import { getPeopleChoices, getProjectWorkspace } from "@/lib/airtable/resourcing-flow";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function ProjectBookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["project_lead"])) redirect("/home");
  const [{ projects, bids, bookings, milestones }, leads] = await Promise.all([getProjectWorkspace(account), canViewAllBookings(account) ? getPeopleChoices() : Promise.resolve([])]);
  const now = new Date();
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const nextMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
  const summaries = projects.map((project) => {
    const ownBookings = bookings.filter((booking) => booking.projectId === project.id && booking.bookingStatus === "Booked");
    const withinProjectPeriod = (!project.startDate || project.startDate <= nextMonthEnd) && (!project.endDate || project.endDate >= nextMonthStart);
    const noNextMonth = withinProjectPeriod && !ownBookings.some((booking) => booking.startDate <= nextMonthEnd && booking.endDate >= nextMonthStart);
    const capacity = ownBookings.some((booking) => booking.clashFlagged);
    const pendingRequests = bookings.filter((booking) => booking.projectId === project.id && booking.bookingStatus === "Request" && booking.requestStatus === "Requested by person").length;
    const upcomingMilestones = milestones.filter((milestone) => milestone.projectId === project.id && milestone.expectedStartDate <= nextMonthEnd && milestone.expectedEndDate >= nextMonthStart);
    const emptyMilestones = upcomingMilestones.filter((milestone) => !ownBookings.some((booking) => booking.allocations.some((allocation) => allocation.milestoneId === milestone.id)));
    const flags = [...(pendingRequests ? [`${pendingRequests} person request${pendingRequests === 1 ? "" : "s"} to review`] : []), ...(noNextMonth ? ["No bookings next month"] : []), ...(capacity ? ["Capacity to review"] : []), ...(emptyMilestones.length ? [`${emptyMilestones.length} upcoming milestone${emptyMilestones.length === 1 ? "" : "s"} without a booking`] : [])];
    return { ...project, bookingCount: ownBookings.length, flags };
  });
  const bidSummaries = bids.map((bid) => ({ ...bid, remainingBookings: bid.stage === "Lost" ? bookings.filter((booking) => booking.projectId === bid.id && booking.bookingStatus === "Booked" && booking.endDate >= new Date().toISOString().slice(0, 10)) : [] }));
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Project resourcing</p><h1>Projects and Bids</h1><p className="dashboard-lede">Create the work, add milestones, check availability and make bookings.</p></div></section>
    <ProjectCreateForm admin={canViewAllBookings(account)} leads={leads} />
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Delivery work</p><h2>{projects.length} Project{projects.length === 1 ? "" : "s"}</h2></div><span className="notice-tag">Select a project for details</span></div>
      <div className="project-overview-grid" aria-label="Projects and resourcing flags">{summaries.map((project) => <Link className="project-overview-card" href={`/projects/${project.id}`} key={project.id}>
        <span className="project-overview-arrow" aria-hidden="true">↗</span><span className="eyebrow">{project.bookingCount} booking{project.bookingCount === 1 ? "" : "s"} · {project.client || "Client not set"}</span><strong>{project.name}</strong><span className="project-issue-list">{project.flags.length ? project.flags.map((flag) => <span className="project-issue-flag" key={flag}>{flag}</span>) : <span className="project-issue-clear">No current resourcing flags</span>}</span>
      </Link>)}{!projects.length && <p className="empty-state">No Projects are assigned to this account yet.</p>}</div>
    </section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Funding opportunities</p><h2>{bids.length} Bid{bids.length === 1 ? "" : "s"}</h2></div></div>
      <div className="project-overview-grid">{bidSummaries.map((bid) => <Link className="project-overview-card" href={`/projects/${bid.id}`} key={bid.id}><span className="project-overview-arrow" aria-hidden="true">↗</span><span className="eyebrow">{bid.stage} · deadline {bid.bidDeadline || "not set"}</span><strong>{bid.name}</strong><span className="project-issue-list"><span className="project-issue-flag">Decision: {bid.decisionStatus || "Pending"}</span>{bid.remainingBookings.length > 0 && <span className="project-issue-flag">Review remaining bookings</span>}</span></Link>)}{!bids.length && <p className="empty-state">No Bids are in preparation.</p>}</div>
    </section>
  </AppShell>;
}
