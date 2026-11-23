import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getProjectBookingRows } from "@/lib/airtable/workspace";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function ProjectBookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["project_lead"])) redirect("/home");
  const { projects, bookings, milestones } = await getProjectBookingRows(account);
  const now = new Date();
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const nextMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)).toISOString().slice(0, 10);
  const summaries = projects.map((project) => {
    const active = bookings.filter((booking) => booking.projectId === project.id && booking.requestStatus !== "Declined by lead");
    const pending = active.filter((booking) => booking.requestStatus === "Requested by person").length;
    const hasNextMonthBookings = active.some((booking) => booking.startDate <= nextMonthEnd && booking.endDate >= nextMonthStart);
    const hasCapacityIssue = active.some((booking) => booking.clashFlagged);
    const unfilledMilestones = milestones.filter((milestone) => milestone.projectId === project.id && !["Complete", "Cancelled"].includes(milestone.status)).filter((milestone) => {
      const allocated = active.filter((booking) => booking.milestoneId === milestone.id && booking.personConfirmationStatus !== "Declined").reduce((sum, booking) => sum + booking.hoursPerWeek, 0);
      return allocated < milestone.hoursPerWeekRequired;
    });
    const flags = [
      ...(!hasNextMonthBookings ? ["No bookings next month"] : []),
      ...(hasCapacityIssue ? ["Capacity review"] : []),
      ...(unfilledMilestones.length ? [`${unfilledMilestones.length} milestone${unfilledMilestones.length === 1 ? "" : "s"} need resourcing`] : []),
      ...(pending ? [`${pending} request${pending === 1 ? "" : "s"} to review`] : []),
    ];
    return { ...project, bookingCount: active.length, flags };
  });
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Project resourcing</p><h1>Your projects</h1><p className="dashboard-lede">Select a project to review its bookings and resourcing details.</p></div></section>
    <section className="project-overview-grid" aria-label="Projects and resourcing flags">
      {summaries.map((project) => <Link className="project-overview-card" href={`/projects/${project.id}`} key={project.id}>
        <span className="project-overview-arrow" aria-hidden="true">↗</span>
        <span className="eyebrow">{project.bookingCount} active booking{project.bookingCount === 1 ? "" : "s"}</span>
        <strong>{project.name}</strong>
        <span className="project-issue-list">{project.flags.length ? project.flags.map((flag) => <span className="project-issue-flag" key={flag}>{flag}</span>) : <span className="project-issue-clear">No current resourcing flags</span>}</span>
      </Link>)}
      {!summaries.length && <p className="empty-state">No projects are assigned to this Project Lead yet.</p>}
    </section>
  </AppShell>;
}
