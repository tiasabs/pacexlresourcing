import { NextResponse } from "next/server";
import { saveWeeklyActuals } from "@/lib/airtable/resourcing-flow";
import { getDemoSession } from "@/lib/demo/session";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account) return NextResponse.json({ error: "Choose a demo account first." }, { status: 401 });
  try {
    const body = await request.json() as { week?: unknown; entries?: unknown };
    if (typeof body.week !== "string" || !Array.isArray(body.entries)) return NextResponse.json({ error: "Choose a week and enter actual hours." }, { status: 400 });
    const entries = body.entries.map((item) => item as { key: string; hours: number | null });
    const result = await saveWeeklyActuals(account, body.week, entries);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Actual hours could not be saved." }, { status: 400 });
  }
}
