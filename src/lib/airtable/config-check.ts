import "server-only";

import { airtable } from "@/config/airtable";
import { fetchAirtableTables } from "@/lib/airtable/client";

const requiredTables = [
  "people",
  "projectsAndBids",
  "plannedLeave",
  "resourceBookings",
  "publicHolidays",
  "settings",
  "appAccounts",
  "personWeeks",
  "importLog",
  "projectMilestones",
  "bookingTerms",
  "bookingAllocations",
  "weeklyActuals",
] as const;

export async function getAirtableConfigStatus() {
  const missingTableIds = requiredTables.filter((key) => !airtable.tables[key]);
  const hasToken = Boolean(process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN);

  if (!hasToken) {
    return {
      connected: false,
      baseConfigured: Boolean(airtable.baseId),
      missingTableIds,
      message: "Add the Airtable token to the server environment to check the base.",
    };
  }

  try {
    const result = await fetchAirtableTables();
    const actualIds = new Set(result.tables.map((table) => table.id));
    const configuredTableIds = requiredTables
      .map((key) => airtable.tables[key])
      .filter((id): id is NonNullable<typeof id> => Boolean(id));
    const unverifiedTableIds = configuredTableIds.filter((id) => !actualIds.has(id));

    return {
      connected: true,
      baseConfigured: true,
      missingTableIds,
      unverifiedTableIds,
      message: missingTableIds.length
        ? "The base is reachable; some planned tables still need to be added and configured."
        : "The base is reachable and all required table IDs are configured.",
    };
  } catch {
    return {
      connected: false,
      baseConfigured: Boolean(airtable.baseId),
      missingTableIds,
      message: "The Airtable base could not be reached. Check the server token and base access.",
    };
  }
}
