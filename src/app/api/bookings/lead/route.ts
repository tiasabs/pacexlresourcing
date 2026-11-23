import { NextResponse } from "next/server";
import { createBooking } from "@/lib/airtable/resourcing-flow";
import { hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account || !hasAnyRole(account, ["project_lead", "admin"])) return NextResponse.json({ error: "You are not allowed to create bookings." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const allocations = Array.isArray(body.allocations) ? body.allocations.map((item) => item as { milestoneId: string; hoursPerWeek: number }) : [];
    const result = await createBooking(account, { projectId: String(body.projectId ?? ""), personId: String(body.personId ?? ""), team: String(body.team ?? ""), startDate: String(body.startDate ?? ""), endDate: String(body.endDate ?? ""), allocations });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The booking could not be created." }, { status: 400 });
  }
}
