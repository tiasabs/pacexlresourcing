import "server-only";

import { airtable } from "@/config/airtable";
import { createAirtableRecords, deleteAirtableRecords, listAirtableRecords, updateAirtableRecords, type AirtableRecord } from "@/lib/airtable/records";
import type { AssignedRole, DemoAccount } from "@/lib/demo/accounts";

type Person = { id: string; name: string; firstName: string; team: string; managerIds: string[]; status: string; contractedHours: number; workdays: number; region: string };
export type ProjectRow = { id: string; name: string; client: string; type: string; stage: string; decisionStatus: string; leadIds: string[]; leadName: string; bidDueDate: string; bidDeadline: string; startDate: string; endDate: string; dataStatus: string };
export type BookingAllocationRow = { id: string; milestoneId: string; milestoneName: string; hoursPerWeek: number };
export type BookingRow = {
  id: string; bookingId: string; label: string; personId: string; personName: string; projectId: string; projectName: string;
  startDate: string; endDate: string; hoursPerWeek: number; teamRequested: string; bookingStatus: string;
  requestStatus: string; requestNote: string; enteredAt: string; leadName: string;
  allocations: BookingAllocationRow[]; clashFlagged: boolean; clashNote: string;
  clashWeeks: Array<{ weekStart: string; weekLabel: string; bookedHours: number; capacityHours: number; ratio: number; projectNames: string[] }>;
};
export type MilestoneRow = { id: string; name: string; projectId: string; plannedStartDate: string; plannedEndDate: string; expectedStartDate: string; expectedEndDate: string; firstBookingDate: string; bookingCount: number; allocatedHoursPerWeek: number };
export type AvailablePerson = { personId: string; name: string; team: string; availableHoursPerWeek: number; loadPercent: number; loadStatus: "Green" | "Amber" | "Red"; capacityWarning: boolean };
export type WeeklyActualLine = { key: string; allocationIds: string[]; bookingTermIds: string[]; bookingIds: string[]; projectId: string; projectName: string; milestoneId: string; milestoneName: string; expectedHours: number; actualHours: number | null; locked: boolean };

