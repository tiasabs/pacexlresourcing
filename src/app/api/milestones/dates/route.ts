import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { updateMilestoneDates } from "@/lib/airtable/workspace";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    await updateMilestoneDates(account, String(body.milestoneId ?? ""), {
      plannedStartDate: typeof body.plannedStartDate === "string" ? body.plannedStartDate : undefined,
      plannedEndDate: typeof body.plannedEndDate === "string" ? body.plannedEndDate : undefined,
      expectedStartDate: typeof body.expectedStartDate === "string" ? body.expectedStartDate : undefined,
      expectedEndDate: typeof body.expectedEndDate === "string" ? body.expectedEndDate : undefined,
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Milestone dates could not be updated." }, { status: 400 });
  }
}
