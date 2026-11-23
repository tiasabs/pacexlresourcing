"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { MilestoneRow } from "@/lib/airtable/resourcing-flow";

function label(date: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function ProjectMilestones({ projectId, milestones }: { projectId: string; milestones: MilestoneRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, path: string, payload: Record<string, unknown>, success: string, form?: HTMLFormElement) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The milestone could not be saved.");
      if (form) form.reset();
      setMessage(success); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The milestone could not be saved."); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget, data = new FormData(form);
    void submit(event, "/api/milestones", { projectId, name: data.get("name"), plannedStartDate: data.get("start"), plannedEndDate: data.get("end") }, "Milestone added.", form);
  }
  return <div className="project-milestones-workspace">
    <form className="milestone-create-form" onSubmit={create}>
      <label>Milestone name<input name="name" maxLength={120} required placeholder="e.g. Partnership launch" /></label>
      <label>Planned start<input name="start" type="date" required /></label>
      <label>Planned end<input name="end" type="date" required /></label>
      <button className="primary-action" type="submit" disabled={busy}>{busy ? "Adding…" : "Add milestone"}</button>
    </form>
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
    <div className="milestone-list">{milestones.map((milestone) => {
      const started = Boolean(milestone.firstBookingDate);
      return <article className="milestone-card" key={milestone.id}>
        <div className="milestone-card-heading"><div><h3>{milestone.name}</h3><p className="milestone-meta">{milestone.bookingCount} booking{milestone.bookingCount === 1 ? "" : "s"} · {milestone.allocatedHoursPerWeek.toFixed(2).replace(/\.00$/, "")} hours/week allocated</p></div>{started && <span className="notice-tag">Planned dates locked</span>}</div>
        <p className="milestone-allocation"><b>Planned:</b> {label(milestone.plannedStartDate)} – {label(milestone.plannedEndDate)}<br /><b>Expected:</b> {label(milestone.expectedStartDate)} – {label(milestone.expectedEndDate)}</p>
        <form className="milestone-date-form" onSubmit={(event) => {
          const form = event.currentTarget, data = new FormData(form);
          void submit(event, "/api/milestones/update", { milestoneId: milestone.id, name: data.get("name"), startDate: data.get("start"), endDate: data.get("end") }, "Milestone updated.");
        }}>
          <label>Milestone name<input name="name" defaultValue={milestone.name} required maxLength={120} /></label>
          <label>{started ? "Expected start" : "Planned start"}<input type="date" name="start" required defaultValue={started ? milestone.expectedStartDate : milestone.plannedStartDate} /></label>
          <label>{started ? "Expected end" : "Planned end"}<input type="date" name="end" required min={started ? milestone.expectedStartDate : milestone.plannedStartDate} defaultValue={started ? milestone.expectedEndDate : milestone.plannedEndDate} /></label>
          <button className="text-button" type="submit" disabled={busy}>{busy ? "Saving…" : started ? "Update milestone" : "Save planned dates"}</button>
        </form>
      </article>;
    })}{!milestones.length && <p className="milestone-empty">No milestones yet. Add the project’s expected activities and dates before booking people.</p>}</div>
  </div>;
}
