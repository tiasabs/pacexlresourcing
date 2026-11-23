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
  warnings: string[];
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
const aliases: Record<ImportKind, Record<string, string[]>> = {
  people: {
    "Employee ID Number": ["employee id number", "employee id", "employee number", "employee no", "staff id", "staff number", "person number", "worker id", "personnel number", "personnel no"],
    "First Name": ["first name", "given name", "forename"],
    "Middle Name": ["middle name", "middle names", "middle initial"],
    "Last Name": ["last name", "surname", "family name"],
    "Work Email": ["work email", "business email", "work email address", "email", "email address"],
    "Role Name": ["role name", "role", "job title", "position title", "job role", "job name", "position"],
    "Role Level": ["role level", "job level", "management level"],
    Team: ["team", "department", "department name", "business unit", "function", "division"],
    Region: ["region", "work region", "country region", "office region", "work location region"],
    "Contracted Hours": ["contracted hours", "contracted weekly hours", "weekly hours", "hours per week", "fte hours per week"],
    "Working Days per Week": ["working days per week", "days per week", "work days per week", "work days"],
    "Line Manager Employee ID": ["line manager employee id", "line manager id", "manager employee id", "manager id", "supervisor id"],
    Status: ["status", "employment status", "worker status", "employee status"],
    "Start Date": ["start date", "hire date", "employment start date", "date started"],
    "End Date": ["end date", "termination date", "leaving date", "employment end date"],
  },
  plannedLeave: {
    "Leave ID": ["leave id", "leave request id", "absence id", "absence request id", "request id", "time off id"],
    "Employee ID Number": ["employee id number", "employee id", "employee number", "staff id", "staff number", "person number", "worker id", "personnel number", "personnel no"],
    Title: ["title", "leave title", "request name", "leave request"],
    Type: ["type", "leave type", "absence type", "time off type"],
    Status: ["status", "approval status", "leave status", "absence status"],
    "Start Date": ["start date", "leave start date", "absence start date", "date from", "start"],
    "End Date": ["end date", "leave end date", "absence end date", "date to", "end"],
    "Leave Days": ["leave days", "days", "duration days", "number of days", "absence days", "time off days"],
  },
};
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
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  const isoDate = match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  const parsedDate = isoDate ? new Date(`${isoDate}T00:00:00Z`) : null;
  if (!isoDate || !parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== isoDate) {
    issues.push({ row, message: `${field} must be a real date in DD-MM-YYYY format.` });
    return null;
  }
  return isoDate;
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

const normalizeHeader = (value: string) => value.toLocaleLowerCase("en-GB").replace(/[^a-z0-9]/g, "");

function normalizeTeam(value: string) {
  const key = normalizeHeader(value);
  const values: Record<string, string> = {
    hr: "Human Resources", humanresources: "Human Resources", humanresourcing: "Human Resources", people: "Human Resources", peopleteam: "Human Resources",
    legal: "Legal", legalservices: "Legal", partnerships: "Partnerships", bids: "Partnerships", fundraising: "Partnerships", businessdevelopment: "Partnerships",
    operations: "Operations", ops: "Operations", project: "Project", projects: "Project", finance: "Finance",
    communicationsdata: "Communications & Data", communications: "Communications & Data", comms: "Communications & Data",
    digital: "Digital", it: "Digital", technology: "Digital", dataanddigital: "Digital",
  };
  return values[key] ?? value.trim();
}

function normalizeRegion(value: string) {
  const key = normalizeHeader(value);
  const values: Record<string, string> = { ni: "Northern Ireland", northernireland: "Northern Ireland", england: "England", scotland: "Scotland", wales: "Wales", ireland: "Ireland", other: "Other" };
  return values[key] ?? value.trim();
}

function normalizePersonStatus(value: string) {
  const key = normalizeHeader(value);
  const values: Record<string, string> = {
    active: "Active", current: "Active", employed: "Active", working: "Active",
    onleave: "On long leave", longtermleave: "On long leave", maternityleave: "On long leave", parentalleave: "On long leave", secondment: "On long leave", left: "Left organisation",
    inactive: "Left organisation", terminated: "Left organisation", leaver: "Left organisation", leftorganisation: "Left organisation",
  };
  return values[key] ?? value.trim();
}

