import "server-only";

import { airtable } from "@/config/airtable";
import { listAirtableRecords } from "@/lib/airtable/records";

const tableSpecs = [
  { key: "people", label: "People", fieldId: airtable.fields.people.employeeId },
  { key: "projectsAndBids", label: "Projects and bids", fieldId: airtable.fields.projectsAndBids.name },
  { key: "plannedLeave", label: "Planned leave", fieldId: airtable.fields.plannedLeave.leaveId },
  { key: "resourceBookings", label: "Resource bookings", fieldId: airtable.fields.resourceBookings.bookingId },
  { key: "publicHolidays", label: "Public holidays", fieldId: airtable.fields.publicHolidays.label },
  { key: "settings", label: "Settings", fieldId: airtable.fields.settings.settingName },
] as const;

export type AirtableReadOverview = {
  tableCounts: Array<{ label: string; count: number }>;
  peopleLastSeenInHrFile: string | null;
};

export async function getAirtableReadOverview(): Promise<AirtableReadOverview> {
  const firstBatch = await Promise.all(
    tableSpecs.slice(0, 3).map(async (table) => ({
      table,
      records: await listAirtableRecords(table.key, [table.fieldId]),
    })),
  );
  const secondBatch = await Promise.all(
    tableSpecs.slice(3).map(async (table) => ({
      table,
      records: await listAirtableRecords(table.key, [table.fieldId]),
    })),
  );
  const batches = [...firstBatch, ...secondBatch];
  const peopleRecords = firstBatch.find(({ table }) => table.key === "people")?.records ?? [];
  const lastSeenDates = peopleRecords
    .map(({ fields }) => fields[airtable.fields.people.lastSeenInHRFile])
    .filter((value): value is string => typeof value === "string");

  return {
    tableCounts: batches.map(({ table, records }) => ({
      label: table.label,
      count: records.length,
    })),
    peopleLastSeenInHrFile: lastSeenDates.sort().at(-1) ?? null,
  };
}
