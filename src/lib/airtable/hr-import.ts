import "server-only";

import { randomUUID } from "node:crypto";
import { airtable } from "@/config/airtable";
import { createAirtableRecords, listAirtableRecords, updateAirtableRecords, type AirtableRecord } from "@/lib/airtable/records";

export type ImportKind = "people" | "plannedLeave";
export type ImportIssue = { row: number; message: string };
export type ImportPreview = {
  previewId: string;
  kind: ImportKind;
  fileName: string;
  rowsReceived: number;
  added: number;
  updated: number;
  unchanged: number;
  markedInactive: number;
  markedCancelled: number;
  missingPercentage: number;
  missingWarning: boolean;
  issues: ImportIssue[];
};

type PendingImport = {
  kind: ImportKind;
  fileName: string;
  rows: Array<Record<string, unknown>>;
  preview: ImportPreview;
  uploadedBy: string;
};

const pending = new Map<string, PendingImport>();
const peopleHeaders = ["Employee ID Number", "First Name", "Middle Name", "Last Name", "Work Email", "Role Name", "Role Level", "Team", "Region", "Contracted Hours", "Working Days per Week", "Line Manager Employee ID", "Status", "Start Date", "End Date"];
const leaveHeaders = ["Leave ID", "Employee ID Number", "Title", "Type", "Status", "Start Date", "End Date", "Leave Days"];
const roleLevels = ["Team Member", "Manager", "Head", "Director", "Other"];
const teams = ["Human Resources", "Legal", "Partnerships", "Operations", "Project", "Finance", "Communications & Data", "Digital"];

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  return rows;
}

function asDate(value: string, field: string, row: number, issues: ImportIssue[]) {
  if (!value) return null;
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : null;
  if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== value) {
    issues.push({ row, message: `${field} must use YYYY-MM-DD.` });
    return null;
  }
  return value;
}

function numberValue(value: string, field: string, row: number, issues: ImportIssue[], allowBlank = false) {
  if (!value && allowBlank) return null;
  const number = Number(value);
  if (!value || !Number.isFinite(number) || number < 0) {
    issues.push({ row, message: `${field} must be a non-negative number${allowBlank ? " or blank" : ""}.` });
    return null;
  }
  return number;
}

