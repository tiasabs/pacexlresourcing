"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { MilestoneRow } from "@/lib/airtable/workspace";

function dateLabel(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function MilestoneCard({ milestone, teams }: { milestone: MilestoneRow; teams: string[] }) {
  const router = useRouter();
  const firstCandidate = milestone.candidates[0];
  const [personId, setPersonId] = useState(firstCandidate?.personId ?? "");
  const [hours, setHours] = useState(firstCandidate ? Math.min(milestone.remainingHoursPerWeek, firstCandidate.availableHoursPerWeek) : 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(path: string, payload: Record<string, unknown>, success: string) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The change could not be saved.");
      setMessage(success); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); }
    finally { setSaving(false); }
  }

  function updatePerson(value: string) {
    setPersonId(value);
    const candidate = milestone.candidates.find((item) => item.personId === value);
    if (candidate) setHours(Math.min(milestone.remainingHoursPerWeek, candidate.availableHoursPerWeek));
  }

  function saveDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dates = milestone.firstBookingDate
      ? { expectedStartDate: String(data.get("start") ?? ""), expectedEndDate: String(data.get("end") ?? "") }
      : { plannedStartDate: String(data.get("start") ?? ""), plannedEndDate: String(data.get("end") ?? "") };
    void submit("/api/milestones/dates", { milestoneId: milestone.id, ...dates }, milestone.firstBookingDate ? "Expected dates updated." : "Planned dates updated.");
  }

  function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("/api/milestones/book", { milestoneId: milestone.id, personId, hoursPerWeek: Number(hours) }, "Booking request sent to the person.");
  }

  function updateDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit("/api/milestones/update", { milestoneId: milestone.id, name: data.get("name"), teamRequested: data.get("team"), hoursPerWeekRequired: Number(data.get("hours")), description: data.get("description") }, "Milestone details updated.");
  }

  const selectedCandidate = milestone.candidates.find((item) => item.personId === personId);
  return <article className="milestone-card">
    <div className="milestone-card-heading"><div><h3>{milestone.name}</h3><div className="milestone-meta"><span>{milestone.teamRequested}</span><span>{milestone.hoursPerWeekRequired} hours/week requested</span><span>{milestone.status}</span></div></div><span className="notice-tag">{milestone.remainingHoursPerWeek > 0 ? `${milestone.remainingHoursPerWeek} h/wk to fill` : "Resourced"}</span></div>
    {milestone.description && <p className="milestone-description">{milestone.description}</p>}
    <details className="milestone-edit-details"><summary>Edit milestone details</summary><form className="milestone-create-form" onSubmit={updateDetails}>
      <label>Milestone name<input name="name" defaultValue={milestone.name} maxLength={120} required /></label>
      <label>Team requested<select name="team" defaultValue={milestone.teamRequested} required>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
      <label>Hours needed per week<input name="hours" type="number" min="0.1" max="168" step="0.1" defaultValue={milestone.hoursPerWeekRequired} required /></label>
      <label className="milestone-wide">Notes<textarea name="description" rows={2} maxLength={1000} defaultValue={milestone.description} /></label>
      <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</button>
    </form></details>
    <p className="milestone-allocation"><b>Planned:</b> {dateLabel(milestone.plannedStartDate)} – {dateLabel(milestone.plannedEndDate)} <span aria-hidden="true">·</span> <b>Allocated:</b> {milestone.allocatedHoursPerWeek} / {milestone.hoursPerWeekRequired} hours per week</p>
    <form className="milestone-date-form" onSubmit={saveDates}>
      <label>{milestone.firstBookingDate ? "Expected start" : "Planned start"}<input type="date" name="start" required defaultValue={milestone.firstBookingDate ? milestone.expectedStartDate : milestone.plannedStartDate} /></label>
      <label>{milestone.firstBookingDate ? "Expected end" : "Planned end"}<input type="date" name="end" required min={milestone.firstBookingDate ? milestone.expectedStartDate : milestone.plannedStartDate} defaultValue={milestone.firstBookingDate ? milestone.expectedEndDate : milestone.plannedEndDate} /></label>
      {milestone.firstBookingDate && <p className="milestone-locked-note">Planned dates locked after first booking on {dateLabel(milestone.firstBookingDate)}.</p>}
      <button className="text-button" type="submit" disabled={saving}>{saving ? "Saving…" : milestone.firstBookingDate ? "Update expected dates" : "Update planned dates"}</button>
    </form>
    {milestone.remainingHoursPerWeek > 0 && <>
      {milestone.noAvailablePeople ? <p className="milestone-flag">No one in {milestone.teamRequested} currently has available capacity for these dates.</p> : <form className="milestone-book-form" onSubmit={createBooking}>
        <label>Available person<select value={personId} onChange={(event) => updatePerson(event.target.value)} required>{milestone.candidates.map((candidate) => <option key={candidate.personId} value={candidate.personId}>{candidate.name} · up to {candidate.availableHoursPerWeek} h/wk free</option>)}</select></label>
        <label>Hours per week<input type="number" min="0.1" step="0.1" max={Math.min(milestone.remainingHoursPerWeek, selectedCandidate?.availableHoursPerWeek ?? 0)} value={hours} onChange={(event) => setHours(Number(event.target.value))} required /></label>
        <span className="milestone-meta">{selectedCandidate ? `${selectedCandidate.availableHoursPerWeek} h/wk available during this period` : "Select an available person"}</span>
        <button className="primary-action" type="submit" disabled={saving || !personId || hours <= 0}>{saving ? "Booking…" : "Book this person"}</button>
      </form>}
    </>}
    {milestone.bookings.length > 0 && <p className="milestone-meta">People on this milestone: {milestone.bookings.map((booking) => `${booking.personName} (${booking.hoursPerWeek} h/wk${booking.personConfirmationStatus === "Awaiting response" ? ", awaiting confirmation" : ""})`).join(" · ")}</p>}
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </article>;
}

export function ProjectMilestones({ projectId, milestones, teams }: { projectId: string; milestones: MilestoneRow[]; teams: string[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/milestones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, name: data.get("name"), plannedStartDate: data.get("start"), plannedEndDate: data.get("end"), hoursPerWeekRequired: Number(data.get("hours")), teamRequested: data.get("team"), description: data.get("description") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Milestone could not be created.");
      form.reset(); setMessage("Milestone added. Available people are shown below."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Milestone could not be created."); }
    finally { setSaving(false); }
  }
  return <div className="project-milestones-workspace">
    <form className="milestone-create-form" onSubmit={createMilestone}>
      <label>Milestone name<input name="name" maxLength={120} required placeholder="e.g. Partnership launch" /></label>
      <label>Team requested<select name="team" required defaultValue=""><option value="" disabled>Choose a team</option>{teams.map((team) => <option key={team}>{team}</option>)}</select></label>
      <label>Hours needed per week<input name="hours" type="number" min="0.1" max="168" step="0.1" required /></label>
      <label>Planned start<input name="start" type="date" required /></label>
      <label>Planned end<input name="end" type="date" required /></label>
      <label className="milestone-wide">Notes<textarea name="description" rows={2} maxLength={1000} /></label>
      <button className="primary-action" type="submit" disabled={saving}>{saving ? "Adding milestone…" : "Add milestone"}</button>
    </form>
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
    <div className="milestone-list">{milestones.map((milestone) => <MilestoneCard key={milestone.id} milestone={milestone} teams={teams} />)}{!milestones.length && <p className="milestone-empty">No milestones yet. Add one with dates, weekly hours and the team you need.</p>}</div>
  </div>;
}
