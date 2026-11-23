"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ProjectRow } from "@/lib/airtable/resourcing-flow";

export function ProjectEditForm({ project, admin, leads }: { project: ProjectRow; admin: boolean; leads: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, name: data.get("name"), client: data.get("client"), leadId: data.get("leadId"), bidDueDate: data.get("bidDueDate"), bidDeadline: data.get("bidDeadline") }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The record could not be updated.");
      setMessage("Details saved."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The record could not be updated."); }
    finally { setBusy(false); }
  }
  return <details className="project-create-panel"><summary><strong>Edit {project.type}</strong><span>Name, client and lead details</span></summary><form className="project-create-form" onSubmit={save}>
    <label>Name<input name="name" defaultValue={project.name} maxLength={160} required /></label><label>Client<input name="client" defaultValue={project.client} maxLength={160} /></label>
    {admin && <label>Project Lead<select name="leadId" defaultValue={project.leadIds[0] ?? ""}>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>}
    {project.type === "Bid" && <><label>Internal Bid Due Date<input name="bidDueDate" type="date" defaultValue={project.bidDueDate} required /></label><label>External submission deadline<input name="bidDeadline" type="date" defaultValue={project.bidDeadline} required /></label></>}
    <button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>{error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </form></details>;
}
