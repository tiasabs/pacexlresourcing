import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { createMilestone } from "@/lib/airtable/resourcing-flow";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = await createMilestone(account, { projectId: String(body.projectId ?? ""), name: String(body.name ?? ""), startDate: String(body.plannedStartDate ?? ""), endDate: String(body.plannedEndDate ?? "") });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Milestone could not be created." }, { status: 400 });
  }
}
