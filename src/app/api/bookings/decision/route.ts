import { NextResponse } from "next/server";
import { decideBookingRequest } from "@/lib/airtable/workspace";
import { hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account || !hasAnyRole(account, ["project_lead", "admin"])) return NextResponse.json({ error: "You are not allowed to decide booking requests." }, { status: 403 });
  try {
    const body = await request.json() as { bookingRecordId?: unknown; approve?: unknown };
    if (typeof body.bookingRecordId !== "string" || typeof body.approve !== "boolean") return NextResponse.json({ error: "Choose an approval decision." }, { status: 400 });
    await decideBookingRequest(account, body.bookingRecordId, body.approve);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update this request." }, { status: 400 });
  }
}
