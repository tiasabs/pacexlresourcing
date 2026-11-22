import { NextResponse } from "next/server";
import { getAirtableConfigStatus } from "@/lib/airtable/config-check";

export async function GET() {
  return NextResponse.json(await getAirtableConfigStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
