import "server-only";

import { airtable } from "@/config/airtable";

const AIRTABLE_API = "https://api.airtable.com/v0";

export class AirtableConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirtableConfigurationError";
  }
}

function getToken() {
  const token = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new AirtableConfigurationError(
      "AIRTABLE_PERSONAL_ACCESS_TOKEN is not configured on the server.",
    );
  }
  return token;
}

export async function airtableRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${AIRTABLE_API}/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Airtable returned ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export async function fetchAirtableTables() {
  return airtableRequest<{ tables: Array<{ id: string; name: string }> }>(
    `meta/bases/${airtable.baseId}/tables`,
  );
}
