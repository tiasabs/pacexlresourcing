import { NextResponse } from "next/server";
import { setDemoSession, clearDemoSession } from "@/lib/demo/session";
import { getDemoAccount } from "@/lib/demo/accounts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { accountId?: unknown }
    | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";

  if (!getDemoAccount(accountId)) {
    return NextResponse.json({ error: "Choose one of the demo accounts." }, { status: 400 });
  }

  await setDemoSession(accountId);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearDemoSession();
  return NextResponse.json({ ok: true });
}