function normalizeLeaveType(value: string, warnings: string[]) {
  const key = normalizeHeader(value);
  if (["annual", "annualleave", "holiday", "vacation", "paidtimeoff", "pto"].includes(key)) return "Annual";
  if (["sick", "sickleave", "illness"].includes(key)) return "Sick";
  if (["other", "parental", "unpaid", "compassionate", "bereavement", "medical"].includes(key)) return "Other";
  if (value.trim()) {
    warnings.push(`Leave type “${value.trim()}” is grouped as Other.`);
    return "Other";
  }
  return "";
}

function normalizeLeaveStatus(value: string) {
  const key = normalizeHeader(value);
  const values: Record<string, string> = {
    approved: "Approved", accepted: "Approved", authorised: "Approved", authorized: "Approved", confirmed: "Approved",
    requested: "Requested", pending: "Requested", awaitingapproval: "Requested", submitted: "Requested",
    declined: "Declined", rejected: "Declined", refused: "Declined",
  };
  return values[key] ?? value.trim();
}

function parseRows(csv: string, kind: ImportKind) {
  const matrix = parseCsv(csv);
  const issues: ImportIssue[] = [];
  const warnings: string[] = [];
  if (!matrix.length) return { rows: [], issues: [{ row: 1, message: "The CSV is empty." }] };
  const headerMap = new Map<string, number>();
  const columns = aliases[kind];
  for (const [columnIndex, header] of matrix[0].entries()) {
    const normalized = normalizeHeader(header);
    const canonical = Object.entries(columns).find(([, choices]) => choices.some((choice) => normalizeHeader(choice) === normalized))?.[0];
    if (!canonical) continue;
    if (headerMap.has(canonical)) {
      issues.push({ row: 1, message: `More than one column matches “${canonical}” (${matrix[0][headerMap.get(canonical)!]} and ${header}). Keep just one.` });
    } else {
      headerMap.set(canonical, columnIndex);
    }
  }
  const idHeader = kind === "people" ? "Employee ID Number" : "Leave ID";
  if (!headerMap.has(idHeader)) return { rows: [], issues: [{ row: 1, message: `Could not identify the stable ${idHeader} column. Rename that one header to “${idHeader}” and try again.` }], warnings };
  const requiredHeaders = kind === "people" ? ["Employee ID Number"] : ["Leave ID", "Employee ID Number"];
  const missingColumns = requiredHeaders.filter((header) => !headerMap.has(header));
  if (missingColumns.length) return { rows: [], issues: missingColumns.map((header) => ({ row: 1, message: `Required identifier column “${header}” is missing.` })), warnings };
  const absentOptional = Object.keys(columns).filter((header) => !requiredHeaders.includes(header) && !headerMap.has(header));
  if (absentOptional.length) warnings.push(`Columns absent from this export will be left unchanged on existing records: ${absentOptional.join(", ")}.`);
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const [index, cells] of matrix.slice(1).entries()) {
    const rowNumber = index + 2;
    const values: Record<string, string> = Object.fromEntries(Object.entries(columns).map(([header]) => [header, cells[headerMap.get(header) ?? -1] ?? "" ]));
    const idKey = idHeader;
    const stableId = values[idKey].trim();
    if (!stableId) { issues.push({ row: rowNumber, message: `${idKey} is required.` }); continue; }
    if (seen.has(stableId)) { issues.push({ row: rowNumber, message: `Duplicate ${idKey}: ${stableId}.` }); continue; }
    seen.add(stableId);
    const startDate = asDate(values["Start Date"], "Start Date", rowNumber, issues);
    const endDate = asDate(values["End Date"], "End Date", rowNumber, issues);
    if (startDate && endDate && endDate < startDate) issues.push({ row: rowNumber, message: "End Date must be on or after Start Date." });
    if (kind === "people") {
      const contractedHours = numberValue(values["Contracted Hours"], "Contracted Hours", rowNumber, issues, true);
      const workDays = numberValue(values["Working Days per Week"], "Working Days per Week", rowNumber, issues, true);
      if (workDays !== null && (workDays < 1 || workDays > 7)) issues.push({ row: rowNumber, message: "Working Days per Week must be between 1 and 7." });
      values.Team = values.Team.split("|").map(normalizeTeam).join("|");
      values.Region = normalizeRegion(values.Region);
      values.Status = normalizePersonStatus(values.Status);
      const invalidTeam = values.Team && values.Team.split("|").some((item) => !teams.includes(item));
      const invalidRegion = values.Region && !["England", "Wales", "Scotland", "Northern Ireland", "Ireland", "Other"].includes(values.Region);
      const invalidStatus = values.Status && !["Active", "On long leave", "Left organisation"].includes(values.Status);
      if (invalidTeam) warnings.push(`Row ${rowNumber}: team “${values.Team}” is unfamiliar; an existing person's team will be left unchanged.`);
      if (invalidRegion) warnings.push(`Row ${rowNumber}: region “${values.Region}” is unfamiliar; an existing person's region will be left unchanged.`);
      if (invalidStatus) warnings.push(`Row ${rowNumber}: employment status “${values.Status}” is unfamiliar; an existing person's status will be left unchanged.`);
      if (invalidTeam) values.Team = "";
      if (invalidRegion) values.Region = "";
      if (invalidStatus) values.Status = "";
      const levelValues = values["Role Level"].split("|").map((item) => item.trim()).filter(Boolean);
      const normalizedLevels = levelValues.map((item) => roleLevels.find((level) => normalizeHeader(level) === normalizeHeader(item)) ?? "Other");
      if (levelValues.some((item, itemIndex) => normalizedLevels[itemIndex] === "Other" && normalizeHeader(item) !== "other")) warnings.push(`Unknown role level “${levelValues.find((item, itemIndex) => normalizedLevels[itemIndex] === "Other") }” is grouped as Other (row ${rowNumber}).`);
      values["Role Level"] = normalizedLevels.join("|");
      rows.push({ ...values, _invalidTeam: Boolean(invalidTeam), _invalidRegion: Boolean(invalidRegion), _invalidStatus: Boolean(invalidStatus), "Contracted Hours": contractedHours, "Working Days per Week": workDays, "Start Date": startDate, "End Date": endDate, _row: rowNumber });
    } else {
      const leaveDays = numberValue(values["Leave Days"], "Leave Days", rowNumber, issues, true);
      values.Type = normalizeLeaveType(values.Type, warnings);
      values.Status = normalizeLeaveStatus(values.Status);
      if (!values["Employee ID Number"]) issues.push({ row: rowNumber, message: "Employee ID Number is required." });
      if (values.Status && !["Requested", "Approved", "Declined"].includes(values.Status)) issues.push({ row: rowNumber, message: `Unrecognized leave status “${values.Status}”. Map it to Requested, Approved, or Declined.` });
      rows.push({ ...values, "Leave Days": leaveDays, "Start Date": startDate, "End Date": endDate, _row: rowNumber });
    }
  }
  return { rows, issues, warnings };
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

