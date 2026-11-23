"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Project = { id: string; name: string; leadIds: string[] };

export function BookingRequestForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const requestedStart = String(form.get("startDate") ?? "");
    const requestedEnd = String(form.get("endDate") ?? "");
    if (requestedEnd < requestedStart) {
      setMessage("End date must be on or after the start date.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/bookings/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: form.get("projectId"), startDate: form.get("startDate"), endDate: form.get("endDate"), hoursPerWeek: Number(form.get("hoursPerWeek")), note: form.get("note") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The request could not be sent.");
      formElement.reset();
      setStartDate(""); setEndDate("");
      setMessage(`Request sent to ${result.leadNames}. It’s a reminder for the Project Lead; it does not reserve capacity until they create a booking.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request could not be sent."); }
    finally { setBusy(false); }
  }
  return <section className="request-card">
    <p className="eyebrow">Was a project agreed offline?</p><h2>Ask the Project Lead to record it</h2>
    <p>Send a reminder to the Project Lead to record work agreed offline. A request does not reserve capacity; only a booking does.</p>
    {projects.length ? <form className="booking-request-form" onSubmit={submit}>
      <label className="booking-project-label">Project<select name="projectId" required defaultValue=""><option value="" disabled>Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label>Start date<input name="startDate" type="date" required value={startDate} onChange={(event) => { setStartDate(event.target.value); if (endDate && event.target.value > endDate) setEndDate(""); }} /></label>
      <label>End date<input name="endDate" type="date" required min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      <label>Hours per week<input name="hoursPerWeek" type="number" min="0.5" max="168" step="0.5" required /></label>
      <label className="request-note-label">Note (optional)<textarea name="note" maxLength={500} rows={2} placeholder="Add context for the Project Lead" /></label>
      <button className="primary-action" disabled={busy} type="submit">{busy ? "Sending request…" : "Send request to Project Lead"}</button>
      {message && <p className={`upload-message ${message.startsWith("Request sent") ? "upload-message-success" : "upload-message-warning"}`} role="status">{message}</p>}
    </form> : <p className="empty-state">No projects with an assigned Project Lead are available yet.</p>}
  </section>;
}