function parseRows(csv: string, kind: ImportKind) {
  const matrix = parseCsv(csv);
  const headers = kind === "people" ? peopleHeaders : leaveHeaders;
  const issues: ImportIssue[] = [];
  if (!matrix.length) return { rows: [], issues: [{ row: 1, message: "The CSV is empty." }] };
  if (matrix[0].length !== headers.length || matrix[0].some((value, index) => value !== headers[index])) {
    return { rows: [], issues: [{ row: 1, message: `Headers must exactly match the ${kind === "people" ? "People" : "Planned Leave"} template.` }] };
  }
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [index, cells] of matrix.slice(1).entries()) {
    const rowNumber = index + 2;
    if (cells.length !== headers.length) { issues.push({ row: rowNumber, message: `Expected ${headers.length} columns; found ${cells.length}.` }); continue; }
    const values = Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""])) as Record<string, string>;
    const idKey = kind === "people" ? "Employee ID Number" : "Leave ID";
    const stableId = values[idKey].trim();
    if (!stableId) { issues.push({ row: rowNumber, message: `${idKey} is required.` }); continue; }
    if (seen.has(stableId)) { issues.push({ row: rowNumber, message: `Duplicate ${idKey}: ${stableId}.` }); continue; }
    seen.add(stableId);
    const startDate = asDate(values["Start Date"], "Start Date", rowNumber, issues);
    const endDate = asDate(values["End Date"], "End Date", rowNumber, issues);
    if (startDate && endDate && endDate < startDate) issues.push({ row: rowNumber, message: "End Date must be on or after Start Date." });
    if (kind === "people") {
      const contractedHours = numberValue(values["Contracted Hours"], "Contracted Hours", rowNumber, issues);
      const workDays = numberValue(values["Working Days per Week"], "Working Days per Week", rowNumber, issues);
      if (workDays !== null && (workDays < 1 || workDays > 7)) issues.push({ row: rowNumber, message: "Working Days per Week must be between 1 and 7." });
      for (const field of ["First Name", "Last Name", "Status", "Team", "Region"]) if (!values[field]) issues.push({ row: rowNumber, message: `${field} is required.` });
      if (values.Status && !["Active", "On long leave", "Left organisation"].includes(values.Status)) issues.push({ row: rowNumber, message: "Status must be Active, On long leave, or Left organisation." });
      const teamValues = values.Team.split("|").map((item) => item.trim()).filter(Boolean);
      const levelValues = values["Role Level"].split("|").map((item) => item.trim()).filter(Boolean);
      if (teamValues.some((item) => !teams.includes(item))) issues.push({ row: rowNumber, message: `Team values must be selected from: ${teams.join(", ")}. Separate multiple values with |.` });
      if (levelValues.some((item) => !roleLevels.includes(item))) issues.push({ row: rowNumber, message: `Role Level values must be selected from: ${roleLevels.join(", ")}. Separate multiple values with |.` });
      if (values.Region && !["England", "Wales", "Scotland", "Northern Ireland", "Ireland", "Other"].includes(values.Region)) issues.push({ row: rowNumber, message: "Region must be England, Wales, Scotland, Northern Ireland, Ireland, or Other." });
      rows.push({ ...values, "Contracted Hours": contractedHours, "Working Days per Week": workDays, "Start Date": startDate, "End Date": endDate, _row: rowNumber });
    } else {
      const leaveDays = numberValue(values["Leave Days"], "Leave Days", rowNumber, issues);
      if (!values["Employee ID Number"]) issues.push({ row: rowNumber, message: "Employee ID Number is required." });
      if (!values.Type || !["Annual", "Sick", "Other"].includes(values.Type)) issues.push({ row: rowNumber, message: "Type must be Annual, Sick, or Other." });
      if (!values.Status || !["Requested", "Approved", "Declined"].includes(values.Status)) issues.push({ row: rowNumber, message: "Status must be Requested, Approved, or Declined." });
      if (!startDate || !endDate) issues.push({ row: rowNumber, message: "Start Date and End Date are required for leave." });
      rows.push({ ...values, "Leave Days": leaveDays, "Start Date": startDate, "End Date": endDate, _row: rowNumber });
    }
  }
  return { rows, issues };
}

const val = (record: AirtableRecord, fieldId: string) => record.fields[fieldId];
const stringVal = (record: AirtableRecord, fieldId: string) => typeof val(record, fieldId) === "string" ? val(record, fieldId) as string : "";
const comparable = (value: unknown) => JSON.stringify(value ?? null);

async function getMassMissingGuard() {
  const settings = airtable.fields.settings;
  const rows = await listAirtableRecords("settings", [settings.settingName, settings.massMissingGuardPercent]);
  const value = rows.find((record) => val(record, settings.settingName) === "Application Settings")?.fields[settings.massMissingGuardPercent];
  return typeof value === "number" && value > 0 ? value : 0.1;
}