async function buildPreview(kind: ImportKind, fileName: string, rows: Array<Record<string, unknown>>, issues: ImportIssue[], warnings: string[], uploadedBy: string): Promise<ImportPreview> {
  const f = airtable.fields;
  let added = 0, updated = 0, unchanged = 0, markedInactive = 0, markedCancelled = 0;
  let missingPercentage = 0, missingWarning = false;
  if (kind === "people") {
    const people = await listAirtableRecords("people", Object.values(f.people));
    const byEmployeeId = new Map(people.map((person) => [stringVal(person, f.people.employeeId), person]));
    const incoming = new Set(rows.map((row) => String(row["Employee ID Number"])));
    for (const row of rows) {
      const existing = byEmployeeId.get(String(row["Employee ID Number"]));
      if (!existing) {
        if (row._invalidTeam) issues.push({ row: Number(row._row), message: "Map the team to one of the configured teams before creating this person." });
        if (row._invalidRegion) issues.push({ row: Number(row._row), message: "Map the region to England, Scotland, Wales, Northern Ireland, Ireland, or Other before creating this person." });
        if (row._invalidStatus) issues.push({ row: Number(row._row), message: "Map the employment status to Active, On long leave, or Left organisation before creating this person." });
      }
      const managerId = String(row["Line Manager Employee ID"] ?? "").trim();
      if (managerId && !incoming.has(managerId) && !byEmployeeId.has(managerId)) {
        issues.push({ row: Number(row._row), message: `Unknown Line Manager Employee ID: ${managerId}.` });
      }
    }
    for (const row of rows) {
      const existing = byEmployeeId.get(String(row["Employee ID Number"]));
      if (!existing) {
        for (const field of ["First Name", "Last Name", "Team", "Region"]) {
          if (!String(row[field] ?? "").trim()) issues.push({ row: Number(row._row), message: `${field} is needed to create a new People record.` });
        }
        if (typeof row["Contracted Hours"] !== "number") issues.push({ row: Number(row._row), message: "Contracted Hours is needed to create a new People record." });
        if (row["Working Days per Week"] === null) {
          row["Working Days per Week"] = 5;
          warnings.push(`Row ${row._row}: Working Days per Week was blank; defaulted to 5.`);
        }
        if (!String(row.Status ?? "").trim() && !row._invalidStatus) {
          row.Status = "Active";
          warnings.push(`Row ${row._row}: Status was blank; defaulted to Active.`);
        }
        added++;
        continue;
      }
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
      if (!existing) {
        for (const field of ["Type", "Status", "Start Date", "End Date", "Leave Days"]) {
          if (row[field] === null || row[field] === undefined || row[field] === "") issues.push({ row: Number(row._row), message: `${field} is needed to create a new Planned Leave record.` });
        }
        added++;
        continue;
      }
      const fields = leaveFields(row, people, f.people.employeeId);
      const changed = Object.entries(fields).some(([id, value]) => comparable(val(existing, id)) !== comparable(value));
      if (changed) updated++; else unchanged++;
    }
    const incoming = new Set(rows.map((row) => String(row["Leave ID"])));
    markedCancelled = leaves.filter((leave) => !incoming.has(stringVal(leave, f.plannedLeave.leaveId)) && val(leave, f.plannedLeave.hrSyncStatus) !== "Cancelled" && val(leave, f.plannedLeave.hrSyncStatus) !== "Taken").length;
  }
  const preview: ImportPreview = { previewId: randomUUID(), kind, fileName, rowsReceived: rows.length, added, updated, unchanged, markedInactive, markedCancelled, missingPercentage, missingWarning, warnings: Array.from(new Set(warnings)), issues, };
  pending.set(preview.previewId, { kind, fileName, rows, preview, uploadedBy });
  return preview;
}

