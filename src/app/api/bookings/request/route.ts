import { NextResponse } from "next/server";
import { createBookingRequest } from "@/lib/airtable/workspace";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as { projectId?: unknown; startDate?: unknown; endDate?: unknown; hoursPerWeek?: unknown; note?: unknown };
    if (typeof body.projectId !== "string" || typeof body.startDate !== "string" || typeof body.endDate !== "string") return NextResponse.json({ error: "Choose a project and enter the date range." }, { status: 400 });
    const hoursPerWeek = Number(body.hoursPerWeek);
    const result = await createBookingRequest({ account, projectId: body.projectId, startDate: body.startDate, endDate: body.endDate, hoursPerWeek, note: typeof body.note === "string" ? body.note : "" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send this request." }, { status: 400 });
  }
}