async function buildPreview(kind: ImportKind, fileName: string, rows: Array<Record<string, unknown>>, issues: ImportIssue[], uploadedBy: string): Promise<ImportPreview> {
  const f = airtable.fields;
  let added = 0, updated = 0, unchanged = 0, markedInactive = 0, markedCancelled = 0;
  let missingPercentage = 0, missingWarning = false;
  if (kind === "people") {
    const people = await listAirtableRecords("people", Object.values(f.people));
    const byEmployeeId = new Map(people.map((person) => [stringVal(person, f.people.employeeId), person]));
    const incoming = new Set(rows.map((row) => String(row["Employee ID Number"])));
    for (const row of rows) {
      const managerId = String(row["Line Manager Employee ID"] ?? "").trim();
      if (managerId && !incoming.has(managerId) && !byEmployeeId.has(managerId)) {
        issues.push({ row: Number(row._row), message: `Unknown Line Manager Employee ID: ${managerId}.` });
      }
    }
    for (const row of rows) {
      const existing = byEmployeeId.get(String(row["Employee ID Number"]));
      if (!existing) { added++; continue; }
      const fields = peopleFields(row, byEmployeeId);
      const changed = Object.entries(fields).some(([id, value]) => comparable(val(existing, id)) !== comparable(value));
      if (changed) updated++; else unchanged++;
    }
    const active = people.filter((person) => val(person, f.people.status) === "Active");
    const missing = active.filter((person) => !incoming.has(stringVal(person, f.people.employeeId)));
    markedInactive = missing.length;
    missingPercentage = active.length ? missing.length / active.length : 0;
    missingWarning = missingPercentage >= await getMassMissingGuard();
  } else {
    const [leaves, people] = await Promise.all([
      listAirtableRecords("plannedLeave", Object.values(f.plannedLeave)),
      listAirtableRecords("people", [f.people.employeeId]),
    ]);
    const byLeaveId = new Map(leaves.map((leave) => [stringVal(leave, f.plannedLeave.leaveId), leave]));
    const personIds = new Set(people.map((person) => stringVal(person, f.people.employeeId)));
    for (const row of rows) {
      if (!personIds.has(String(row["Employee ID Number"]))) issues.push({ row: Number(row._row), message: `Unknown Employee ID Number: ${row["Employee ID Number"]}.` });
      const existing = byLeaveId.get(String(row["Leave ID"]));
      if (!existing) { added++; continue; }
      const fields = leaveFields(row, people, f.people.employeeId);
      const changed = Object.entries(fields).some(([id, value]) => comparable(val(existing, id)) !== comparable(value));
      if (changed) updated++; else unchanged++;
    }
    const incoming = new Set(rows.map((row) => String(row["Leave ID"])));
    markedCancelled = leaves.filter((leave) => !incoming.has(stringVal(leave, f.plannedLeave.leaveId)) && val(leave, f.plannedLeave.hrSyncStatus) !== "Cancelled" && val(leave, f.plannedLeave.hrSyncStatus) !== "Taken").length;
  }
  const preview: ImportPreview = { previewId: randomUUID(), kind, fileName, rowsReceived: rows.length, added, updated, unchanged, markedInactive, markedCancelled, missingPercentage, missingWarning, issues, };
  pending.set(preview.previewId, { kind, fileName, rows, preview, uploadedBy });
  return preview;
}

function peopleFields(row: Record<string, unknown>, people: Map<string, AirtableRecord>) {
  const p = airtable.fields.people;
  const managerId = String(row["Line Manager Employee ID"] ?? "").trim();
  const managerRecord = managerId ? people.get(managerId) : undefined;
  return {
    [p.employeeId]: row["Employee ID Number"], [p.firstName]: row["First Name"], [p.middleName]: row["Middle Name"] || null,
    [p.lastName]: row["Last Name"], [p.workEmail]: row["Work Email"] || null, [p.roleName]: row["Role Name"] || null,
    [p.roleLevel]: String(row["Role Level"] ?? "").split("|").map((item) => item.trim()).filter(Boolean),
    [p.team]: String(row.Team ?? "").split("|").map((item) => item.trim()).filter(Boolean), [p.region]: row.Region, [p.status]: row.Status,
    [p.contractedHours]: row["Contracted Hours"], [p.workingDaysPerWeek]: row["Working Days per Week"],
    [p.lineManager]: managerRecord ? [managerRecord.id] : [], [p.startDate]: row["Start Date"], [p.endDate]: row["End Date"],
    [p.lastSeenInHRFile]: new Date().toISOString().slice(0, 10),
  };
}

function leaveFields(row: Record<string, unknown>, people: AirtableRecord[], employeeIdField: string) {
  const l = airtable.fields.plannedLeave;
  const person = people.find((candidate) => stringVal(candidate, employeeIdField) === row["Employee ID Number"]);
  const past = String(row["End Date"]) < new Date().toISOString().slice(0, 10);
  return {
    [l.leaveId]: row["Leave ID"], [l.title]: row.Title || `${row.Type} leave`, [l.person]: person ? [person.id] : [],
    [l.type]: row.Type, [l.status]: row.Status, [l.startDate]: row["Start Date"], [l.endDate]: row["End Date"],
    [l.leaveDays]: row["Leave Days"], [l.hrSyncStatus]: past ? "Taken" : "Current",
  };
}

