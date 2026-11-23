"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BookingRow } from "@/lib/airtable/workspace";

export function BookingRequestInbox({ requests }: { requests: BookingRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  async function decide(recordId: string, approve: boolean) {
    setBusyId(recordId); setError("");
    try {
      const response = await fetch("/api/bookings/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingRecordId: recordId, approve }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Request could not be updated.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request could not be updated."); }
    finally { setBusyId(""); }
  }
  if (!requests.length) return <p className="empty-state">No booking requests are waiting for your decision.</p>;
  return <div className="request-inbox">
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}
    {requests.map((request) => <article className="request-inbox-item" key={request.id}>
      <div><strong>{request.personName}</strong><span> requested {request.hoursPerWeek} hours per week on <strong>{request.projectName}</strong></span>
        <p>{request.startDate} – {request.endDate}{request.requestNote ? ` · ${request.requestNote}` : ""}</p>
        {request.clashFlagged && <p className="hr-warning">The person&apos;s bookings are above their weekly capacity during some of these dates. Please discuss the request with them before deciding.</p>}
      </div>
      <div className="request-actions"><button className="primary-action" disabled={Boolean(busyId)} onClick={() => decide(request.id, true)} type="button">{busyId === request.id ? "Saving…" : "Approve"}</button><button className="text-button" disabled={Boolean(busyId)} onClick={() => decide(request.id, false)} type="button">Decline</button></div>
    </article>)}
  </div>;
}
