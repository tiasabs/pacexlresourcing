import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingRequestForm } from "@/components/BookingRequestForm";
import { BookingsView } from "@/components/BookingsView";
import { getDemoSession } from "@/lib/demo/session";
import { getMyBookingRows, getProjectsForRequest } from "@/lib/airtable/workspace";

export default async function BookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  const [bookings, projects] = await Promise.all([getMyBookingRows(account), getProjectsForRequest()]);
  const decisions = bookings.filter((row) => row.requestStatus === "Approved by lead" || row.requestStatus === "Declined by lead");
  const clashWeeks = new Map(bookings.flatMap((row) => row.clashWeeks).map((week) => [`${week.weekStart}-${week.bookedHours}`, week]));
  const clashes = Array.from(clashWeeks.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Your workload</p><h1>My bookings</h1><p className="dashboard-lede">Bookings across your projects, with dates, weekly hours and current status.</p></div></section>
    {clashes.length > 0 && <section className="clash-banner" role="status"><div><strong>Your booked hours are above your contracted hours in one or more weeks.</strong><p>Please review these bookings and resolve any over-allocation with the relevant Project Lead.</p></div><ul>{clashes.map((week) => <li key={week.weekStart}>{week.weekLabel}: {week.bookedHours} booked hours against {week.contractedHours} contracted hours</li>)}</ul></section>}
    {decisions.length > 0 && <section className="upload-message upload-message-success" role="status"><strong>Project Lead update</strong><ul>{decisions.map((row) => <li key={row.id}>{row.projectName}: {row.requestStatus === "Approved by lead" ? "your request was approved and is now in your bookings." : "your request was declined."}</li>)}</ul></section>}
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Personal bookings</p><h2>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</h2></div></div><BookingsView rows={bookings} initialMonth={new Date().toISOString().slice(0, 7)} /></section>
    <BookingRequestForm projects={projects} />
  </AppShell>;
}
