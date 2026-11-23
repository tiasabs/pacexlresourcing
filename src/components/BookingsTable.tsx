import type { BookingRow } from "@/lib/airtable/workspace";

function date(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function status(row: BookingRow) {
  if (row.requestStatus === "Requested by person") return "Waiting for Project Lead";
  if (row.requestStatus === "Approved by lead") return "Approved by Project Lead";
  if (row.requestStatus === "Declined by lead") return "Declined by Project Lead";
  return row.confirmedOn ? "Confirmed" : "Not yet confirmed";
}

export function BookingsTable({ rows, showPerson = false }: { rows: BookingRow[]; showPerson?: boolean }) {
  if (!rows.length) return <p className="empty-state">No bookings or requests to show yet.</p>;
  return <div className="hr-table-wrap"><table className="hr-table bookings-table">
    <thead><tr>{showPerson && <th>Person</th>}<th>Project</th><th>Dates</th><th>Hours / week</th><th>Status</th><th>Clash</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      {showPerson && <td>{row.personName}</td>}
      <td><strong>{row.projectName}</strong>{row.label && <small className="table-subtitle">{row.label}</small>}{row.requestNote && <small className="table-subtitle">Request: {row.requestNote}</small>}</td>
      <td>{date(row.startDate)} – {date(row.endDate)}</td>
      <td>{row.hoursPerWeek}</td>
      <td>{status(row)}</td>
      <td>{row.clashFlagged ? <span className="load-status status-red" title={row.clashNote || "Potential booking clash"}>Flagged</span> : "—"}</td>
    </tr>)}</tbody>
  </table></div>;
}
