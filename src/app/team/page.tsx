import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingsTable } from "@/components/BookingsTable";
import { getTeamBookingRows } from "@/lib/airtable/workspace";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function TeamBookingsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["line_manager"])) redirect("/home");
  const bookings = await getTeamBookingRows(account);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Direct reports</p><h1>Team bookings</h1><p className="dashboard-lede">Your bookings and bookings for people who report directly to you.</p></div></section>
    <section className="hr-records-section"><BookingsTable rows={bookings} showPerson /></section>
  </AppShell>;
}
