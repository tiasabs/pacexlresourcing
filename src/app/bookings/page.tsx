import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingRequestForm } from "@/components/BookingRequestForm";
import { BookingsView } from "@/components/BookingsView";
import { getDemoSession } from "@/lib/demo/session";
import { getMyBookingRows, getProjectsForRequest } from "@/lib/airtable/resourcing-flow";

export default async function BookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  const [bookings, projects] = await Promise.all([getMyBookingRows(account), getProjectsForRequest()]);
  const decisions = bookings.filter((row) => row.requestStatus === "Approved by lead" || row.requestStatus === "Declined by lead");
  const recentCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentBookingUpdates = bookings.filter((row) => row.bookingStatus === "Booked" && row.enteredAt && row.enteredAt >= recentCutoff);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Your workload</p><h1>My bookings</h1><p className="dashboard-lede">Bookings across your projects, with dates, weekly hours and current status.</p></div><div className="calendar-connect-group"><button className="text-button calendar-connect-button" type="button" disabled aria-describedby="calendar-connect-status">Connect to calendar</button><span className="coming-soon-tag" id="calendar-connect-status">Coming soon</span></div></section>
    {decisions.length > 0 && <section className="upload-message upload-message-success" role="status"><strong>Project Lead update</strong><ul>{decisions.map((row) => <li key={row.id}>{row.projectName}: {row.requestStatus === "Approved by lead" ? "your request was approved and is now in your bookings." : "your request was declined."}</li>)}</ul></section>}
    {recentBookingUpdates.length > 0 && <section className="capacity-notice booking-update-notice" role="status"><strong>New or updated bookings</strong><ul>{recentBookingUpdates.map((row) => <li key={row.id}>{row.projectName}: {row.startDate} – {row.endDate}, {row.hoursPerWeek.toFixed(2).replace(/\.00$/, "")} hours per week. Open the booking for milestone details.</li>)}</ul></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Personal bookings</p><h2>{bookings.filter((row) => row.bookingStatus !== "Request").length} booking{bookings.filter((row) => row.bookingStatus !== "Request").length === 1 ? "" : "s"}</h2></div></div><BookingsView rows={bookings.filter((row) => row.bookingStatus !== "Request")} initialMonth={new Date().toISOString().slice(0, 7)} /></section>
    {bookings.some((row) => row.bookingStatus === "Request") && <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Nudges sent</p><h2>Your requests</h2></div><span className="notice-tag">Doesn’t reserve capacity</span></div><BookingsView rows={bookings.filter((row) => row.bookingStatus === "Request")} initialMonth={new Date().toISOString().slice(0, 7)} showCapacityNotice={false} /></section>}
    <BookingRequestForm projects={projects} />
  </AppShell>;
}
