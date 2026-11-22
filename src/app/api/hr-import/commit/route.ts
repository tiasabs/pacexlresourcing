import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { canRunPeopleRefresh } from "@/lib/auth/permissions";
import { commitHrImport } from "@/lib/airtable/hr-import";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account || !canRunPeopleRefresh(account)) return NextResponse.json({ error: "You are not allowed to commit HR files." }, { status: 403 });
  try {
    const body = await request.json() as { previewId?: string };
    if (!body.previewId) return NextResponse.json({ error: "Missing import preview." }, { status: 400 });
    return NextResponse.json(await commitHrImport(body.previewId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not commit this import." }, { status: 400 });
  }
}