const get = (record: AirtableRecord, fieldId: string) => record.fields[fieldId];
const str = (value: unknown) => typeof value === "string" ? value : "";
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const links = (value: unknown) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : typeof item === "object" && item && "id" in item ? String(item.id) : "").filter(Boolean) : [];
const pick = (value: unknown) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : typeof item === "object" && item && "name" in item ? String(item.name) : "").filter(Boolean).join(", ") : str(value);
const dateNow = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString();

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function isIsoDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.valueOf()) && iso(d) === value; }
function monday(date: Date) { const out = new Date(date); out.setUTCDate(out.getUTCDate() - (out.getUTCDay() + 6) % 7); return out; }
function nextDay(date: Date) { return new Date(date.getTime() + 86400000); }
function weekday(date: Date) { return date.getUTCDay() > 0 && date.getUTCDay() < 6; }
function daysBetween(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return [] as string[];
  const result: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); iso(d) <= end; d = nextDay(d)) result.push(iso(d));
  return result;
}
function weekStartOf(value: string) { return isIsoDate(value) ? iso(monday(new Date(`${value}T00:00:00Z`))) : ""; }
function weekEndOf(week: string) { const d = new Date(`${week}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return iso(d); }
function daysInRangeWithinWeek(start: string, end: string, week: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || !isIsoDate(week)) return 0;
  const a = new Date(`${start}T00:00:00Z`), b = new Date(`${end}T00:00:00Z`);
  const w0 = new Date(`${week}T00:00:00Z`), w1 = new Date(`${weekEndOf(week)}T00:00:00Z`);
  let count = 0;
  for (let d = a > w0 ? a : w0; d <= b && d <= w1; d = nextDay(d)) if (weekday(d)) count++;
  return count;
}
function activeWeekHours(hours: number, start: string, end: string, week: string, workdays: number) {
  const days = daysInRangeWithinWeek(start, end, week);
  return days ? hours * days / Math.max(1, workdays) : 0;
}
function monthQuarter(week: string) {
  const d = new Date(`${week}T00:00:00Z`);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

async function peopleRows(): Promise<Person[]> {
  const f = airtable.fields.people;
  const rows = await listAirtableRecords("people", [f.fullName, f.firstName, f.lastName, f.team, f.lineManager, f.status, f.contractedHours, f.workingDaysPerWeek, f.region]);
  return rows.map((row) => ({
    id: row.id, name: str(get(row, f.fullName)) || `${str(get(row, f.firstName))} ${str(get(row, f.lastName))}`.trim(),
    firstName: str(get(row, f.firstName)), team: pick(get(row, f.team)), managerIds: links(get(row, f.lineManager)),
    status: pick(get(row, f.status)), contractedHours: num(get(row, f.contractedHours)), workdays: num(get(row, f.workingDaysPerWeek)) || 5,
    region: pick(get(row, f.region)),
  }));
}

async function projectRows(): Promise<ProjectRow[]> {
  const f = airtable.fields.projectsAndBids;
  const [rows, people] = await Promise.all([listAirtableRecords("projectsAndBids", Object.values(f)), peopleRows()]);
  const byPerson = new Map(people.map((person) => [person.id, person.name]));
  return rows.map((row) => {
    const leadIds = links(get(row, f.lead));
    return {
      id: row.id, name: str(get(row, f.name)), client: str(get(row, f.client)), type: pick(get(row, f.type)), stage: pick(get(row, f.stage)),
      decisionStatus: pick(get(row, f.decisionStatus)), leadIds, leadName: leadIds.map((id) => byPerson.get(id)).filter(Boolean).join(", "),
      bidDueDate: str(get(row, f.bidDueDate)), bidDeadline: str(get(row, f.bidDeadline)), startDate: str(get(row, f.startDate)), endDate: str(get(row, f.endDate)),
      dataStatus: str(get(row, airtable.fields.projectsAndBids.dataStatus ?? "")),
    };
  });
}

function canLeadProject(account: DemoAccount, project: ProjectRow) {
  return account.assignedRoles.includes("admin") || (account.assignedRoles.includes("project_lead") && project.leadIds.includes(account.personId));
}

async function personHasProjectRole(personId: string) {
  const f = airtable.fields.appAccounts;
  const accounts = await listAirtableRecords("appAccounts", [f.person, f.appRoles, f.accountStatus]);
  return accounts.some((record) => {
    if (links(get(record, f.person))[0] !== personId || pick(get(record, f.accountStatus)) !== "Enabled") return false;
    const roles = pick(get(record, f.appRoles)).split(",").map((role) => role.trim());
    return roles.includes("Project Lead") || roles.includes("Admin");
  });
}

async function milestoneRecords() {
  return listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones));
}

async function sourceRecords() {
  const f = airtable.fields;
  const [bookings, terms, allocations, milestones, actuals, people, projects, leaves, holidays] = await Promise.all([
    listAirtableRecords("resourceBookings", Object.values(f.resourceBookings)),
    listAirtableRecords("bookingTerms", Object.values(f.bookingTerms)),
    listAirtableRecords("bookingAllocations", Object.values(f.bookingAllocations)),
    milestoneRecords(),
    listAirtableRecords("weeklyActuals", Object.values(f.weeklyActuals)),
    peopleRows(), projectRows(),
    listAirtableRecords("plannedLeave", [f.plannedLeave.person, f.plannedLeave.status, f.plannedLeave.startDate, f.plannedLeave.endDate, f.plannedLeave.leaveDays]),
    listAirtableRecords("publicHolidays", [f.publicHolidays.date, f.publicHolidays.region]),
  ]);
  return { bookings, terms, allocations, milestones, actuals, people, projects, leaves, holidays };
}

function capacityForWeek(person: Person, week: string, leaves: AirtableRecord[], holidays: AirtableRecord[]) {
  const f = airtable.fields;
  const weekEnd = weekEndOf(week);
  const holidayDates = new Set(holidays.filter((row) => pick(get(row, f.publicHolidays.region)).split(",").map((x) => x.trim()).includes(person.region))
    .map((row) => str(get(row, f.publicHolidays.date))).filter((d) => d >= week && d <= weekEnd && weekday(new Date(`${d}T00:00:00Z`))));
  const allHolidays = new Set(holidays.filter((row) => pick(get(row, f.publicHolidays.region)).split(",").map((x) => x.trim()).includes(person.region)).map((row) => str(get(row, f.publicHolidays.date))));
  const dailyHours = person.contractedHours / Math.max(1, person.workdays);
  const leaveHours = leaves.filter((row) => links(get(row, f.plannedLeave.person)).includes(person.id) && pick(get(row, f.plannedLeave.status)) === "Approved")
    .reduce((total, row) => {
      const start = str(get(row, f.plannedLeave.startDate)), end = str(get(row, f.plannedLeave.endDate));
      if (!isIsoDate(start) || !isIsoDate(end) || end < week || start > weekEnd) return total;
      const leaveDays = num(get(row, f.plannedLeave.leaveDays));
      const spanDays = daysBetween(start, end).filter((d) => weekday(new Date(`${d}T00:00:00Z`)) && !allHolidays.has(d));
      const inWeek = spanDays.filter((d) => d >= week && d <= weekEnd).length;
      return total + (spanDays.length ? leaveDays * inWeek / spanDays.length * dailyHours : 0);
    }, 0);
  const holidayHours = holidayDates.size * dailyHours;
  const maxLeave = Math.max(0, Math.min(person.workdays, 5 - holidayDates.size)) * dailyHours;
  return Math.max(0, person.contractedHours - holidayHours - Math.min(leaveHours, maxLeave));
}

function isRequest(record: AirtableRecord) {
  const f = airtable.fields.resourceBookings;
  return pick(get(record, f.bookingStatus)) === "Request" || pick(get(record, f.requestStatus)) === "Requested by person";
}

function isUsableTerm(record: AirtableRecord) {
  return pick(get(record, airtable.fields.bookingTerms.status)) !== "Cancelled";
}

function effectiveHoursForAllocation(allocation: AirtableRecord, term: AirtableRecord, person: Person, week: string) {
  const af = airtable.fields.bookingAllocations, tf = airtable.fields.bookingTerms;
  const starts = [str(get(term, tf.bookingStart)), str(get(term, tf.effectiveFrom)), str(get(allocation, af.activeFrom))].filter(isIsoDate);
  const ends = [str(get(term, tf.bookingEnd)), str(get(term, tf.effectiveTo)), str(get(allocation, af.activeTo))].filter(isIsoDate);
  const start = starts.length ? starts.sort().at(-1)! : "";
  const end = ends.length ? ends.sort()[0] : "";
  if (!start || !end || end < start) return 0;
  return activeWeekHours(num(get(allocation, af.hoursPerWeek)), start, end, week, person.workdays);
}

function withMilestoneActiveDates(
  allocations: Array<{ milestoneId: string; hoursPerWeek: number }>, milestones: AirtableRecord[],
  bookingStart: string, bookingEnd: string, effectiveFrom: string,
) {
  const f = airtable.fields.projectMilestones;
  return allocations.map((allocation) => {
    const milestone = milestones.find((row) => row.id === allocation.milestoneId);
    if (!milestone) throw new Error("A selected milestone could not be found.");
    const plannedStart = str(get(milestone, f.plannedStartDate)), plannedEnd = str(get(milestone, f.plannedEndDate));
    const start = str(get(milestone, f.expectedStartDate)) || plannedStart;
    const end = str(get(milestone, f.expectedEndDate)) || plannedEnd;
    const activeFrom = [bookingStart, effectiveFrom, start].filter(isIsoDate).sort().at(-1) ?? "";
    const activeTo = [bookingEnd, end].filter(isIsoDate).sort()[0] ?? "";
    if (!activeFrom || !activeTo || activeFrom > activeTo) throw new Error("Each allocation must overlap its milestone dates and effective booking period.");
    return { ...allocation, activeFrom, activeTo };
  });
}

function weeklyAllocationTotals(allocations: Array<{ hoursPerWeek: number; activeFrom: string; activeTo: string }>, person: Person) {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    const weeks = new Set(daysBetween(allocation.activeFrom, allocation.activeTo).filter((day) => weekday(new Date(`${day}T00:00:00Z`))).map(weekStartOf));
    for (const week of weeks) totals.set(week, (totals.get(week) ?? 0) + activeWeekHours(allocation.hoursPerWeek, allocation.activeFrom, allocation.activeTo, week, person.workdays));
  }
  return totals;
}

function allBookedHours(source: Awaited<ReturnType<typeof sourceRecords>>, personId: string, week: string, ignoreBookingId = "") {
  const f = airtable.fields;
  const person = source.people.find((item) => item.id === personId);
  if (!person) return 0;
  const termsByBooking = new Map<string, AirtableRecord[]>();
  for (const term of source.terms) for (const id of links(get(term, f.bookingTerms.booking))) {
    const rows = termsByBooking.get(id) ?? []; rows.push(term); termsByBooking.set(id, rows);
  }
  const allocationsByTerm = new Map<string, AirtableRecord[]>();
  for (const allocation of source.allocations) for (const id of links(get(allocation, f.bookingAllocations.bookingTerm))) {
    const rows = allocationsByTerm.get(id) ?? []; rows.push(allocation); allocationsByTerm.set(id, rows);
  }
  let total = 0;
  for (const booking of source.bookings) {
    if (booking.id === ignoreBookingId) continue;
    if (links(get(booking, f.resourceBookings.person))[0] !== personId || isRequest(booking) || pick(get(booking, f.resourceBookings.bookingStatus)) === "Cancelled") continue;
    const bookingTerms = termsByBooking.get(booking.id) ?? [];
    if (bookingTerms.length) {
      for (const term of bookingTerms.filter(isUsableTerm)) {
        if (!links(get(term, f.bookingTerms.person)).includes(personId)) continue;
        const from = str(get(term, f.bookingTerms.effectiveFrom)), to = str(get(term, f.bookingTerms.effectiveTo));
        if ((from && weekEndOf(week) < from) || (to && week > to)) continue;
        const allocations = allocationsByTerm.get(term.id) ?? [];
        for (const allocation of allocations) {
          total += effectiveHoursForAllocation(allocation, term, person, week);
        }
      }
    } else {
      const start = str(get(booking, f.resourceBookings.startDate)), end = str(get(booking, f.resourceBookings.endDate));
      total += activeWeekHours(num(get(booking, f.resourceBookings.hoursPerWeek)), start, end, week, person.workdays);
    }
  }
  return total;
}

export async function getBookingRows(): Promise<BookingRow[]> {
  const source = await sourceRecords();
  const f = airtable.fields;
  const termsByBooking = new Map<string, AirtableRecord[]>();
  for (const term of source.terms) for (const id of links(get(term, f.bookingTerms.booking))) {
    const rows = termsByBooking.get(id) ?? []; rows.push(term); termsByBooking.set(id, rows);
  }
  const allocationsByTerm = new Map<string, AirtableRecord[]>();
  for (const allocation of source.allocations) for (const id of links(get(allocation, f.bookingAllocations.bookingTerm))) {
    const rows = allocationsByTerm.get(id) ?? []; rows.push(allocation); allocationsByTerm.set(id, rows);
  }
  const milestonesById = new Map(source.milestones.map((m) => [m.id, { name: str(get(m, f.projectMilestones.name)), projectId: links(get(m, f.projectMilestones.project))[0] ?? "" }]));
  const peopleById = new Map(source.people.map((p) => [p.id, p]));
  const projectsById = new Map(source.projects.map((p) => [p.id, p]));
  const rows: BookingRow[] = source.bookings.map((record) => {
    const personId = links(get(record, f.resourceBookings.person))[0] ?? "";
    const projectId = links(get(record, f.resourceBookings.project))[0] ?? "";
    const terms = termsByBooking.get(record.id) ?? [];
    const currentTerm = [...terms].sort((a, b) => str(get(b, f.bookingTerms.effectiveFrom)).localeCompare(str(get(a, f.bookingTerms.effectiveFrom))))[0];
    const termId = currentTerm?.id ?? "";
    const allocations = currentTerm ? (allocationsByTerm.get(termId) ?? []).map((allocation) => {
      const milestoneId = links(get(allocation, f.bookingAllocations.milestone))[0] ?? "";
      return { id: allocation.id, milestoneId, milestoneName: milestonesById.get(milestoneId)?.name ?? "", hoursPerWeek: num(get(allocation, f.bookingAllocations.hoursPerWeek)) };
    }) : links(get(record, f.resourceBookings.milestone)).map((milestoneId) => ({ id: "", milestoneId, milestoneName: milestonesById.get(milestoneId)?.name ?? "", hoursPerWeek: num(get(record, f.resourceBookings.hoursPerWeek)) / Math.max(1, links(get(record, f.resourceBookings.milestone)).length) }));
    const project = projectsById.get(projectId);
    const startDate = currentTerm ? str(get(currentTerm, f.bookingTerms.bookingStart)) : str(get(record, f.resourceBookings.startDate));
    const endDate = currentTerm ? str(get(currentTerm, f.bookingTerms.bookingEnd)) : str(get(record, f.resourceBookings.endDate));
    const status = pick(get(record, f.resourceBookings.bookingStatus)) || (isRequest(record) ? "Request" : "Booked");
    const person = peopleById.get(personId);
    const currentAllocations = currentTerm ? allocationsByTerm.get(termId) ?? [] : [];
    const weeklyCommitments = person && currentTerm ? Array.from(new Set(daysBetween(startDate, endDate).filter((day) => weekday(new Date(`${day}T00:00:00Z`))).map(weekStartOf)))
      .map((week) => currentAllocations.reduce((sum, allocation) => sum + effectiveHoursForAllocation(allocation, currentTerm, person, week), 0)) : [];
    const displayedHours = weeklyCommitments.length ? Math.max(...weeklyCommitments) : allocations.reduce((sum, item) => sum + item.hoursPerWeek, 0) || num(get(record, f.resourceBookings.hoursPerWeek));
    return {
      id: record.id, bookingId: str(get(record, f.resourceBookings.bookingId)), label: str(get(record, f.resourceBookings.label)),
      personId, personName: peopleById.get(personId)?.name ?? "Unknown person", projectId, projectName: project?.name ?? "Unknown project",
      startDate, endDate, hoursPerWeek: Math.round(displayedHours * 100) / 100,
      teamRequested: currentTerm ? str(get(currentTerm, f.bookingTerms.teamRequested)) : str(get(record, f.resourceBookings.teamRequested)), bookingStatus: status,
      requestStatus: pick(get(record, f.resourceBookings.requestStatus)), requestNote: str(get(record, f.resourceBookings.requestNote)),
      enteredAt: currentTerm ? str(get(currentTerm, f.bookingTerms.enteredAt)) : str(get(record, f.resourceBookings.requestedOn)), leadName: project?.leadName ?? "", allocations,
      clashFlagged: false, clashNote: "", clashWeeks: [],
    };
  });
  const settings = await listAirtableRecords("settings", [f.settings.settingName, f.settings.redPercent]);
  const redThreshold = num(get(settings.find((row) => get(row, f.settings.settingName) === "Application Settings") ?? { id: "", fields: {} }, f.settings.redPercent)) || 1.1;
  return rows.map((row) => {
    if (row.bookingStatus === "Request" || row.bookingStatus === "Cancelled") return row;
    const clashWeeks = [];
    for (const week of new Set(daysBetween(row.startDate, row.endDate).map((d) => weekStartOf(d)))) {
      const weekEnd = weekEndOf(week);
      if (row.endDate < week || row.startDate > weekEnd) continue;
      const person = source.people.find((item) => item.id === row.personId);
      if (!person) continue;
      const booked = allBookedHours(source, row.personId, week);
      const capacity = capacityForWeek(person, week, source.leaves, source.holidays);
      const ratio = capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0;
      if (ratio > redThreshold) clashWeeks.push({ weekStart: week, weekLabel: week, bookedHours: booked, capacityHours: capacity, ratio, projectNames: Array.from(new Set(rows.filter((item) => item.personId === row.personId && item.startDate <= weekEnd && item.endDate >= week && item.bookingStatus === "Booked").map((item) => item.projectName))) });
    }
    return { ...row, clashFlagged: clashWeeks.length > 0, clashNote: clashWeeks.length ? `Above ${Math.round(redThreshold * 100)}% of weekly capacity.` : "", clashWeeks };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.projectName.localeCompare(b.projectName));
}

export async function getMyBookingRows(account: DemoAccount) {
  return (await getBookingRows()).filter((row) => row.personId === account.personId);
}

export async function getTeamBookingRows(account: DemoAccount) {
  const [people, bookings] = await Promise.all([peopleRows(), getBookingRows()]);
  if (account.assignedRoles.includes("admin")) return bookings;
  const reportIds = people.filter((person) => person.managerIds.includes(account.personId)).map((person) => person.id);
  const visible = new Set([account.personId, ...reportIds]);
  return bookings.filter((row) => visible.has(row.personId));
}

export async function getProjectsForAccount(account: DemoAccount) {
  const all = await projectRows();
  return all.filter((project) => canLeadProject(account, project));
}

export async function getProjectsForRequest() {
  return (await projectRows()).filter((project) => !["Lost", "cancelled", "Completed"].includes(project.stage));
}

export async function getTeams() {
  const people = await peopleRows();
  return Array.from(new Set(people.filter((person) => person.status === "Active").flatMap((person) => person.team.split(",").map((team) => team.trim())).filter(Boolean))).sort();
}

export async function getPeopleChoices() {
  const f = airtable.fields.appAccounts;
  const [people, accounts] = await Promise.all([peopleRows(), listAirtableRecords("appAccounts", [f.person, f.appRoles, f.accountStatus])]);
  const eligible = new Set(accounts.filter((record) => {
    if (pick(get(record, f.accountStatus)) !== "Enabled") return false;
    const roles = pick(get(record, f.appRoles)).split(",").map((role) => role.trim());
    return roles.includes("Project Lead") || roles.includes("Admin");
  }).map((record) => links(get(record, f.person))[0]).filter(Boolean));
  return people.filter((person) => person.status === "Active" && eligible.has(person.id)).map((person) => ({ id: person.id, name: person.name }));
}

export async function getProjectWorkspace(account: DemoAccount) {
  const [projects, bookings, records] = await Promise.all([getProjectsForAccount(account), getBookingRows(), milestoneRecords()]);
  const projectIds = new Set(projects.map((project) => project.id));
  const milestones: MilestoneRow[] = records.map((record) => {
    const f = airtable.fields.projectMilestones;
    const projectId = links(get(record, f.project))[0] ?? "";
    const related = bookings.filter((booking) => booking.projectId === projectId && booking.allocations.some((a) => a.milestoneId === record.id) && booking.bookingStatus === "Booked");
    return { id: record.id, name: str(get(record, f.name)), projectId, plannedStartDate: str(get(record, f.plannedStartDate)), plannedEndDate: str(get(record, f.plannedEndDate)), expectedStartDate: str(get(record, f.expectedStartDate)), expectedEndDate: str(get(record, f.expectedEndDate)), firstBookingDate: str(get(record, f.firstBookingDate)), bookingCount: related.length, allocatedHoursPerWeek: related.reduce((sum, booking) => sum + (booking.allocations.find((a) => a.milestoneId === record.id)?.hoursPerWeek ?? 0), 0) };
  }).filter((m) => projectIds.has(m.projectId));
  return { projects: projects.filter((project) => project.type === "Project"), bids: projects.filter((project) => project.type === "Bid"), bookings: bookings.filter((booking) => projects.some((project) => project.id === booking.projectId)), milestones };
}

export async function getProjectDetail(account: DemoAccount, projectId: string) {
  const workspace = await getProjectWorkspace(account);
  const project = workspace.projects.find((item) => item.id === projectId) ?? workspace.bids.find((item) => item.id === projectId);
  if (!project || !canLeadProject(account, project)) return null;
  return { project, milestones: workspace.milestones.filter((item) => item.projectId === projectId), bookings: workspace.bookings.filter((item) => item.projectId === projectId) };
}

export async function createProjectOrBid(account: DemoAccount, input: { name: string; client: string; type: "Project" | "Bid"; leadId?: string; bidDueDate?: string; bidDeadline?: string }) {
  if (!account.assignedRoles.includes("admin") && !account.assignedRoles.includes("project_lead")) throw new Error("Only Admins and Project Leads can create Projects or Bids.");
  const name = input.name.trim();
  if (!name || name.length > 160) throw new Error("Enter a name up to 160 characters.");
  const people = await peopleRows();
  const leadId = account.assignedRoles.includes("admin") ? input.leadId || account.personId : account.personId;
  if (!people.some((person) => person.id === leadId)) throw new Error("Choose a valid Project Lead.");
  if (!(await personHasProjectRole(leadId))) throw new Error("Assign the Project Lead role in Demo accounts before choosing this person as a lead.");
  if (input.type === "Bid") {
    if (!isIsoDate(input.bidDueDate ?? "") || !isIsoDate(input.bidDeadline ?? "") || input.bidDueDate! >= input.bidDeadline!) throw new Error("The internal Bid Due Date must be before the submission deadline.");
  }
  const f = airtable.fields.projectsAndBids;
  const fields: Record<string, unknown> = {
    [f.name]: name, [f.client]: input.client.trim(), [f.type]: input.type,
    [f.lead]: [leadId], [f.source]: "Manual", [f.stage]: input.type === "Bid" ? "bid in prep" : "won / in delivery",
  };
  if (input.type === "Bid") Object.assign(fields, { [f.bidDueDate]: input.bidDueDate, [f.bidDeadline]: input.bidDeadline, [f.decisionStatus]: "Pending" });
  const created = await createAirtableRecords("projectsAndBids", [{ fields }]);
  return created[0]?.id ?? "";
}

export async function updateProjectDetails(account: DemoAccount, projectId: string, input: { name: string; client: string; leadId?: string; bidDueDate?: string; bidDeadline?: string }) {
  const project = (await projectRows()).find((item) => item.id === projectId);
  if (!project || !canLeadProject(account, project)) throw new Error("You can only edit a Project or Bid you lead.");
  if (!input.name.trim() || input.name.trim().length > 160) throw new Error("Enter a name up to 160 characters.");
  if (project.type === "Bid" && (!isIsoDate(input.bidDueDate ?? "") || !isIsoDate(input.bidDeadline ?? "") || input.bidDueDate! >= input.bidDeadline!)) throw new Error("The internal Bid Due Date must be before the submission deadline.");
  const fields: Record<string, unknown> = { [airtable.fields.projectsAndBids.name]: input.name.trim(), [airtable.fields.projectsAndBids.client]: input.client.trim() };
  if (account.assignedRoles.includes("admin") && input.leadId) {
    if (!(await peopleRows()).some((person) => person.id === input.leadId)) throw new Error("Choose a valid Project Lead.");
    if (!(await personHasProjectRole(input.leadId))) throw new Error("Assign the Project Lead role in Demo accounts before choosing this person as a lead.");
    fields[airtable.fields.projectsAndBids.lead] = [input.leadId];
  }
  if (project.type === "Bid") Object.assign(fields, { [airtable.fields.projectsAndBids.bidDueDate]: input.bidDueDate, [airtable.fields.projectsAndBids.bidDeadline]: input.bidDeadline });
  await updateAirtableRecords("projectsAndBids", [{ id: project.id, fields }]);
}

export async function convertBidToProject(account: DemoAccount, projectId: string) {
  const [projects, bookings] = await Promise.all([projectRows(), getBookingRows()]);
  const project = projects.find((item) => item.id === projectId && item.type === "Bid");
  if (!project || !canLeadProject(account, project)) throw new Error("You can only convert a Bid you lead.");
  if (project.decisionStatus !== "Go") throw new Error("Set the Bid decision to Go before converting it to a Project.");
  const f = airtable.fields.projectsAndBids;
  await updateAirtableRecords("projectsAndBids", [{ id: project.id, fields: { [f.type]: "Project", [f.stage]: "won / in delivery" } }]);
  return bookings.filter((booking) => booking.projectId === project.id).length;
}

export async function setBidDecision(account: DemoAccount, projectId: string, decision: "Pending" | "Go" | "No-go") {
  const project = (await projectRows()).find((item) => item.id === projectId && item.type === "Bid");
  if (!project || !canLeadProject(account, project)) throw new Error("You can only update a Bid you lead.");
  const fields: Record<string, unknown> = { [airtable.fields.projectsAndBids.decisionStatus]: decision };
  if (decision === "No-go") fields[airtable.fields.projectsAndBids.stage] = "Lost";
  await updateAirtableRecords("projectsAndBids", [{ id: projectId, fields }]);
  if (decision === "No-go") await cancelFutureBookings(projectId);
}

async function cancelFutureBookings(projectId: string) {
  const f = airtable.fields;
  const source = await sourceRecords();
  const today = dateNow();
  const updates = source.bookings.filter((booking) => links(get(booking, f.resourceBookings.project)).includes(projectId) && str(get(booking, f.resourceBookings.startDate)) > today && (isRequest(booking) || pick(get(booking, f.resourceBookings.bookingStatus)) !== "Cancelled"))
    .map((booking) => ({ id: booking.id, fields: { [f.resourceBookings.bookingStatus]: "Cancelled", ...(isRequest(booking) ? { [f.resourceBookings.requestStatus]: "Declined by lead" } : {}) } }));
  if (updates.length) await updateAirtableRecords("resourceBookings", updates);
  const termUpdates = source.terms.filter((term) => links(get(term, f.bookingTerms.project)).includes(projectId) && str(get(term, f.bookingTerms.bookingStart)) > today)
    .map((term) => ({ id: term.id, fields: { [f.bookingTerms.status]: "Cancelled" } }));
  if (termUpdates.length) await updateAirtableRecords("bookingTerms", termUpdates);
}

export async function createMilestone(account: DemoAccount, input: { projectId: string; name: string; startDate: string; endDate: string }) {
  const project = (await projectRows()).find((item) => item.id === input.projectId);
  if (!project || !canLeadProject(account, project)) throw new Error("You can only add milestones to a project you lead.");
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Enter a milestone name up to 120 characters.");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid milestone dates; end date must be on or after start date.");
  const f = airtable.fields.projectMilestones;
  const created = await createAirtableRecords("projectMilestones", [{ fields: {
    [f.name]: input.name.trim(), [f.project]: [project.id], [f.plannedStartDate]: input.startDate,
    [f.plannedEndDate]: input.endDate, [f.expectedStartDate]: input.startDate, [f.expectedEndDate]: input.endDate,
  } }]);
  return created[0]?.id ?? "";
}

export async function updateMilestone(account: DemoAccount, milestoneId: string, input: { name: string; startDate: string; endDate: string }) {
  const record = (await milestoneRecords()).find((row) => row.id === milestoneId);
  if (!record) throw new Error("This milestone could not be found.");
  const f = airtable.fields.projectMilestones;
  const projectId = links(get(record, f.project))[0] ?? "";
  const project = (await projectRows()).find((item) => item.id === projectId);
  if (!project || !canLeadProject(account, project)) throw new Error("You can only edit milestones on a project you lead.");
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Enter a milestone name up to 120 characters.");
  const firstBookingDate = str(get(record, f.firstBookingDate));
  if (firstBookingDate) {
    if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid expected dates.");
    await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: { [f.name]: input.name.trim(), [f.expectedStartDate]: input.startDate, [f.expectedEndDate]: input.endDate } }]);
  } else {
    if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid planned dates.");
    await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: { [f.name]: input.name.trim(), [f.plannedStartDate]: input.startDate, [f.plannedEndDate]: input.endDate, [f.expectedStartDate]: input.startDate, [f.expectedEndDate]: input.endDate } }]);
  }
}

function dateCoverage(milestones: AirtableRecord[], start: string, end: string) {
  const f = airtable.fields.projectMilestones;
  const ranges = milestones.map((m) => ({ start: str(get(m, f.expectedStartDate)) || str(get(m, f.plannedStartDate)), end: str(get(m, f.expectedEndDate)) || str(get(m, f.plannedEndDate)) }))
    .filter((r) => isIsoDate(r.start) && isIsoDate(r.end) && r.end >= r.start).sort((a, b) => a.start.localeCompare(b.start));
  let covered = start;
  for (const range of ranges) {
    if (range.end < covered) continue;
    if (range.start > covered) return false;
    const next = new Date(`${range.end}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); covered = iso(next);
    if (covered > end) return true;
  }
  return false;
}

