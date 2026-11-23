import { NextResponse } from "next/server";
import { convertBidToProject, setBidDecision } from "@/lib/airtable/resourcing-flow";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as { projectId?: unknown; action?: unknown; decision?: unknown };
    if (typeof body.projectId !== "string") return NextResponse.json({ error: "Choose a Bid." }, { status: 400 });
    if (body.action === "convert") await convertBidToProject(account, body.projectId);
    else if (body.action === "decision" && (body.decision === "Pending" || body.decision === "Go" || body.decision === "No-go")) await setBidDecision(account, body.projectId, body.decision);
    else return NextResponse.json({ error: "Choose a valid Bid action." }, { status: 400 });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Bid could not be updated." }, { status: 400 });
  }
}
