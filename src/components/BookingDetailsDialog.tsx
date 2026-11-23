"use client";

import { useEffect, useRef } from "react";
import type { BookingRow } from "@/lib/airtable/resourcing-flow";
import { bookingStatusLabel } from "@/components/BookingsTable";

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function BookingDetailsDialog({ booking, onClose }: { booking: BookingRow | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (booking && element && !element.open) element.showModal();
    if (!booking && element?.open) element.close();
  }, [booking]);
  if (!booking) return null;
  return <dialog ref={dialog} className="booking-details-dialog" aria-labelledby="booking-details-title" onClose={onClose} onCancel={onClose}>
    <div className="hr-dialog-heading"><div><p className="eyebrow">Booking details</p><h2 id="booking-details-title">{booking.projectName}</h2></div><button className="text-button" type="button" onClick={() => dialog.current?.close()}>Close</button></div>
    <dl className="booking-detail-list">
      <div><dt>Dates</dt><dd>{formatDate(booking.startDate)} – {formatDate(booking.endDate)}</dd></div>
      <div><dt>Hours per week</dt><dd>{booking.hoursPerWeek}</dd></div>
      <div><dt>Team</dt><dd>{booking.teamRequested || "—"}</dd></div>
      <div><dt>Milestones</dt><dd>{booking.allocations.map((allocation) => `${allocation.milestoneName} (${allocation.hoursPerWeek} h/wk)`).join(" · ") || "—"}</dd></div>
      <div><dt>Status</dt><dd>{bookingStatusLabel(booking)}</dd></div>
      <div><dt>Project Lead</dt><dd>{booking.leadName || "—"}</dd></div>
      {booking.requestNote && <div><dt>Request note</dt><dd>{booking.requestNote}</dd></div>}
      {booking.clashFlagged && <div className="booking-detail-capacity"><dt>Capacity</dt><dd>Some scheduled weeks are above the capacity review threshold.</dd></div>}
    </dl>
  </dialog>;
}