export async function previewHrImport(input: { kind: ImportKind; fileName: string; csv: string; uploadedBy: string }) {
  const parsed = parseRows(input.csv, input.kind);
  return buildPreview(input.kind, input.fileName, parsed.rows, parsed.issues, input.uploadedBy);
}

export async function commitHrImport(previewId: string) {
  const task = pending.get(previewId);
  if (!task) throw new Error("This preview has expired. Upload the file again to create a fresh preview.");
  if (task.preview.issues.length) throw new Error("Resolve all validation errors before committing.");
  const f = airtable.fields;
  let added = 0, updated = 0, unchanged = 0, markedInactive = 0, markedCancelled = 0;
  const now = new Date().toISOString();
  if (task.kind === "people") {
    const people = await listAirtableRecords("people", Object.values(f.people));
    const byEmployeeId = new Map(people.map((person) => [stringVal(person, f.people.employeeId), person]));
    const incoming = new Set(task.rows.map((row) => String(row["Employee ID Number"])));
    const creates: Array<{ fields: Record<string, unknown> }> = [];
    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const row of task.rows) {
      const fields = peopleFields(row, byEmployeeId);
      const existing = byEmployeeId.get(String(row["Employee ID Number"]));
      if (!existing) { creates.push({ fields }); continue; }
      const changedIds = Object.keys(fields).filter((id) => comparable(val(existing, id)) !== comparable(fields[id]));
      if (!changedIds.length) { unchanged++; continue; }
      updates.push({ id: existing.id, fields: Object.fromEntries(changedIds.map((id) => [id, fields[id]])) });
    }
    const createdRecords = await createAirtableRecords("people", creates);
    const allPeople = new Map(people.map((person) => [stringVal(person, f.people.employeeId), person]));
    for (const record of createdRecords) allPeople.set(stringVal(record, f.people.employeeId), record);
    await updateAirtableRecords("people", updates);
    const managerLinkUpdates = task.rows.flatMap((row) => {
      const employeeId = String(row["Employee ID Number"]);
      const managerId = String(row["Line Manager Employee ID"] ?? "").trim();
      const person = allPeople.get(employeeId);
      const manager = managerId ? allPeople.get(managerId) : undefined;
      return person && manager && comparable(val(person, f.people.lineManager)) !== comparable([manager.id])
        ? [{ id: person.id, fields: { [f.people.lineManager]: [manager.id] } }]
        : [];
    });
    await updateAirtableRecords("people", managerLinkUpdates);
    added = creates.length; updated = updates.length;
    const missing = people.filter((person) => val(person, f.people.status) === "Active" && !incoming.has(stringVal(person, f.people.employeeId)));
    const deactivate = missing.map((person) => ({ id: person.id, fields: { [f.people.status]: "Left organisation", [f.people.lastSeenInHRFile]: now.slice(0, 10) } }));
    await updateAirtableRecords("people", deactivate);
    markedInactive = deactivate.length;
  } else {
    const [leaves, people] = await Promise.all([
      listAirtableRecords("plannedLeave", Object.values(f.plannedLeave)),
      listAirtableRecords("people", [f.people.employeeId]),
    ]);
    const byLeaveId = new Map(leaves.map((leave) => [stringVal(leave, f.plannedLeave.leaveId), leave]));
    const incoming = new Set(task.rows.map((row) => String(row["Leave ID"])));
    const creates: Array<{ fields: Record<string, unknown> }> = [];
    const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const row of task.rows) {
      const fields = leaveFields(row, people, f.people.employeeId);
      const existing = byLeaveId.get(String(row["Leave ID"]));
      if (!existing) { creates.push({ fields }); continue; }
      const changedIds = Object.keys(fields).filter((id) => comparable(val(existing, id)) !== comparable(fields[id]));
      if (!changedIds.length) { unchanged++; continue; }
      updates.push({ id: existing.id, fields: Object.fromEntries(changedIds.map((id) => [id, fields[id]])) });
    }
    await createAirtableRecords("plannedLeave", creates);
    await updateAirtableRecords("plannedLeave", updates);
    added = creates.length; updated = updates.length;
    const retired = leaves.filter((leave) => !incoming.has(stringVal(leave, f.plannedLeave.leaveId)) && val(leave, f.plannedLeave.hrSyncStatus) !== "Cancelled" && val(leave, f.plannedLeave.hrSyncStatus) !== "Taken");
    const changes = retired.map((leave) => ({ id: leave.id, fields: { [f.plannedLeave.hrSyncStatus]: String(val(leave, f.plannedLeave.endDate) ?? "") < now.slice(0, 10) ? "Taken" : "Cancelled" } }));
    await updateAirtableRecords("plannedLeave", changes);
    markedCancelled = changes.filter((change) => change.fields[f.plannedLeave.hrSyncStatus] === "Cancelled").length;
  }
  const importBatchId = `${task.kind}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${previewId.slice(0, 8)}`;
  const status = task.preview.missingWarning ? "Committed with Warnings" : "Committed";
  await createAirtableRecords("importLog", [{ fields: {
    [f.importLog.importBatchId]: importBatchId, [f.importLog.importType]: task.kind === "people" ? "People" : "Planned Leave",
    [f.importLog.sourceFileName]: task.fileName, [f.importLog.uploadedByLabel]: task.uploadedBy,
    [f.importLog.uploadedAtUtc]: now, [f.importLog.committedAtUtc]: new Date().toISOString(), [f.importLog.importStatus]: status,
    [f.importLog.rowsReceived]: task.rows.length, [f.importLog.rowsAdded]: added, [f.importLog.rowsUpdated]: updated,
    [f.importLog.rowsUnchanged]: unchanged, [f.importLog.rowsMarkedInactive]: markedInactive,
    [f.importLog.rowsMarkedCancelled]: markedCancelled, [f.importLog.rowsWithErrors]: 0,
    [f.importLog.missingRowPercentage]: task.preview.missingPercentage,
    [f.importLog.summary]: task.preview.missingWarning ? "People snapshot crossed the configured missing-row warning threshold; commit proceeded." : "Committed after preview validation.",
  } }]);
  pending.delete(previewId);
  return { status, added, updated, unchanged, markedInactive, markedCancelled };
}

