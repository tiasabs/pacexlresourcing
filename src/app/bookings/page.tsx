import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingsTable } from "@/components/BookingsTable";
import { BookingRequestForm } from "@/components/BookingRequestForm";
import { getDemoSession } from "@/lib/demo/session";
import { getMyBookingRows, getProjectsForRequest } from "@/lib/airtable/workspace";

export default async function BookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  const [bookings, projects] = await Promise.all([getMyBookingRows(account), getProjectsForRequest()]);
  const decisions = bookings.filter((row) => row.requestStatus === "Approved by lead" || row.requestStatus === "Declined by lead");
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Your workload</p><h1>My bookings</h1><p className="dashboard-lede">Read-only view of work assigned to you, including offline requests awaiting a Project Lead.</p></div></section>
    {decisions.length > 0 && <section className="upload-message upload-message-success" role="status"><strong>Project Lead update</strong><ul>{decisions.map((row) => <li key={row.id}>{row.projectName}: {row.requestStatus === "Approved by lead" ? "your request was approved and is now in your bookings." : "your request was declined."}</li>)}</ul></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Personal bookings</p><h2>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</h2></div></div><BookingsTable rows={bookings} /></section>
    <BookingRequestForm projects={projects} />
  </AppShell>;
}
