"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MilestoneRow, AvailablePerson } from "@/lib/airtable/resourcing-flow";

export function ProjectBookingForm({ projectId, milestones, teams }: { projectId: string; milestones: MilestoneRow[]; teams: string[] }) {
  const router = useRouter();
  const [team, setTeam] = useState(teams[0] ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [people, setPeople] = useState<AvailablePerson[]>([]);
  const [personId, setPersonId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [hours, setHours] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedHours = useMemo(() => Object.entries(selected).filter(([, on]) => on).reduce((sum, [id]) => sum + (Number(hours[id]) || 0), 0), [selected, hours]);

  useEffect(() => {
    if (!team || !startDate || !endDate || endDate < startDate) { setPeople([]); setPersonId(""); return; }
    const query = new URLSearchParams({ projectId, team, startDate, endDate });
    let active = true;
    void fetch(`/api/bookings/availability?${query}`, { cache: "no-store" }).then((response) => response.json()).then((body) => {
      if (!active) return;
      setPeople(Array.isArray(body.people) ? body.people : []);
      setPersonId((current) => body.people?.some((person: AvailablePerson) => person.personId === current) ? current : body.people?.[0]?.personId ?? "");
    }).catch(() => { if (active) setPeople([]); });
    return () => { active = false; };
  }, [projectId, team, startDate, endDate]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const allocations = Object.entries(selected).filter(([, on]) => on).map(([milestoneId]) => ({ milestoneId, hoursPerWeek: Number(hours[milestoneId]) }));
    try {
      const response = await fetch("/api/bookings/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, team, startDate, endDate, personId, allocations }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The booking could not be saved.");
      setMessage(body.capacityWarning ? "Booking saved. Some weeks are above the person’s capacity and should be reviewed." : "Booking saved. The person can now see it in My bookings.");
      setSelected({}); setHours({}); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The booking could not be saved."); }
    finally { setBusy(false); }
  }

  return <form className="milestone-create-form booking-create-form" onSubmit={create}>
    <label>Team<select value={team} onChange={(event) => setTeam(event.target.value)} required><option value="" disabled>Choose a team</option>{teams.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
    <label>End date<input type="date" min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
    <label>Available person<select value={personId} onChange={(event) => setPersonId(event.target.value)} required><option value="" disabled>Choose a person</option>{people.map((person) => <option key={person.personId} value={person.personId}>{person.name} · {person.availableHoursPerWeek} h/wk available · {person.loadStatus} ({person.loadPercent}%)</option>)}</select></label>
    {people.find((person) => person.personId === personId)?.capacityWarning && <p className="hr-warning booking-wide">This person is already at capacity in at least one selected week. You can still make the booking.</p>}
    <fieldset className="milestone-allocation-picker booking-wide"><legend>Milestones and weekly hours</legend>{milestones.map((milestone) => <div className="allocation-picker-row" key={milestone.id}>
      <label className="allocation-picker-name"><input type="checkbox" checked={Boolean(selected[milestone.id])} onChange={(event) => setSelected((current) => ({ ...current, [milestone.id]: event.target.checked }))} /><span>{milestone.name}<small>{milestone.expectedStartDate || milestone.plannedStartDate} – {milestone.expectedEndDate || milestone.plannedEndDate}</small></span></label>
      <label className="allocation-hours">Hours / week<input type="number" min="0.01" max="168" step="0.01" value={hours[milestone.id] ?? ""} disabled={!selected[milestone.id]} onChange={(event) => setHours((current) => ({ ...current, [milestone.id]: event.target.value }))} required={Boolean(selected[milestone.id])} /></label>
    </div>)}{!milestones.length && <p className="empty-state">Add project milestones before making a booking.</p>}</fieldset>
    <p className="booking-wide milestone-meta">Total commitment: <strong>{selectedHours.toFixed(2)} hours per week</strong>. Milestone dates must cover the full booking range.</p>
    <button className="primary-action" type="submit" disabled={busy || !personId || !milestones.length}>{busy ? "Saving booking…" : "Book person"}</button>
    {error && <p className="upload-message upload-message-error booking-wide" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success booking-wide" role="status">{message}</p>}
  </form>;
}
