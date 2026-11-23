import { NextResponse } from "next/server";
import { resolveBookingRequest } from "@/lib/airtable/resourcing-flow";
import { hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account || !hasAnyRole(account, ["project_lead", "admin"])) return NextResponse.json({ error: "You are not allowed to decide booking requests." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.bookingId !== "string" || typeof body.approve !== "boolean") return NextResponse.json({ error: "Choose a booking request and decision." }, { status: 400 });
    const allocations = Array.isArray(body.allocations) ? body.allocations.map((item) => item as { milestoneId: string; hoursPerWeek: number }) : [];
    const newMilestone = body.newMilestone && typeof body.newMilestone === "object" ? body.newMilestone as { name: string; startDate: string; endDate: string; hoursPerWeek: number } : undefined;
    const result = await resolveBookingRequest(account, { bookingId: body.bookingId, approve: body.approve, startDate: String(body.startDate ?? ""), endDate: String(body.endDate ?? ""), team: String(body.team ?? ""), allocations, newMilestone });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update this request." }, { status: 400 });
  }
}
