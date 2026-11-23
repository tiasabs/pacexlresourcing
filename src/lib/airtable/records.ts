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

export async function createAirtableRecords(
  tableKey: AirtableTableKey,
  records: Array<{ fields: Record<string, unknown> }>,
  typecast = false,
) {
  const tableId = airtable.tables[tableKey];
  if (!tableId) throw new Error(`The Airtable table ID for ${tableKey} is not configured.`);
  const created: AirtableRecord[] = [];
  for (let index = 0; index < records.length; index += 10) {
    const result = await airtableRequest<{ records: AirtableRecord[] }>(
      `${airtable.baseId}/${tableId}?returnFieldsByFieldId=true`,
      { method: "POST", body: JSON.stringify({ records: records.slice(index, index + 10), typecast }) },
    );
    created.push(...result.records);
  }
  return created;
}

export async function updateAirtableRecords(
  tableKey: AirtableTableKey,
  records: Array<{ id: string; fields: Record<string, unknown> }>,
  typecast = false,
) {
  const tableId = airtable.tables[tableKey];
  if (!tableId) throw new Error(`The Airtable table ID for ${tableKey} is not configured.`);
  const updated: AirtableRecord[] = [];
  for (let index = 0; index < records.length; index += 10) {
    const result = await airtableRequest<{ records: AirtableRecord[] }>(
      `${airtable.baseId}/${tableId}?returnFieldsByFieldId=true`,
      { method: "PATCH", body: JSON.stringify({ records: records.slice(index, index + 10), typecast }) },
    );
    updated.push(...result.records);
  }
  return updated;
}

export async function deleteAirtableRecords(tableKey: AirtableTableKey, recordIds: string[]) {
  const tableId = airtable.tables[tableKey];
  if (!tableId) throw new Error(`The Airtable table ID for ${tableKey} is not configured.`);
  for (let index = 0; index < recordIds.length; index += 10) {
    const query = new URLSearchParams();
    for (const id of recordIds.slice(index, index + 10)) query.append("records[]", id);
    await airtableRequest(`${airtable.baseId}/${tableId}?${query.toString()}`, { method: "DELETE" });
  }
}