function isWeekendFreeCoverage(milestones: AirtableRecord[], start: string, end: string) {
  // Milestone coverage is inclusive. Adjacent milestone periods may meet on the same date.
  const f = airtable.fields.projectMilestones;
  const workdays = daysBetween(start, end).filter((d) => weekday(new Date(`${d}T00:00:00Z`)));
  return workdays.every((day) => milestones.some((m) => {
    const s = str(get(m, f.expectedStartDate)) || str(get(m, f.plannedStartDate));
    const e = str(get(m, f.expectedEndDate)) || str(get(m, f.plannedEndDate));
    return s <= day && e >= day;
  }));
}

async function saveBookingTerms(input: { bookingId: string; personId: string; projectId: string; enteredBy: string; team: string; startDate: string; endDate: string; effectiveFrom: string; effectiveTo?: string; status: string; allocations: Array<{ milestoneId: string; hoursPerWeek: number; activeFrom: string; activeTo: string }> }) {
  const f = airtable.fields;
  const key = `${input.bookingId}|${input.effectiveFrom}|${nowStamp()}`;
  const term = await createAirtableRecords("bookingTerms", [{ fields: {
    [f.bookingTerms.key]: key, [f.bookingTerms.booking]: [input.bookingId], [f.bookingTerms.person]: [input.personId],
    [f.bookingTerms.project]: [input.projectId], [f.bookingTerms.teamRequested]: input.team,
    [f.bookingTerms.bookingStart]: input.startDate, [f.bookingTerms.bookingEnd]: input.endDate,
    [f.bookingTerms.effectiveFrom]: input.effectiveFrom, [f.bookingTerms.effectiveTo]: input.effectiveTo ?? "",
    [f.bookingTerms.status]: input.status, [f.bookingTerms.enteredAt]: nowStamp(), [f.bookingTerms.enteredBy]: [input.enteredBy],
  } }]);
  const termId = term[0]?.id;
  if (!termId) throw new Error("The booking terms were not saved.");
  if (input.allocations.length) await createAirtableRecords("bookingAllocations", input.allocations.map((allocation) => ({ fields: {
    [f.bookingAllocations.key]: `${termId}|${allocation.milestoneId}`, [f.bookingAllocations.bookingTerm]: [termId],
    [f.bookingAllocations.milestone]: [allocation.milestoneId], [f.bookingAllocations.hoursPerWeek]: allocation.hoursPerWeek,
    [f.bookingAllocations.activeFrom]: allocation.activeFrom, [f.bookingAllocations.activeTo]: allocation.activeTo,
    [f.bookingAllocations.enteredAt]: nowStamp(),
  } })));
  return termId;
}

