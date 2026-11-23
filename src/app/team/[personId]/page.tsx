import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingsView } from "@/components/BookingsView";
import { getTeamPerson } from "@/lib/airtable/resourcing-flow";
import { canViewAllBookings, hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function TeamMemberBookingsPage({ params }: { params: Promise<{ personId: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account) && !hasAnyRole(account, ["line_manager"])) redirect("/home");
  const { personId } = await params;
  const detail = await getTeamPerson(account, personId);
  if (!detail) notFound();
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><Link className="text-button hr-back-link" href="/team">‹ Team bookings</Link><p className="eyebrow">{detail.person.team}</p><h1>{detail.person.name}</h1><p className="dashboard-lede">Bookings and request status for this person.</p></div></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Bookings</p><h2>{detail.bookings.length} booking{detail.bookings.length === 1 ? "" : "s"}</h2></div></div><BookingsView rows={detail.bookings} initialMonth={new Date().toISOString().slice(0, 7)} showCapacityNotice={false} /></section>
  </AppShell>;
}
