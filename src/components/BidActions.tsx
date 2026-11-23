"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BidActions({ projectId, decision, internalDue, deadline }: { projectId: string; decision: string; internalDue: string; deadline: string }) {
  const router = useRouter();
  const [value, setValue] = useState(decision || "Pending");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function save(action: "decision" | "convert") {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/projects/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, action, decision: value }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The Bid could not be updated.");
      setMessage(action === "convert" ? "Bid converted to a Project. Its milestones and bookings were retained." : "Bid decision saved."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The Bid could not be updated."); }
    finally { setBusy(false); }
  }
  const datesValid = Boolean(internalDue && deadline && internalDue < deadline);
  return <section className="bid-decision-card"><div><p className="eyebrow">Bid decision</p><h2>{decision || "Pending"}</h2><p>Internal due date: {internalDue || "Not set"} · Submission deadline: {deadline || "Not set"}</p>{!datesValid && <p className="hr-warning">Set an internal Bid Due Date earlier than the external deadline before converting.</p>}</div>
    <div className="bid-decision-controls"><label>Decision<select value={value} onChange={(event) => setValue(event.target.value)}><option>Pending</option><option>Go</option><option>No-go</option></select></label><button className="text-button" type="button" disabled={busy} onClick={() => void save("decision")}>{busy ? "Saving…" : "Save decision"}</button>{value === "Go" && <button className="primary-action" type="button" disabled={busy || !datesValid} onClick={() => void save("convert")}>{busy ? "Converting…" : "Convert to Project"}</button>}</div>
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </section>;
}