async function capacityWarning(personId: string, startDate: string, endDate: string, addedHoursByWeek: Map<string, number>, ignoreBookingId = "") {
  const source = await sourceRecords();
  const person = source.people.find((p) => p.id === personId);
  if (!person) return false;
  const settings = await listAirtableRecords("settings", [airtable.fields.settings.settingName, airtable.fields.settings.redPercent]);
  const settingsRow = settings.find((r) => get(r, airtable.fields.settings.settingName) === "Application Settings");
  const red = num(get(settingsRow ?? { id: "", fields: {} }, airtable.fields.settings.redPercent)) || 1.1;
  for (const day of daysBetween(startDate, endDate)) {
    if (!weekday(new Date(`${day}T00:00:00Z`))) continue;
    const week = weekStartOf(day); const capacity = capacityForWeek(person, week, source.leaves, source.holidays);
    const existing = allBookedHours(source, personId, week, ignoreBookingId), added = addedHoursByWeek.get(week) ?? 0;
    if (capacity === 0 ? existing + added > 0 : (existing + added) / capacity > red) return true;
  }
  return false;
}

async function validateAllocations(projectId: string, personId: string, team: string, startDate: string, endDate: string, allocations: Array<{ milestoneId: string; hoursPerWeek: number }>) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) throw new Error("Enter valid dates; end date must be on or after start date.");
  if (!team.trim()) throw new Error("Choose a team.");
  if (!allocations.length) throw new Error("Allocate the booking to at least one milestone.");
  const total = allocations.reduce((sum, item) => sum + item.hoursPerWeek, 0);
  if (allocations.some((item) => !Number.isFinite(item.hoursPerWeek) || item.hoursPerWeek <= 0 || item.hoursPerWeek > 168) || total > 168) throw new Error("Enter a positive weekly allocation for each selected milestone; the booking total cannot exceed 168 hours per week.");
  const [people, milestones] = await Promise.all([peopleRows(), milestoneRecords()]);
  const person = people.find((item) => item.id === personId && item.status === "Active");
  if (!person) throw new Error("Choose an active person.");
  if (!person.team.split(",").map((item) => item.trim()).includes(team)) throw new Error("The selected person is not in the requested team.");
  if (new Set(allocations.map((item) => item.milestoneId)).size !== allocations.length) throw new Error("Allocate each milestone only once.");
  const selectedMilestones = allocations.map((allocation) => milestones.find((m) => m.id === allocation.milestoneId)).filter((m): m is AirtableRecord => Boolean(m));
  if (selectedMilestones.length !== allocations.length || selectedMilestones.some((m) => !links(get(m, airtable.fields.projectMilestones.project)).includes(projectId))) throw new Error("Select milestones from this project.");
  if (!dateCoverage(selectedMilestones, startDate, endDate)) throw new Error("The selected milestone dates must cover the full booking period without gaps.");
  return { person, selectedMilestones, total };
}