function peopleFields(row: Record<string, unknown>, people: Map<string, AirtableRecord>): Record<string, unknown> {
  const p = airtable.fields.people;
  const managerId = String(row["Line Manager Employee ID"] ?? "").trim();
  const managerRecord = managerId ? people.get(managerId) : undefined;
  const fields: Record<string, unknown> = { [p.employeeId]: row["Employee ID Number"], [p.lastSeenInHRFile]: new Date().toISOString().slice(0, 10) };
  const assignIfProvided = (fieldId: string, label: string, transform?: (value: unknown) => unknown) => {
    const value = row[label];
    if (value === null || value === undefined || value === "") return;
    fields[fieldId] = transform ? transform(value) : value;
  };
  assignIfProvided(p.firstName, "First Name");
  assignIfProvided(p.middleName, "Middle Name");
  assignIfProvided(p.lastName, "Last Name");
  assignIfProvided(p.workEmail, "Work Email");
  assignIfProvided(p.roleName, "Role Name");
  assignIfProvided(p.roleLevel, "Role Level", (value) => String(value).split("|").map((item) => item.trim()).filter(Boolean));
  assignIfProvided(p.team, "Team", (value) => String(value).split("|").map((item) => item.trim()).filter(Boolean));
  assignIfProvided(p.region, "Region");
  assignIfProvided(p.status, "Status");
  assignIfProvided(p.contractedHours, "Contracted Hours");
  assignIfProvided(p.workingDaysPerWeek, "Working Days per Week");
  assignIfProvided(p.startDate, "Start Date");
  assignIfProvided(p.endDate, "End Date");
  if (managerRecord) fields[p.lineManager] = [managerRecord.id];
  return fields;
}

