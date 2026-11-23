import "server-only";

import { airtable } from "@/config/airtable";
import { listAirtableRecords } from "@/lib/airtable/records";

const tableSpecs = [
  {
    key: "people",
    label: "People",
    fieldIds: [airtable.fields.people.employeeId, airtable.fields.people.lastSeenInHRFile],
  },
  { key: "projectsAndBids", label: "Projects and bids", fieldIds: [airtable.fields.projectsAndBids.name] },
  { key: "plannedLeave", label: "Planned leave", fieldIds: [airtable.fields.plannedLeave.leaveId] },
  { key: "resourceBookings", label: "Resource bookings", fieldIds: [airtable.fields.resourceBookings.bookingId] },
  { key: "publicHolidays", label: "Public holidays", fieldIds: [airtable.fields.publicHolidays.label] },
  { key: "settings", label: "Settings", fieldIds: [airtable.fields.settings.settingName] },
] as const;

export type AirtableReadOverview = {
  tableCounts: Array<{ label: string; count: number }>;
  peopleLastSeenInHrFile: string | null;
};

export async function getAirtableReadOverview(): Promise<AirtableReadOverview> {
  const [firstBatch, secondBatch, importLog] = await Promise.all([
    Promise.all(
    tableSpecs.slice(0, 3).map(async (table) => ({
      table,
      records: await listAirtableRecords(table.key, [...table.fieldIds]),
    })),
    ),
    Promise.all(
    tableSpecs.slice(3).map(async (table) => ({
      table,
      records: await listAirtableRecords(table.key, [...table.fieldIds]),
    })),
    ),
    listAirtableRecords("importLog", [airtable.fields.importLog.importType, airtable.fields.importLog.committedAtUtc]),
  ]);
  const batches = [...firstBatch, ...secondBatch];
  const peopleRecords = firstBatch.find(({ table }) => table.key === "people")?.records ?? [];
  const lastSeenDates = peopleRecords
    .map(({ fields }) => fields[airtable.fields.people.lastSeenInHRFile])
    .filter((value): value is string => typeof value === "string");
  const latestSnapshot = importLog
    .filter((record) => ["People", "Planned Leave"].includes(String(record.fields[airtable.fields.importLog.importType] ?? "")))
    .map((record) => record.fields[airtable.fields.importLog.committedAtUtc])
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  return {
    tableCounts: batches.map(({ table, records }) => ({
      label: table.label,
      count: records.length,
    })),
    peopleLastSeenInHrFile: latestSnapshot ?? lastSeenDates.sort().at(-1) ?? null,
  };
}