export async function createBooking(account: DemoAccount, input: { projectId: string; personId: string; team: string; startDate: string; endDate: string; allocations: Array<{ milestoneId: string; hoursPerWeek: number }> }) {
  const project = (await projectRows()).find((item) => item.id === input.projectId);
  if (!project || !canLeadProject(account, project) || ["Lost", "cancelled", "Completed"].includes(project.stage)) throw new Error("You can only book people on an active Project or Bid you lead.");
  const validated = await validateAllocations(input.projectId, input.personId, input.team, input.startDate, input.endDate, input.allocations);
  const f = airtable.fields.resourceBookings;
  const booking = await createAirtableRecords("resourceBookings", [{ fields: {
    [f.label]: project.name, [f.person]: [input.personId], [f.project]: [project.id], [f.startDate]: input.startDate,
    [f.endDate]: input.endDate, [f.hoursPerWeek]: validated.total, [f.teamRequested]: input.team,
    [f.milestone]: input.allocations.map((allocation) => allocation.milestoneId), [f.requestedBy]: [account.personId],
    [f.source]: "Lead claimed", [f.bookingStatus]: "Booked", [f.clashFlagged]: false,
  } }]);
  const bookingId = booking[0]?.id;
  if (!bookingId) throw new Error("The booking could not be created.");
  const datedAllocations = withMilestoneActiveDates(input.allocations, validated.selectedMilestones, input.startDate, input.endDate, input.startDate);
  await saveBookingTerms({ bookingId, personId: input.personId, projectId: project.id, enteredBy: account.personId, team: input.team, startDate: input.startDate, endDate: input.endDate, effectiveFrom: input.startDate, allocations: datedAllocations, status: "Booked" });
  const mf = airtable.fields.projectMilestones;
  await updateAirtableRecords("projectMilestones", validated.selectedMilestones.flatMap((milestone) => !str(get(milestone, mf.firstBookingDate)) ? [{ id: milestone.id, fields: { [mf.firstBookingDate]: dateNow() } }] : []));
  const weekTotals = weeklyAllocationTotals(datedAllocations, validated.person);
  return { bookingRecordId: bookingId, personName: validated.person.name, capacityWarning: await capacityWarning(input.personId, input.startDate, input.endDate, weekTotals, bookingId) };
}

export async function createBookingRequest(input: { account: DemoAccount; projectId: string; startDate: string; endDate: string; hoursPerWeek: number; note: string }) {
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid dates; end date must be on or after start date.");
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0 || input.hoursPerWeek > 168) throw new Error("Hours per week must be greater than zero and no more than 168.");
  if (input.note.length > 500) throw new Error("Notes must be 500 characters or fewer.");
  const project = (await projectRows()).find((item) => item.id === input.projectId);
  if (!project || !project.leadIds.length || ["Lost", "cancelled", "Completed"].includes(project.stage)) throw new Error("Choose an active Project or Bid with an assigned Project Lead.");
  const person = (await peopleRows()).find((item) => item.id === input.account.personId);
  if (!person) throw new Error("Your People record could not be found.");
  const f = airtable.fields.resourceBookings;
  const created = await createAirtableRecords("resourceBookings", [{ fields: {
    [f.label]: `${project.name} (booking request)`, [f.person]: [person.id], [f.project]: [project.id],
    [f.requestedBy]: [person.id], [f.requestStatus]: "Requested by person", [f.requestNote]: input.note.trim(),
    [f.bookingStatus]: "Request", [f.teamRequested]: person.team.split(",")[0]?.trim() ?? "",
    [f.startDate]: input.startDate, [f.endDate]: input.endDate, [f.hoursPerWeek]: input.hoursPerWeek,
  } }]);
  return { bookingRecordId: created[0]?.id, leadNames: project.leadName };
}

