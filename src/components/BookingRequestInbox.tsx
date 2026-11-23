"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { BookingRow, MilestoneRow } from "@/lib/airtable/resourcing-flow";

function RequestCard({ request, milestones, teams }: { request: BookingRow; milestones: MilestoneRow[]; teams: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState(request.startDate);
  const [endDate, setEndDate] = useState(request.endDate);
  const [team, setTeam] = useState(request.teamRequested || teams[0] || "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [hours, setHours] = useState<Record<string, string>>({});
  const [createMilestone, setCreateMilestone] = useState(false);

  async function decide(approve: boolean, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); setBusy(true); setError(""); setMessage("");
    const allocations = Object.entries(selected).filter(([, on]) => on).map(([milestoneId]) => ({ milestoneId, hoursPerWeek: Number(hours[milestoneId]) }));
    const data = event ? new FormData(event.currentTarget) : null;
    try {
      const response = await fetch("/api/bookings/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        bookingId: request.id, approve, startDate, endDate, team, allocations,
        newMilestone: createMilestone ? { name: data?.get("newMilestoneName"), startDate: data?.get("newMilestoneStart"), endDate: data?.get("newMilestoneEnd"), hoursPerWeek: Number(data?.get("newMilestoneHours")) } : undefined,
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The request could not be updated.");
      setMessage(approve ? body.capacityWarning ? "Booked. Capacity is above the review threshold for some weeks." : "Booked. The person can now see it in My bookings." : "Request declined.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The request could not be updated."); }
    finally { setBusy(false); }
  }
  return <article className="request-inbox-item request-booking-editor">
    <div className="request-inbox-summary"><strong>{request.personName}</strong><span> requested work on <strong>{request.projectName}</strong></span><p>Suggested dates: {request.startDate} – {request.endDate} · {request.hoursPerWeek} hours/week{request.requestNote ? ` · ${request.requestNote}` : ""}</p></div>
    <form className="request-final-booking" onSubmit={(event) => void decide(true, event)}>
      <div className="request-final-fields"><label>Final start<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>Final end<input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label><label>Team<select value={team} onChange={(event) => setTeam(event.target.value)} required>{teams.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <fieldset className="milestone-allocation-picker"><legend>Assign final hours to milestone(s)</legend>
        {milestones.map((milestone) => <div className="allocation-picker-row" key={milestone.id}><label className="allocation-picker-name"><input type="checkbox" checked={Boolean(selected[milestone.id])} onChange={(event) => setSelected((current) => ({ ...current, [milestone.id]: event.target.checked }))} /><span>{milestone.name}<small>{milestone.expectedStartDate || milestone.plannedStartDate} – {milestone.expectedEndDate || milestone.plannedEndDate}</small></span></label><label className="allocation-hours">Hours/week<input type="number" min="0.01" max="168" step="0.01" disabled={!selected[milestone.id]} required={Boolean(selected[milestone.id])} value={hours[milestone.id] ?? ""} onChange={(event) => setHours((current) => ({ ...current, [milestone.id]: event.target.value }))} /></label></div>)}
        <label className="create-milestone-toggle"><input type="checkbox" checked={createMilestone} onChange={(event) => setCreateMilestone(event.target.checked)} />Create a milestone for this booking</label>
        {createMilestone && <div className="request-final-fields"><label>Milestone name<input name="newMilestoneName" required={createMilestone} maxLength={120} /></label><label>Milestone start<input name="newMilestoneStart" type="date" required={createMilestone} /></label><label>Milestone end<input name="newMilestoneEnd" type="date" required={createMilestone} /></label><label>Hours/week<input name="newMilestoneHours" type="number" min="0.01" max="168" step="0.01" required={createMilestone} /></label></div>}
      </fieldset>
      {request.clashFlagged && <p className="hr-warning">This person’s current bookings exceed capacity in some weeks. You can still book them.</p>}
      <div className="request-actions"><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving booking…" : "Book person"}</button><button className="text-button" type="button" disabled={busy} onClick={() => void decide(false)}>{busy ? "Saving…" : "Decline request"}</button></div>
    </form>
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </article>;
}

export function BookingRequestInbox({ requests, milestones, teams }: { requests: BookingRow[]; milestones: MilestoneRow[]; teams: string[] }) {
  if (!requests.length) return <p className="empty-state">No booking requests are waiting for your decision.</p>;
  return <div className="request-inbox">{requests.map((request) => <RequestCard key={request.id} request={request} milestones={milestones} teams={teams} />)}</div>;
}
