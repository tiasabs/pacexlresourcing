import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingRequestForm } from "@/components/BookingRequestForm";
import { BookingsView } from "@/components/BookingsView";
import { BookingConfirmationInbox } from "@/components/BookingConfirmationInbox";
import { getDemoSession } from "@/lib/demo/session";
import { getMyBookingRows, getProjectsForRequest } from "@/lib/airtable/workspace";

export default async function BookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  const [bookings, projects] = await Promise.all([getMyBookingRows(account), getProjectsForRequest()]);
  const decisions = bookings.filter((row) => row.requestStatus === "Approved by lead" || row.requestStatus === "Declined by lead");
  const leadRequests = bookings.filter((row) => row.personConfirmationStatus === "Awaiting response");
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Your workload</p><h1>My bookings</h1><p className="dashboard-lede">Bookings across your projects, with dates, weekly hours and current status.</p></div><div className="calendar-connect-group"><button className="text-button calendar-connect-button" type="button" disabled aria-describedby="calendar-connect-status">Connect to calendar</button><span className="coming-soon-tag" id="calendar-connect-status">Coming soon</span></div></section>
    {decisions.length > 0 && <section className="upload-message upload-message-success" role="status"><strong>Project Lead update</strong><ul>{decisions.map((row) => <li key={row.id}>{row.projectName}: {row.requestStatus === "Approved by lead" ? "your request was approved and is now in your bookings." : "your request was declined."}</li>)}</ul></section>}
    <BookingConfirmationInbox requests={leadRequests} />
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Personal bookings</p><h2>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</h2></div></div><BookingsView rows={bookings} initialMonth={new Date().toISOString().slice(0, 7)} /></section>
    <BookingRequestForm projects={projects} />
  </AppShell>;
}
