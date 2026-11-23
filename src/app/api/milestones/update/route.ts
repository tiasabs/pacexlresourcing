import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { updateProjectMilestone } from "@/lib/airtable/workspace";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    await updateProjectMilestone(account, String(body.milestoneId ?? ""), {
      name: String(body.name ?? ""), teamRequested: String(body.teamRequested ?? ""),
      hoursPerWeekRequired: Number(body.hoursPerWeekRequired), description: typeof body.description === "string" ? body.description : "",
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Milestone could not be updated." }, { status: 400 });
  }
}
