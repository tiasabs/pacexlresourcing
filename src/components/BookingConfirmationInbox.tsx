"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BookingRow } from "@/lib/airtable/workspace";

export function BookingConfirmationInbox({ requests }: { requests: BookingRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  async function respond(bookingRecordId: string, confirm: boolean) {
    setBusyId(bookingRecordId); setError("");
    try {
      const response = await fetch("/api/bookings/confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingRecordId, confirm }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Your response could not be saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your response could not be saved.");
    } finally { setBusyId(""); }
  }
  if (!requests.length) return null;
  return <section className="capacity-notice booking-confirmation-notice" aria-labelledby="booking-confirmation-title">
    <strong id="booking-confirmation-title">A Project Lead has requested your time</strong>
    <p>Confirm the booking or let the Project Lead know you cannot take it.</p>
    {error && <p role="alert">{error}</p>}
    <ul className="booking-confirmation-list">{requests.map((row) => <li key={row.id}>
      <div><b>{row.projectName}</b>{row.milestoneName && <span>{row.milestoneName}</span>}<small>{row.startDate} – {row.endDate} · {row.hoursPerWeek} hours per week</small></div>
      <div className="request-actions"><button className="primary-action" type="button" disabled={Boolean(busyId)} onClick={() => respond(row.id, true)}>{busyId === row.id ? "Saving…" : "Confirm"}</button><button className="text-button" type="button" disabled={Boolean(busyId)} onClick={() => respond(row.id, false)}>Can’t take it</button></div>
    </li>)}</ul>
  </section>;
}
