import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { updateMilestone } from "@/lib/airtable/resourcing-flow";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    await updateMilestone(account, String(body.milestoneId ?? ""), { name: String(body.name ?? ""), startDate: String(body.startDate ?? ""), endDate: String(body.endDate ?? "") });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Milestone could not be updated." }, { status: 400 });
  }
}
