"use client";

import { useState } from "react";
import type { BookingRow } from "@/lib/airtable/workspace";
import { BookingCalendar } from "@/components/BookingCalendar";
import { BookingsTable } from "@/components/BookingsTable";

export function BookingsView({ rows, initialMonth }: { rows: BookingRow[]; initialMonth: string }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  return <>
    <div className="booking-view-toolbar" role="group" aria-label="Choose booking view">
      <button className={view === "list" ? "view-button selected" : "view-button"} type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
      <button className={view === "calendar" ? "view-button selected" : "view-button"} type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
    </div>
    {view === "calendar" ? <BookingCalendar rows={rows} initialMonth={initialMonth} /> : <BookingsTable rows={rows} />}
  </>;
}