function leaveFields(row: Record<string, unknown>, people: AirtableRecord[], employeeIdField: string): Record<string, unknown> {
  const l = airtable.fields.plannedLeave;
  const person = people.find((candidate) => stringVal(candidate, employeeIdField) === row["Employee ID Number"]);
  const past = String(row["End Date"]) < new Date().toISOString().slice(0, 10);
  const fields: Record<string, unknown> = { [l.leaveId]: row["Leave ID"], [l.person]: person ? [person.id] : [] };
  const assignIfPresent = (fieldId: string, label: string) => {
    const value = row[label];
    if (value !== null && value !== undefined && value !== "") fields[fieldId] = value;
  };
  assignIfPresent(l.title, "Title");
  assignIfPresent(l.type, "Type");
  assignIfPresent(l.status, "Status");
  assignIfPresent(l.startDate, "Start Date");
  assignIfPresent(l.endDate, "End Date");
  assignIfPresent(l.leaveDays, "Leave Days");
  if (row["End Date"]) fields[l.hrSyncStatus] = past ? "Taken" : "Current";
  return fields;
}

export async function previewHrImport(input: { kind: ImportKind; fileName: string; csv: string; uploadedBy: string }) {
  const parsed = parseRows(input.csv, input.kind);
  return buildPreview(input.kind, input.fileName, parsed.rows, parsed.issues, parsed.warnings ?? [], input.uploadedBy);
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
    listAirtableRecords("people", [f.people.employeeId, f.people.fullName, f.people.workEmail, f.people.team, f.people.region, f.people.status, f.people.contractedHours, f.people.workingDaysPerWeek, f.people.roleName, f.people.roleLevel, f.people.lineManager, f.people.startDate, f.people.endDate]),
    listAirtableRecords("plannedLeave", [f.plannedLeave.leaveId, f.plannedLeave.title, f.plannedLeave.person, f.plannedLeave.type, f.plannedLeave.status, f.plannedLeave.startDate, f.plannedLeave.endDate, f.plannedLeave.leaveDays, f.plannedLeave.hrSyncStatus]),
  ]);
  const personNames = new Map(people.map((person) => [person.id, val(person, f.people.fullName) ?? stringVal(person, f.people.employeeId)]));
  return {
    people: people.map((person) => ({
      id: person.id,
      employeeId: val(person, f.people.employeeId),
      name: val(person, f.people.fullName),
      email: val(person, f.people.workEmail),
      team: val(person, f.people.team),
      region: val(person, f.people.region),
      status: val(person, f.people.status),
      hours: val(person, f.people.contractedHours),
      days: val(person, f.people.workingDaysPerWeek),
      role: val(person, f.people.roleName),
      roleLevel: val(person, f.people.roleLevel),
      manager: Array.isArray(val(person, f.people.lineManager)) ? (val(person, f.people.lineManager) as string[]).map((id) => personNames.get(id)).join(", ") : "",
      startDate: val(person, f.people.startDate),
      endDate: val(person, f.people.endDate),
    })),
    leave: leave.map((record) => {
      const personIds = Array.isArray(val(record, f.plannedLeave.person)) ? val(record, f.plannedLeave.person) as string[] : [];
      return { id: record.id, leaveId: val(record, f.plannedLeave.leaveId), title: val(record, f.plannedLeave.title), person: personIds.map((id) => personNames.get(id)).join(", "), personIds, type: val(record, f.plannedLeave.type), status: val(record, f.plannedLeave.status), startDate: val(record, f.plannedLeave.startDate), endDate: val(record, f.plannedLeave.endDate), days: val(record, f.plannedLeave.leaveDays), sync: val(record, f.plannedLeave.hrSyncStatus) };
    }),
  };
}
