"use client";

import { useState } from "react";
import type { BookingRow } from "@/lib/airtable/resourcing-flow";
import { BookingCalendar } from "@/components/BookingCalendar";
import { BookingsTable } from "@/components/BookingsTable";
import { BookingDetailsDialog } from "@/components/BookingDetailsDialog";

export function BookingsView({ rows, initialMonth, showCapacityNotice = true }: { rows: BookingRow[]; initialMonth: string; showCapacityNotice?: boolean }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const flaggedProjects = Array.from(new Map(rows.filter((row) => row.clashFlagged && row.bookingStatus === "Booked").map((row) => [row.projectId, row])).values());
  return <>
    {showCapacityNotice && flaggedProjects.length > 0 && <section className="capacity-notice" role="status"><strong>Some booked work may be above your weekly capacity.</strong><p>You may want to review these projects with your Project Lead.</p><div className="capacity-project-links">{flaggedProjects.map((row) => <button type="button" key={row.projectId} onClick={() => setSelectedBooking(row)}>{row.projectName}</button>)}</div></section>}
    <div className="booking-view-toolbar" role="group" aria-label="Choose booking view">
      <button className={view === "list" ? "view-button selected" : "view-button"} type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
      <button className={view === "calendar" ? "view-button selected" : "view-button"} type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
    </div>
    {view === "calendar" ? <BookingCalendar rows={rows} initialMonth={initialMonth} onSelect={setSelectedBooking} /> : <BookingsTable rows={rows} onSelect={setSelectedBooking} />}
    <BookingDetailsDialog booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
  </>;
}
