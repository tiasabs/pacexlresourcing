import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { createProjectMilestone } from "@/lib/airtable/workspace";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = await createProjectMilestone({
      account, projectId: String(body.projectId ?? ""), name: String(body.name ?? ""),
      plannedStartDate: String(body.plannedStartDate ?? ""), plannedEndDate: String(body.plannedEndDate ?? ""),
      hoursPerWeekRequired: Number(body.hoursPerWeekRequired), teamRequested: String(body.teamRequested ?? ""),
      description: typeof body.description === "string" ? body.description : "",
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Milestone could not be created." }, { status: 400 });
  }
}
