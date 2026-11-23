import "server-only";

import { airtable } from "@/config/airtable";
import { listAirtableRecords, type AirtableRecord } from "@/lib/airtable/records";
import type { AssignedRole, DemoAccount, DerivedRole } from "@/lib/demo/accounts";

const get = (record: AirtableRecord, fieldId: string) => record.fields[fieldId];
const text = (record: AirtableRecord, fieldId: string) => typeof get(record, fieldId) === "string" ? get(record, fieldId) as string : "";
const linkedIds = (record: AirtableRecord, fieldId: string) => Array.isArray(get(record, fieldId)) ? get(record, fieldId) as string[] : [];

const personaDescriptions: Record<string, string> = {
  Individual: "See your own workload, bookings and requests.",
  "Line Manager": "See your own bookings and the bookings of your direct reports.",
  "Project Lead": "See bookings and requests for the projects you lead.",
  Admin: "Access all features and records.",
  "C-Suite": "See your own bookings and organisation-wide utilisation reports.",
  HR: "See your own bookings and upload People and planned leave information.",
};

const roleNames: Record<string, AssignedRole> = { Admin: "admin", "C-Suite": "c_suite", HR: "hr" };
const personaOrder = ["Individual", "Line Manager + Individual", "Project Lead + Individual", "Admin + Individual", "C-Suite + Individual", "HR + Individual"];

export async function getDemoAccounts(): Promise<DemoAccount[]> {
  const f = airtable.fields;
  const [accounts, people, projects] = await Promise.all([
    listAirtableRecords("appAccounts", [f.appAccounts.demoAccountLabel, f.appAccounts.person, f.appAccounts.appRoles, f.appAccounts.demoButtonLabel, f.appAccounts.accountStatus]),
    listAirtableRecords("people", [f.people.fullName, f.people.firstName, f.people.lastName, f.people.lineManager]),
    listAirtableRecords("projectsAndBids", [f.projectsAndBids.lead]),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const lineManagerIds = new Set(people.flatMap((person) => linkedIds(person, f.people.lineManager)));
  const projectLeadIds = new Set(projects.flatMap((project) => linkedIds(project, f.projectsAndBids.lead)));

  return accounts.flatMap((record) => {
    if (text(record, f.appAccounts.accountStatus) !== "Enabled") return [];
    const personId = linkedIds(record, f.appAccounts.person)[0];
    const person = personId ? peopleById.get(personId) : undefined;
    if (!personId || !person) return [];
    const label = text(record, f.appAccounts.demoButtonLabel) || text(record, f.appAccounts.demoAccountLabel) || "Demo account";
    const personName = text(person, f.people.fullName) || [text(person, f.people.firstName), text(person, f.people.lastName)].filter(Boolean).join(" ");
    const assignedNames = get(record, f.appAccounts.appRoles);
    const assignedRoles = (Array.isArray(assignedNames) ? assignedNames : [])
      .map((item) => typeof item === "string" ? item : typeof item === "object" && item && "name" in item ? String(item.name) : "")
      .map((name) => roleNames[name])
      .filter((role): role is AssignedRole => Boolean(role));
    const derivedRoles: DerivedRole[] = [];
    if (lineManagerIds.has(personId)) derivedRoles.push("line_manager");
    if (projectLeadIds.has(personId)) derivedRoles.push("project_lead");
    const canonical = label.split(" + ")[0];
    return [{
      id: record.id,
      title: label,
      label: personName || text(record, f.appAccounts.demoAccountLabel) || label,
      description: personaDescriptions[canonical] ?? "See your own workload and bookings.",
      personId,
      firstName: text(person, f.people.firstName) || personName.split(" ")[0] || "there",
      assignedRoles,
      derivedRoles,
    }];
  }).sort((a, b) => personaOrder.indexOf(a.title) - personaOrder.indexOf(b.title));
}

export async function getDemoAccount(accountId: string) {
  return (await getDemoAccounts()).find((account) => account.id === accountId) ?? null;
}
