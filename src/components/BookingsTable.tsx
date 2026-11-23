"use client";

import type { BookingRow } from "@/lib/airtable/workspace";

function date(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function bookingStatusLabel(row: BookingRow) {
  if (row.personConfirmationStatus === "Awaiting response") return "Waiting for your response";
  if (row.personConfirmationStatus === "Declined") return "Declined by you";
  if (row.personConfirmationStatus === "Confirmed") return "Confirmed";
  if (row.requestStatus === "Requested by person") return "Waiting for Project Lead";
  if (row.requestStatus === "Approved by lead") return "Approved by Project Lead";
  if (row.requestStatus === "Declined by lead") return "Declined by Project Lead";
  return row.confirmedOn ? "Confirmed" : "Not yet confirmed";
}

export function BookingsTable({ rows, showPerson = false, onSelect }: { rows: BookingRow[]; showPerson?: boolean; onSelect?: (row: BookingRow) => void }) {
  if (!rows.length) return <p className="empty-state">No bookings or requests to show yet.</p>;
  return <div className="hr-table-wrap"><table className="hr-table bookings-table">
    <thead><tr>{showPerson && <th>Person</th>}<th>Project</th><th>Dates</th><th>Hours / week</th><th>Status</th><th>Capacity</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      {showPerson && <td>{row.personName}</td>}
      <td><button className="booking-project-link" type="button" onClick={() => onSelect?.(row)} aria-label={`View details for ${row.projectName}`}><strong>{row.projectName}</strong></button>{row.label && row.label !== row.projectName && <small className="table-subtitle">{row.label}</small>}</td>
      <td>{date(row.startDate)} – {date(row.endDate)}</td>
      <td>{row.hoursPerWeek}</td>
      <td>{bookingStatusLabel(row)}</td>
      <td>{row.clashFlagged ? <span className="load-status status-amber" title={row.clashNote || "Weekly bookings are above the capacity review threshold"}>Review</span> : "—"}</td>
    </tr>)}</tbody>
  </table></div>;
}
