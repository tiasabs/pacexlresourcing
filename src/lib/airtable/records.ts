import "server-only";

import { airtable, type AirtableTableKey } from "@/config/airtable";
import { airtableRequest } from "@/lib/airtable/client";

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableRecordPage = {
  records: AirtableRecord[];
  offset?: string;
};

const pageSize = 100;

export async function listAirtableRecords(
  tableKey: AirtableTableKey,
  fieldIds: string[],
): Promise<AirtableRecord[]> {
  const tableId = airtable.tables[tableKey];
  if (!tableId) {
    throw new Error(`The Airtable table ID for ${tableKey} is not configured.`);
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const query = new URLSearchParams({
      pageSize: String(pageSize),
      returnFieldsByFieldId: "true",
    });
    for (const fieldId of fieldIds) query.append("fields[]", fieldId);
    if (offset) query.set("offset", offset);

    const page = await airtableRequest<AirtableRecordPage>(
      `${airtable.baseId}/${tableId}?${query.toString()}`,
    );
    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  return records;
}
