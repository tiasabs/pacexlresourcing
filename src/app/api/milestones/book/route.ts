import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { createMilestoneBooking } from "@/lib/airtable/workspace";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await createMilestoneBooking(account, String(body.milestoneId ?? ""), String(body.personId ?? ""), Number(body.hoursPerWeek));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Resource could not be booked." }, { status: 400 });
  }
}
