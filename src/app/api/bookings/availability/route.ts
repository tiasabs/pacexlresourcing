import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/airtable/resourcing-flow";
import { hasAnyRole } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export async function GET(request: Request) {
  const account = await getDemoSession();
  if (!account || !hasAnyRole(account, ["project_lead", "admin"])) return NextResponse.json({ error: "You are not allowed to check team availability." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    const people = await getAvailability(account, { projectId: params.get("projectId") ?? "", team: params.get("team") ?? "", startDate: params.get("startDate") ?? "", endDate: params.get("endDate") ?? "" });
    return NextResponse.json({ people }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Availability could not be loaded." }, { status: 400 });
  }
}
