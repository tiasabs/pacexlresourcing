import { NextResponse } from "next/server";
import { getDemoSession } from "@/lib/demo/session";
import { canRunPeopleRefresh } from "@/lib/auth/permissions";
import { previewHrImport, type ImportKind } from "@/lib/airtable/hr-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const account = await getDemoSession();
  if (!account || !canRunPeopleRefresh(account)) return NextResponse.json({ error: "You are not allowed to upload HR files." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File) || (kind !== "people" && kind !== "plannedLeave")) return NextResponse.json({ error: "Choose a CSV file and import type." }, { status: 400 });
    if (file.size > 5_000_000) return NextResponse.json({ error: "CSV files must be smaller than 5 MB." }, { status: 413 });
    const preview = await previewHrImport({ kind: kind as ImportKind, fileName: file.name, csv: await file.text(), uploadedBy: account.title });
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not preview this file." }, { status: 400 });
  }
}
