"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BookingRow, MilestoneRow } from "@/lib/airtable/resourcing-flow";

function BookingEditor({ booking, milestones, teams }: { booking: BookingRow; milestones: MilestoneRow[]; teams: string[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(booking.allocations.map((allocation) => [allocation.milestoneId, true])));
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(booking.allocations.map((allocation) => [allocation.milestoneId, String(allocation.hoursPerWeek)])));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const allocations = Object.entries(selected).filter(([, on]) => on).map(([milestoneId]) => ({ milestoneId, hoursPerWeek: Number(hours[milestoneId]) }));
    try {
      const response = await fetch("/api/bookings/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, effectiveFrom: data.get("effectiveFrom"), startDate: data.get("startDate"), endDate: data.get("endDate"), team: data.get("team"), allocations }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The booking could not be updated.");
      setMessage(body.capacityWarning ? "Booking updated. Some weeks are above weekly capacity." : "Booking updated; the previous version remains in the history."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The booking could not be updated."); }
    finally { setBusy(false); }
  }
  return <details className="booking-edit-details"><summary>Edit booking</summary><form className="request-final-booking" onSubmit={save}>
    <div className="request-final-fields"><label>Change takes effect<input name="effectiveFrom" type="date" min={booking.startDate} defaultValue={today > booking.startDate ? today : booking.startDate} required /></label><label>Start date<input name="startDate" type="date" defaultValue={booking.startDate} required /></label><label>End date<input name="endDate" type="date" min={booking.startDate} defaultValue={booking.endDate} required /></label><label>Team<select name="team" defaultValue={booking.teamRequested} required>{teams.map((team) => <option key={team}>{team}</option>)}</select></label></div>
    <fieldset className="milestone-allocation-picker"><legend>Weekly hours by milestone</legend>{milestones.map((milestone) => <div className="allocation-picker-row" key={milestone.id}><label className="allocation-picker-name"><input type="checkbox" checked={Boolean(selected[milestone.id])} onChange={(event) => setSelected((current) => ({ ...current, [milestone.id]: event.target.checked }))} /><span>{milestone.name}</span></label><label className="allocation-hours">Hours/week<input type="number" min="0.01" max="168" step="0.01" disabled={!selected[milestone.id]} required={Boolean(selected[milestone.id])} value={hours[milestone.id] ?? ""} onChange={(event) => setHours((current) => ({ ...current, [milestone.id]: event.target.value }))} /></label></div>)}</fieldset>
    <button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save booking changes"}</button>{error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </form></details>;
}

export function ProjectBookingManagement({ bookings, milestones, teams }: { bookings: BookingRow[]; milestones: MilestoneRow[]; teams: string[] }) {
  const confirmed = bookings.filter((booking) => booking.bookingStatus === "Booked");
  if (!confirmed.length) return <p className="empty-state">No bookings on this Project yet.</p>;
  return <div className="project-booking-management">{confirmed.map((booking) => <article className="project-booking-row" key={booking.id}>
    <div className="project-booking-row-summary"><strong>{booking.personName}</strong><span>{booking.teamRequested} · {booking.startDate} – {booking.endDate} · {booking.hoursPerWeek.toFixed(2).replace(/\.00$/, "")} h/wk</span><small>{booking.allocations.map((allocation) => `${allocation.milestoneName}: ${allocation.hoursPerWeek} h/wk`).join(" · ")}</small>{booking.clashFlagged && <span className="load-status status-amber">Review capacity</span>}</div>
    <BookingEditor booking={booking} milestones={milestones} teams={teams} />
  </article>)}</div>;
}
