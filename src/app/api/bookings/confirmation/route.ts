import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { respondToMilestoneBooking } from "@/lib/airtable/workspace";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as { bookingRecordId?: string; confirm?: boolean };
    if (!body.bookingRecordId || typeof body.confirm !== "boolean") return NextResponse.json({ error: "Choose a booking and response." }, { status: 400 });
    await respondToMilestoneBooking(account, body.bookingRecordId, body.confirm);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Booking response could not be saved." }, { status: 400 });
  }
}
