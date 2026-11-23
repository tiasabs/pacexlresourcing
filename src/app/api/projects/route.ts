import { NextResponse } from "next/server";
import { createProjectOrBid, updateProjectDetails } from "@/lib/airtable/resourcing-flow";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.type !== "Project" && body.type !== "Bid") return NextResponse.json({ error: "Choose Project or Bid." }, { status: 400 });
    const id = await createProjectOrBid(account, { name: String(body.name ?? ""), client: String(body.client ?? ""), type: body.type, leadId: typeof body.leadId === "string" ? body.leadId : undefined, bidDueDate: String(body.bidDueDate ?? ""), bidDeadline: String(body.bidDeadline ?? "") });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The record could not be created." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== "string") return NextResponse.json({ error: "Choose a Project or Bid." }, { status: 400 });
    await updateProjectDetails(account, body.projectId, { name: String(body.name ?? ""), client: String(body.client ?? ""), leadId: typeof body.leadId === "string" ? body.leadId : undefined, bidDueDate: String(body.bidDueDate ?? ""), bidDeadline: String(body.bidDeadline ?? "") });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Project or Bid could not be updated." }, { status: 400 });
  }
}
