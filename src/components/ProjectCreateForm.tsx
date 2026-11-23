"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function ProjectCreateForm({ admin, leads }: { admin: boolean; leads: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [type, setType] = useState<"Project" | "Bid">("Project");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), client: data.get("client"), type, leadId: data.get("leadId"), bidDueDate: data.get("bidDueDate"), bidDeadline: data.get("bidDeadline") }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The record could not be created.");
      router.push(`/projects/${body.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The record could not be created."); }
    finally { setBusy(false); }
  }
  return <details className="project-create-panel"><summary><strong>Create a Project or Bid</strong><span>Record the work once, then add milestones and bookings</span></summary>
    <form className="project-create-form" onSubmit={submit}>
      <label>Record type<select value={type} onChange={(event) => setType(event.target.value as "Project" | "Bid")}><option>Project</option><option>Bid</option></select></label>
      <label>Name<input name="name" maxLength={160} required /></label>
      <label>Client<input name="client" maxLength={160} /></label>
      {admin && <label>Project Lead<select name="leadId" defaultValue=""><option value="">Assign to me</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>}
      {type === "Bid" && <><label>Internal Bid Due Date<input name="bidDueDate" type="date" required /></label><label>External submission deadline<input name="bidDeadline" type="date" min={undefined} required /></label></>}
      {type === "Bid" && <p className="milestone-meta project-wide">The internal Bid Due Date must be earlier than the submission deadline. You can add milestones and book people while the Bid is being prepared.</p>}
      <button className="primary-action" type="submit" disabled={busy}>{busy ? "Creating…" : `Create ${type}`}</button>
      {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
    </form>
  </details>;
}
