"use client";

import { useState } from "react";
import type { BookingRow } from "@/lib/airtable/workspace";
import { bookingStatusLabel } from "@/components/BookingsTable";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function BookingCalendar({ rows, initialMonth }: { rows: BookingRow[]; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(firstDay);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day;
  });
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(toIso(next).slice(0, 7));
  }

  return <section className="booking-calendar" aria-label={`Bookings calendar for ${monthLabel}`}>
    <div className="calendar-toolbar">
      <h3>{monthLabel}</h3>
      <div><button className="text-button" type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button><button className="text-button" type="button" onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>Today</button><button className="text-button" type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button></div>
    </div>
    <div className="calendar-grid" role="grid" aria-label={monthLabel}>
      {weekdays.map((day) => <div className="calendar-weekday" role="columnheader" key={day}>{day.slice(0, 3)}</div>)}
      {days.map((day) => {
        const dayIso = toIso(day);
        const events = rows.filter((row) => row.requestStatus !== "Declined by lead" && row.startDate <= dayIso && row.endDate >= dayIso);
        return <div className={`calendar-day${day.getUTCMonth() !== monthNumber - 1 ? " outside-month" : ""}`} role="gridcell" aria-label={`${dayIso}, ${events.length} booking${events.length === 1 ? "" : "s"}`} key={dayIso}>
          <span className="calendar-date">{day.getUTCDate()}</span>
          <div className="calendar-events">{events.map((row) => <article className={`calendar-event${row.clashFlagged ? " calendar-event-clash" : ""}`} key={row.id} title={row.clashFlagged ? row.clashNote : bookingStatusLabel(row)}>
            <strong>{row.projectName}</strong><small>{row.hoursPerWeek} hrs/wk · {bookingStatusLabel(row)}</small>
            {row.clashFlagged && <span>Over contract</span>}
          </article>)}</div>
        </div>;
      })}
    </div>
  </section>;
}