export async function getHrCurrentLists() {
  const f = airtable.fields;
  const [people, leave] = await Promise.all([
    listAirtableRecords("people", [f.people.employeeId, f.people.fullName, f.people.workEmail, f.people.team, f.people.region, f.people.status, f.people.contractedHours, f.people.workingDaysPerWeek]),
    listAirtableRecords("plannedLeave", [f.plannedLeave.leaveId, f.plannedLeave.title, f.plannedLeave.person, f.plannedLeave.type, f.plannedLeave.status, f.plannedLeave.startDate, f.plannedLeave.endDate, f.plannedLeave.leaveDays, f.plannedLeave.hrSyncStatus]),
  ]);
  const personNames = new Map(people.map((person) => [person.id, val(person, f.people.fullName) ?? stringVal(person, f.people.employeeId)]));
  return {
    people: people.map((person) => ({ id: person.id, employeeId: val(person, f.people.employeeId), name: val(person, f.people.fullName), email: val(person, f.people.workEmail), team: val(person, f.people.team), region: val(person, f.people.region), status: val(person, f.people.status), hours: val(person, f.people.contractedHours), days: val(person, f.people.workingDaysPerWeek) })),
    leave: leave.map((record) => ({ id: record.id, leaveId: val(record, f.plannedLeave.leaveId), title: val(record, f.plannedLeave.title), person: Array.isArray(val(record, f.plannedLeave.person)) ? (val(record, f.plannedLeave.person) as string[]).map((id) => personNames.get(id)).join(", ") : "", type: val(record, f.plannedLeave.type), status: val(record, f.plannedLeave.status), startDate: val(record, f.plannedLeave.startDate), endDate: val(record, f.plannedLeave.endDate), days: val(record, f.plannedLeave.leaveDays), sync: val(record, f.plannedLeave.hrSyncStatus) })),
  };
}