export async function resolveBookingRequest(account: DemoAccount, input: { bookingId: string; approve: boolean; startDate?: string; endDate?: string; team?: string; allocations?: Array<{ milestoneId: string; hoursPerWeek: number }>; newMilestone?: { name: string; startDate: string; endDate: string; hoursPerWeek: number } }) {
  const f = airtable.fields;
  const record = (await listAirtableRecords("resourceBookings", Object.values(f.resourceBookings))).find((row) => row.id === input.bookingId);
  if (!record || !isRequest(record) || pick(get(record, f.resourceBookings.requestStatus)) !== "Requested by person") throw new Error("This request is no longer waiting for a decision.");
  const projectId = links(get(record, f.resourceBookings.project))[0] ?? "";
  const project = (await projectRows()).find((item) => item.id === projectId && canLeadProject(account, item));
  if (!project || ["Lost", "cancelled", "Completed"].includes(project.stage)) throw new Error("You can only manage requests on an active Project or Bid you lead.");
  if (!input.approve) {
    await updateAirtableRecords("resourceBookings", [{ id: record.id, fields: { [f.resourceBookings.requestStatus]: "Declined by lead", [f.resourceBookings.bookingStatus]: "Cancelled" } }]);
    return { capacityWarning: false };
  }
  let allocations = input.allocations ?? [];
  if (input.newMilestone) {
    const id = await createMilestone(account, { projectId, name: input.newMilestone.name, startDate: input.newMilestone.startDate, endDate: input.newMilestone.endDate });
    allocations = [...allocations, { milestoneId: id, hoursPerWeek: input.newMilestone.hoursPerWeek }];
  }
  const startDate = input.startDate ?? str(get(record, f.resourceBookings.startDate));
  const endDate = input.endDate ?? str(get(record, f.resourceBookings.endDate));
  const personId = links(get(record, f.resourceBookings.person))[0] ?? "";
  const team = input.team ?? str(get(record, f.resourceBookings.teamRequested));
  const validated = await validateAllocations(projectId, personId, team, startDate, endDate, allocations);
  await updateAirtableRecords("resourceBookings", [{ id: record.id, fields: {
    [f.resourceBookings.bookingStatus]: "Booked", [f.resourceBookings.requestStatus]: "Approved by lead",
    [f.resourceBookings.startDate]: startDate, [f.resourceBookings.endDate]: endDate, [f.resourceBookings.teamRequested]: team,
    [f.resourceBookings.hoursPerWeek]: validated.total, [f.resourceBookings.milestone]: allocations.map((item) => item.milestoneId),
    [f.resourceBookings.source]: "Person request",
  } }]);
  const datedAllocations = withMilestoneActiveDates(allocations, validated.selectedMilestones, startDate, endDate, startDate);
  await saveBookingTerms({ bookingId: record.id, personId, projectId, enteredBy: account.personId, team, startDate, endDate, effectiveFrom: startDate, allocations: datedAllocations, status: "Booked" });
  const mf = airtable.fields.projectMilestones;
  await updateAirtableRecords("projectMilestones", validated.selectedMilestones.flatMap((milestone) => !str(get(milestone, mf.firstBookingDate)) ? [{ id: milestone.id, fields: { [mf.firstBookingDate]: dateNow() } }] : []));
  const weekTotals = weeklyAllocationTotals(datedAllocations, validated.person);
  return { capacityWarning: await capacityWarning(personId, startDate, endDate, weekTotals, record.id) };
}

export async function editBooking(account: DemoAccount, input: { bookingId: string; effectiveFrom: string; startDate: string; endDate: string; team: string; allocations: Array<{ milestoneId: string; hoursPerWeek: number }> }) {
  const f = airtable.fields;
  const source = await sourceRecords();
  const booking = source.bookings.find((row) => row.id === input.bookingId);
  if (!booking || pick(get(booking, f.resourceBookings.bookingStatus)) !== "Booked") throw new Error("This booking is no longer editable.");
  const projectId = links(get(booking, f.resourceBookings.project))[0] ?? "";
  const project = source.projects.find((item) => item.id === projectId);
  if (!project || !canLeadProject(account, project)) throw new Error("You can only edit bookings on a Project you lead.");
  if (!isIsoDate(input.effectiveFrom)) throw new Error("Choose a valid date for the change to take effect.");
  const validated = await validateAllocations(projectId, links(get(booking, f.resourceBookings.person))[0] ?? "", input.team, input.startDate, input.endDate, input.allocations);
  const oldTerms = source.terms.filter((term) => links(get(term, f.bookingTerms.booking)).includes(booking.id) && !str(get(term, f.bookingTerms.effectiveTo)) && pick(get(term, f.bookingTerms.status)) === "Booked");
  if (!oldTerms.length) throw new Error("This booking has no current version. Refresh the page and try again.");
  const effectiveTo = iso(new Date(new Date(`${input.effectiveFrom}T00:00:00Z`).getTime() - 86400000));
  if (oldTerms.some((term) => str(get(term, f.bookingTerms.effectiveFrom)) >= input.effectiveFrom)) throw new Error("The change date must be after the current booking version starts.");
  const oldTermIds = oldTerms.map((row) => row.id);
  await updateAirtableRecords("bookingTerms", oldTerms.map((term) => ({ id: term.id, fields: { [f.bookingTerms.effectiveTo]: effectiveTo, [f.bookingTerms.status]: "Superseded" } })));
  const oldAllocations = source.allocations.filter((allocation) => links(get(allocation, f.bookingAllocations.bookingTerm)).some((id) => oldTermIds.includes(id)) && !str(get(allocation, f.bookingAllocations.activeTo)));
  if (oldAllocations.length) await updateAirtableRecords("bookingAllocations", oldAllocations.map((allocation) => ({ id: allocation.id, fields: { [f.bookingAllocations.activeTo]: str(get(allocation, f.bookingAllocations.activeTo)) && str(get(allocation, f.bookingAllocations.activeTo)) < effectiveTo ? str(get(allocation, f.bookingAllocations.activeTo)) : effectiveTo } })));
  const personId = links(get(booking, f.resourceBookings.person))[0] ?? "";
  const datedAllocations = withMilestoneActiveDates(input.allocations, validated.selectedMilestones, input.startDate, input.endDate, input.effectiveFrom);
  await saveBookingTerms({ bookingId: booking.id, personId, projectId, enteredBy: account.personId, team: input.team, startDate: input.startDate, endDate: input.endDate, effectiveFrom: input.effectiveFrom, allocations: datedAllocations, status: "Booked" });
  await updateAirtableRecords("resourceBookings", [{ id: booking.id, fields: {
    [f.resourceBookings.startDate]: input.startDate, [f.resourceBookings.endDate]: input.endDate,
    [f.resourceBookings.hoursPerWeek]: validated.total, [f.resourceBookings.teamRequested]: input.team,
    [f.resourceBookings.milestone]: input.allocations.map((item) => item.milestoneId),
  } }]);
  const weekTotals = weeklyAllocationTotals(datedAllocations, validated.person);
  return { capacityWarning: await capacityWarning(personId, input.startDate, input.endDate, weekTotals, booking.id) };
}

