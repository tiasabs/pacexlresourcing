import { NextResponse } from "next/server";
import { saveDemoAccount } from "@/lib/airtable/resourcing-flow";
import type { AssignedRole } from "@/lib/demo/accounts";
import { getDemoSession } from "@/lib/demo/session";

const roles: AssignedRole[] = ["admin", "c_suite", "hr", "line_manager", "project_lead"];

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const assigned = Array.isArray(body.roles) ? body.roles.filter((role): role is AssignedRole => typeof role === "string" && roles.includes(role as AssignedRole)) : [];
    await saveDemoAccount(account, { id: typeof body.id === "string" ? body.id : undefined, label: String(body.label ?? ""), buttonLabel: String(body.buttonLabel ?? ""), personId: String(body.personId ?? ""), roles: assigned, enabled: body.enabled === true });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The demo account could not be saved." }, { status: 400 });
  }
}