export async function getAvailability(account: DemoAccount, input: { projectId: string; team: string; startDate: string; endDate: string }) {
  const project = (await projectRows()).find((item) => item.id === input.projectId);
  if (!project || !canLeadProject(account, project)) throw new Error("You can only check availability for a Project you lead.");
  if (!input.team || !isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Choose a team and a valid date range.");
  const source = await sourceRecords();
  const settings = await listAirtableRecords("settings", [airtable.fields.settings.settingName, airtable.fields.settings.amberPercent, airtable.fields.settings.redPercent]);
  const settingsRow = settings.find((row) => get(row, airtable.fields.settings.settingName) === "Application Settings");
  const amber = num(get(settingsRow ?? { id: "", fields: {} }, airtable.fields.settings.amberPercent)) || 0.9;
  const red = num(get(settingsRow ?? { id: "", fields: {} }, airtable.fields.settings.redPercent)) || 1.1;
  const weeks = Array.from(new Set(daysBetween(input.startDate, input.endDate).filter((day) => weekday(new Date(`${day}T00:00:00Z`))).map(weekStartOf)));
  return source.people.filter((person) => person.status === "Active" && person.team.split(",").map((item) => item.trim()).includes(input.team)).map((person) => {
    const perWeek = weeks.map((week) => {
      const capacity = capacityForWeek(person, week, source.leaves, source.holidays);
      const booked = allBookedHours(source, person.id, week);
      return { capacity, available: capacity - booked, load: capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0 };
    });
    const spaces = perWeek.map((row) => row.available);
    const available = spaces.length ? Math.min(...spaces) : 0;
    const peak = perWeek.reduce((value, row) => Math.max(value, row.load), 0);
    const loadStatus = peak > red ? "Red" as const : peak >= amber ? "Amber" as const : "Green" as const;
    return { personId: person.id, name: person.name, team: person.team, availableHoursPerWeek: Math.max(0, Math.round(available * 100) / 100), loadPercent: Math.round(peak * 100), loadStatus, capacityWarning: loadStatus === "Red" };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function expectedActualGroups(source: Awaited<ReturnType<typeof sourceRecords>>, person: Person, week: string) {
  const f = airtable.fields;
  const allocationsByTerm = new Map<string, AirtableRecord[]>();
  for (const allocation of source.allocations) for (const id of links(get(allocation, f.bookingAllocations.bookingTerm))) {
    const list = allocationsByTerm.get(id) ?? []; list.push(allocation); allocationsByTerm.set(id, list);
  }
  const bookingsById = new Map(source.bookings.map((row) => [row.id, row]));
  const projectsById = new Map(source.projects.map((row) => [row.id, row]));
  const milestonesById = new Map(source.milestones.map((row) => [row.id, row]));
  const grouped = new Map<string, WeeklyActualLine>();
  for (const term of source.terms.filter((row) => links(get(row, f.bookingTerms.person)).includes(person.id) && isUsableTerm(row))) {
    const bookingId = links(get(term, f.bookingTerms.booking))[0] ?? "";
    const booking = bookingsById.get(bookingId);
    if (!booking || pick(get(booking, f.resourceBookings.bookingStatus)) !== "Booked") continue;
    if (str(get(term, f.bookingTerms.bookingStart)) > weekEndOf(week) || str(get(term, f.bookingTerms.bookingEnd)) < week || str(get(term, f.bookingTerms.effectiveFrom)) > weekEndOf(week) || (str(get(term, f.bookingTerms.effectiveTo)) && str(get(term, f.bookingTerms.effectiveTo)) < week)) continue;
    const projectId = links(get(term, f.bookingTerms.project))[0] ?? "";
    for (const allocation of allocationsByTerm.get(term.id) ?? []) {
      const milestoneId = links(get(allocation, f.bookingAllocations.milestone))[0] ?? "";
      const expectedHours = effectiveHoursForAllocation(allocation, term, person, week);
      if (!expectedHours || !milestoneId) continue;
      const key = `${person.id}|${projectId}|${milestoneId}|${week}`;
      const milestone = milestonesById.get(milestoneId);
      const line = grouped.get(key) ?? { key, allocationIds: [], bookingTermIds: [], bookingIds: [], projectId, projectName: projectsById.get(projectId)?.name ?? "Unknown project", milestoneId, milestoneName: milestone ? str(get(milestone, f.projectMilestones.name)) : "Milestone", expectedHours: 0, actualHours: null, locked: false };
      line.expectedHours += expectedHours;
      line.allocationIds.push(allocation.id);
      line.bookingTermIds.push(term.id);
      line.bookingIds.push(bookingId);
      grouped.set(key, line);
    }
  }
  return Array.from(grouped.values()).map((line) => ({
    ...line,
    allocationIds: Array.from(new Set(line.allocationIds)),
    bookingTermIds: Array.from(new Set(line.bookingTermIds)),
    bookingIds: Array.from(new Set(line.bookingIds)),
    expectedHours: Math.round(line.expectedHours * 100) / 100,
  }));
}

export async function getWeeklyActualWorkspace(account: DemoAccount, weekInput?: string) {
  const week = weekInput && isIsoDate(weekInput) ? weekStartOf(weekInput) : weekStartOf(dateNow());
  const source = await sourceRecords();
  const f = airtable.fields;
  const person = source.people.find((item) => item.id === account.personId);
  if (!person) throw new Error("Your People record could not be found.");
  const end = weekEndOf(week);
  const locked = new Date(`${end}T23:59:59Z`).getTime() + 7 * 86400000 < Date.now();
  const lines = expectedActualGroups(source, person, week);
  const existingByKey = new Map<string, AirtableRecord[]>();
  for (const row of source.actuals) {
    const key = str(get(row, f.weeklyActuals.key));
    const rows = existingByKey.get(key) ?? [];
    rows.push(row);
    existingByKey.set(key, rows);
  }
  for (const line of lines) {
    const exact = existingByKey.get(line.key) ?? [];
    const legacy = exact.length ? [] : source.actuals.filter((row) => str(get(row, f.weeklyActuals.weekStartingMonday)) === week && links(get(row, f.weeklyActuals.allocation)).some((id) => line.allocationIds.includes(id)));
    const actualRows = exact.length ? exact : legacy;
    line.actualHours = actualRows.length ? Math.round(actualRows.reduce((sum, row) => sum + num(get(row, f.weeklyActuals.actualHours)), 0) * 100) / 100 : null;
    line.locked = actualRows.length > 0 && locked;
  }
  const capacity = capacityForWeek(person, week, source.leaves, source.holidays);
  const actualHours = lines.reduce((sum, line) => sum + (line.actualHours ?? 0), 0);
  return { week, weekEnd: end, capacity, actualHours: Math.round(actualHours * 100) / 100, capacityWarning: actualHours > capacity, lines: lines.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.milestoneName.localeCompare(b.milestoneName)), locked, missingCount: lines.filter((line) => line.actualHours === null).length };
}

export async function saveWeeklyActuals(account: DemoAccount, weekInput: string, values: Array<{ key: string; hours: number | null }>) {
  const week = weekStartOf(weekInput);
  if (!week || !Array.isArray(values) || values.length > 200) throw new Error("Choose a valid work week and up to 200 milestone entries.");
  if (week > weekStartOf(dateNow())) throw new Error("Actual hours can only be entered after the work week begins.");
  const workspace = await getWeeklyActualWorkspace(account, week);
  const allowed = new Map(workspace.lines.map((line) => [line.key, line]));
  if (new Set(values.map((value) => value.key)).size !== values.length) throw new Error("Each project milestone can appear only once in a weekly submission.");
  const f = airtable.fields.weeklyActuals;
  const existing = await listAirtableRecords("weeklyActuals", Object.values(f));
  const existingByKey = new Map<string, AirtableRecord[]>();
  for (const row of existing) {
    const key = str(get(row, f.key));
    const rows = existingByKey.get(key) ?? [];
    rows.push(row);
    existingByKey.set(key, rows);
  }
  const creates: Array<{ fields: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const deletions: string[] = [];
  for (const value of values) {
    const line = allowed.get(value.key);
    if (!line) throw new Error("A milestone allocation changed. Refresh the page and try again.");
    const key = line.key;
    const exactRows = existingByKey.get(key) ?? [];
    const legacyRows = exactRows.length ? [] : existing.filter((row) => str(get(row, f.weekStartingMonday)) === week && links(get(row, f.allocation)).some((id) => line.allocationIds.includes(id)));
    const currentRows = exactRows.length ? exactRows : legacyRows;
    const current = currentRows[0];
    if (value.hours === null) {
      if (!line.locked) deletions.push(...currentRows.map((row) => row.id));
      continue;
    }
    if (!Number.isFinite(value.hours) || value.hours < 0 || value.hours > 168 || Math.round(value.hours * 100) !== value.hours * 100) throw new Error("Enter non-negative hours up to two decimal places.");
    const priorHours = currentRows.reduce((sum, row) => sum + num(get(row, f.actualHours)), 0);
    if (current && value.hours === priorHours) continue;
    if (current && line.locked) throw new Error("This work week is locked for edits; saved entries cannot be changed after the correction window.");
    const fields: Record<string, unknown> = {
      [f.key]: key, [f.bookingTerm]: line.bookingTermIds, [f.allocation]: line.allocationIds, [f.person]: [account.personId],
      [f.project]: [line.projectId], [f.milestone]: [line.milestoneId], [f.weekStartingMonday]: week,
      [f.actualHours]: value.hours, ...(!current ? { [f.enteredAt]: nowStamp(), [f.enteredBy]: [account.personId] } : {}),
    };
    if (current) {
      updates.push({ id: current.id, fields });
      deletions.push(...currentRows.slice(1).map((row) => row.id));
    } else creates.push({ fields });
  }
  if (deletions.length) await deleteAirtableRecords("weeklyActuals", deletions);
  if (creates.length) await createAirtableRecords("weeklyActuals", creates);
  if (updates.length) await updateAirtableRecords("weeklyActuals", updates);
  const result = await getWeeklyActualWorkspace(account, week);
  return { capacityWarning: result.capacityWarning, actualHours: result.actualHours, capacity: result.capacity, missingCount: result.missingCount };
}

function quarterWeeks(quarter: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) throw new Error("Choose a quarter such as 2026-Q4.");
  const year = Number(match[1]), q = Number(match[2]);
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1)), end = new Date(Date.UTC(year, q * 3, 0));
  const weeks: string[] = [];
  for (let d = new Date(start); d <= end; d = nextDay(d)) if (d.getUTCDay() === 1) weeks.push(iso(d));
  return weeks;
}

export async function getQuarterReport(quarter: string) {
  const source = await sourceRecords();
  const f = airtable.fields;
  const weeks = quarterWeeks(quarter);
  const settings = await listAirtableRecords("settings", [f.settings.settingName, f.settings.amberPercent, f.settings.redPercent]);
  const settingsRow = settings.find((row) => get(row, f.settings.settingName) === "Application Settings");
  const amber = num(get(settingsRow ?? { id: "", fields: {} }, f.settings.amberPercent)) || 0.9;
  const red = num(get(settingsRow ?? { id: "", fields: {} }, f.settings.redPercent)) || 1.1;
  const actualsByWeekPerson = new Map<string, number>();
  for (const row of source.actuals) {
    const who = links(get(row, f.weeklyActuals.person))[0] ?? "", week = str(get(row, f.weeklyActuals.weekStartingMonday));
    const key = `${who}|${week}`; actualsByWeekPerson.set(key, (actualsByWeekPerson.get(key) ?? 0) + num(get(row, f.weeklyActuals.actualHours)));
  }
  const people = source.people.filter((person) => person.status !== "Left organisation");
  const summaries = people.map((person) => {
    let quarterCapacity = 0, quarterBooked = 0, quarterActual = 0, peak = 0, expectedLines = 0, loggedLines = 0;
    for (const week of weeks) {
      const capacity = capacityForWeek(person, week, source.leaves, source.holidays);
      const booked = allBookedHours(source, person.id, week);
      quarterCapacity += capacity; quarterBooked += booked;
      const actual = actualsByWeekPerson.get(`${person.id}|${week}`);
      if (actual !== undefined) quarterActual += actual;
      const ratio = capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0;
      peak = Math.max(peak, ratio);
      const actualWorkspace = actualLinesForPersonWeek(source, person, week);
      expectedLines += actualWorkspace.length;
      loggedLines += actualWorkspace.filter((line) => source.actuals.some((row) => str(get(row, f.weeklyActuals.key)) === line.key || (str(get(row, f.weeklyActuals.weekStartingMonday)) === week && links(get(row, f.weeklyActuals.allocation)).some((id) => line.allocationIds.includes(id))))).length;
    }
    const status = peak > red ? "Red" : peak >= amber ? "Amber" : "Green";
    return { personId: person.id, name: person.name, team: person.team, quarterBooked, quarterCapacity, quarterActual, actualCoverage: expectedLines ? loggedLines / expectedLines : 0, utilisation: quarterCapacity ? quarterBooked / quarterCapacity : 0, peak, status };
  }).sort((a, b) => b.peak - a.peak || a.name.localeCompare(b.name));
  const teams = new Map<string, { name: string; quarterBooked: number; quarterCapacity: number; quarterActual: number; peopleCount: number; peak: number; reviewPeopleCount: number }>();
  for (const person of summaries) {
    for (const teamName of person.team.split(",").map((value) => value.trim()).filter(Boolean).length ? person.team.split(",").map((value) => value.trim()).filter(Boolean) : ["Unassigned"]) {
      const team = teams.get(teamName) ?? { name: teamName, quarterBooked: 0, quarterCapacity: 0, quarterActual: 0, peopleCount: 0, peak: 0, reviewPeopleCount: 0 };
      team.quarterBooked += person.quarterBooked; team.quarterCapacity += person.quarterCapacity; team.quarterActual += person.quarterActual; team.peopleCount++;
      team.peak = Math.max(team.peak, person.peak); if (person.status === "Red") team.reviewPeopleCount++;
      teams.set(teamName, team);
    }
  }
  const teamRows = Array.from(teams.values()).map((team) => ({ ...team, utilisation: team.quarterCapacity ? team.quarterBooked / team.quarterCapacity : 0, status: team.peak > red ? "Red" as const : team.peak >= amber ? "Amber" as const : "Green" as const })).sort((a, b) => b.utilisation - a.utilisation);
  return { quarter, weeks, summaries, teams: teamRows, thresholds: { amber, red }, totals: { booked: summaries.reduce((sum, row) => sum + row.quarterBooked, 0), capacity: summaries.reduce((sum, row) => sum + row.quarterCapacity, 0), actual: summaries.reduce((sum, row) => sum + row.quarterActual, 0), actualCoverage: summaries.length ? summaries.reduce((sum, row) => sum + row.actualCoverage, 0) / summaries.length : 0 } };
}

function actualLinesForPersonWeek(source: Awaited<ReturnType<typeof sourceRecords>>, person: Person, week: string) {
  return expectedActualGroups(source, person, week);
}

export async function getTeamQuarterReport(quarter: string, teamName: string) {
  const report = await getQuarterReport(quarter);
  return { ...report, summaries: report.summaries.filter((row) => row.team.split(",").map((value) => value.trim()).includes(teamName)) };
}

export async function getTeamPeople(account: DemoAccount) {
  const people = await peopleRows();
  const bookings = await getBookingRows();
  const visible = account.assignedRoles.includes("admin") ? people.filter((person) => person.status !== "Left organisation") : people.filter((person) => person.status !== "Left organisation" && person.managerIds.includes(account.personId));
  return visible.map((person) => {
    const personBookings = bookings.filter((booking) => booking.personId === person.id && booking.bookingStatus === "Booked");
    const flaggedProjects = Array.from(new Set(personBookings.filter((booking) => booking.clashFlagged).map((booking) => booking.projectName)));
    return { personId: person.id, name: person.name, team: person.team, bookingCount: personBookings.length, flaggedProjects, hasCapacityAlert: flaggedProjects.length > 0 };
  }).sort((a, b) => Number(b.hasCapacityAlert) - Number(a.hasCapacityAlert) || a.name.localeCompare(b.name));
}

export async function getTeamPerson(account: DemoAccount, personId: string) {
  const people = await peopleRows();
  const person = people.find((item) => item.id === personId);
  if (!person || (!account.assignedRoles.includes("admin") && person.id !== account.personId && (!account.assignedRoles.includes("line_manager") || !person.managerIds.includes(account.personId)))) return null;
  return { person, bookings: (await getBookingRows()).filter((booking) => booking.personId === personId) };
}

export type AccountAdminRow = { id: string; label: string; personId: string; personName: string; buttonLabel: string; roles: AssignedRole[]; enabled: boolean };
export async function getAccountAdminRows(account: DemoAccount): Promise<{ accounts: AccountAdminRow[]; people: Array<{ id: string; name: string }>; roles: Array<{ key: AssignedRole; label: string }> }> {
  if (!account.assignedRoles.includes("admin")) throw new Error("Only Admins can manage demo accounts.");
  const f = airtable.fields;
  const [records, people] = await Promise.all([listAirtableRecords("appAccounts", Object.values(f.appAccounts)), peopleRows()]);
  const byPerson = new Map(people.map((person) => [person.id, person]));
  const roleMap: Record<string, AssignedRole> = { Admin: "admin", "C-Suite": "c_suite", HR: "hr", "Line Manager": "line_manager", "Project Lead": "project_lead" };
  const accounts = records.map((row) => {
    const personId = links(get(row, f.appAccounts.person))[0] ?? "";
    const names = get(row, f.appAccounts.appRoles);
    const roles = (Array.isArray(names) ? names : []).map((item) => typeof item === "string" ? item : item && typeof item === "object" && "name" in item ? String(item.name) : "").map((name) => roleMap[name]).filter((role): role is AssignedRole => Boolean(role));
    return { id: row.id, label: str(get(row, f.appAccounts.demoAccountLabel)), personId, personName: byPerson.get(personId)?.name ?? "Unlinked", buttonLabel: str(get(row, f.appAccounts.demoButtonLabel)), roles, enabled: pick(get(row, f.appAccounts.accountStatus)) === "Enabled" };
  });
  return { accounts, people: people.map((person) => ({ id: person.id, name: person.name })), roles: [{ key: "admin", label: "Admin" }, { key: "c_suite", label: "C-Suite" }, { key: "hr", label: "HR" }, { key: "line_manager", label: "Line Manager" }, { key: "project_lead", label: "Project Lead" }] };
}

export async function saveDemoAccount(account: DemoAccount, input: { id?: string; label: string; buttonLabel: string; personId: string; roles: AssignedRole[]; enabled: boolean }) {
  if (!account.assignedRoles.includes("admin")) throw new Error("Only Admins can manage demo accounts.");
  const f = airtable.fields.appAccounts;
  const person = (await peopleRows()).find((row) => row.id === input.personId);
  if (!person || !input.label.trim() || !input.buttonLabel.trim()) throw new Error("Choose a People record and enter both account labels.");
  const roleNames: Record<AssignedRole, string> = { admin: "Admin", c_suite: "C-Suite", hr: "HR", line_manager: "Line Manager", project_lead: "Project Lead" };
  const fields: Record<string, unknown> = { [f.demoAccountLabel]: input.label.trim(), [f.demoButtonLabel]: input.buttonLabel.trim(), [f.person]: [person.id], [f.appRoles]: input.roles.map((role) => roleNames[role]), [f.accountStatus]: input.enabled ? "Enabled" : "Disabled" };
  if (input.id) await updateAirtableRecords("appAccounts", [{ id: input.id, fields }], true);
  else await createAirtableRecords("appAccounts", [{ fields }], true);
}
