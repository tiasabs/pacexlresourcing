import "server-only";

import { airtable } from "@/config/airtable";
import { listAirtableRecords, updateAirtableRecords, createAirtableRecords, type AirtableRecord } from "@/lib/airtable/records";
import type { DemoAccount } from "@/lib/demo/accounts";

type Project = { id: string; name: string; leadIds: string[] };
type Person = { id: string; name: string; firstName: string; team: string; managerIds: string[]; status: string; contractedHours: number; workdays: number; region: string };
export type BookingRow = {
  id: string; bookingId: string; label: string; personId: string; personName: string; projectId: string; projectName: string;
  startDate: string; endDate: string; hoursPerWeek: number; confirmedOn: string; clashFlagged: boolean; clashNote: string;
  clashWeeks: Array<{ weekStart: string; weekLabel: string; bookedHours: number; capacityHours: number; ratio: number; projectNames: string[] }>;
  requestStatus: string; requestNote: string; leadName: string;
  milestoneId: string; milestoneName: string; personConfirmationStatus: string;
};
export type TeamRosterRow = { personId: string; name: string; team: string; bookingCount: number; flaggedProjects: string[]; hasCapacityAlert: boolean };
export type MilestoneCandidate = { personId: string; name: string; availableHoursPerWeek: number };
export type MilestoneRow = {
  id: string; name: string; projectId: string; plannedStartDate: string; plannedEndDate: string;
  expectedStartDate: string; expectedEndDate: string; hoursPerWeekRequired: number; teamRequested: string;
  status: string; description: string; firstBookingDate: string; allocatedHoursPerWeek: number;
  remainingHoursPerWeek: number; candidates: MilestoneCandidate[]; noAvailablePeople: boolean;
  bookings: BookingRow[];
};

const get = (record: AirtableRecord, fieldId: string) => record.fields[fieldId];
const str = (value: unknown) => typeof value === "string" ? value : "";
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const links = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
const selected = (value: unknown) => Array.isArray(value)
  ? value.map((item) => typeof item === "string" ? item : typeof item === "object" && item && "name" in item ? String(item.name) : "").filter(Boolean).join(", ")
  : str(value);

function bookingWeeks(startDate: string, endDate: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return [];
  const result: string[] = [];
  const start = monday(new Date(`${startDate}T00:00:00Z`));
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let week = start; week <= end; week = new Date(week.getTime() + 7 * 86400000)) result.push(iso(week));
  return result;
}

function weekCapacity(person: Person, weekStart: string, leaves: AirtableRecord[], holidays: AirtableRecord[]) {
  const f = airtable.fields;
  const week = new Date(`${weekStart}T00:00:00Z`);
  const weekEnd = new Date(week); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const appliesToPerson = (row: AirtableRecord) => selected(get(row, f.publicHolidays.region)).split(",").map((region) => region.trim()).includes(person.region);
  const holidayDates = new Set(holidays
    .filter(appliesToPerson)
    .map((row) => str(get(row, f.publicHolidays.date)))
    .filter((date) => date >= iso(week) && date <= iso(weekEnd) && weekday(new Date(`${date}T00:00:00Z`))));
  const allPersonHolidayDates = new Set(holidays
    .filter(appliesToPerson)
    .map((row) => str(get(row, f.publicHolidays.date))));
  const leaveHours = leaves
    .filter((row) => links(get(row, f.plannedLeave.person)).includes(person.id) && selected(get(row, f.plannedLeave.status)) === "Approved")
    .reduce((sum, row) => {
      const startValue = str(get(row, f.plannedLeave.startDate));
      const endValue = str(get(row, f.plannedLeave.endDate));
      const leaveStart = new Date(`${startValue}T00:00:00Z`);
      const leaveEnd = new Date(`${endValue}T00:00:00Z`);
      if (!isIsoDate(startValue) || !isIsoDate(endValue) || leaveStart > weekEnd || leaveEnd < week) return sum;
      let effectiveLeaveWeekdays = 0, effectiveOverlapWeekdays = 0;
      for (let day = new Date(leaveStart); day <= leaveEnd; day = nextDay(day)) {
        const date = iso(day);
        if (!weekday(day) || allPersonHolidayDates.has(date)) continue;
        effectiveLeaveWeekdays++;
        if (day >= week && day <= weekEnd) effectiveOverlapWeekdays++;
      }
      const leaveDays = num(get(row, f.plannedLeave.leaveDays));
      const proportionalDays = effectiveLeaveWeekdays ? leaveDays * effectiveOverlapWeekdays / effectiveLeaveWeekdays : 0;
      return sum + proportionalDays * person.contractedHours / person.workdays;
    }, 0);
  const dailyHours = person.workdays ? person.contractedHours / person.workdays : 0;
  const holidayHours = holidayDates.size * dailyHours;
  const availableWorkdays = Math.max(0, Math.min(person.workdays, 5 - holidayDates.size));
  const maximumLeaveHours = availableWorkdays * dailyHours;
  return { capacity: Math.max(0, person.contractedHours - holidayHours - Math.min(leaveHours, maximumLeaveHours)), leaveHours: Math.min(leaveHours, maximumLeaveHours), holidayHours };
}

function withWeeklyCapacityFlags(rows: BookingRow[], people: Person[], leaves: AirtableRecord[], holidays: AirtableRecord[], redThreshold: number) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const totals = new Map<string, number>();
  const projectsByWeek = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (isDeclinedBooking(row)) continue;
    for (const weekStart of bookingWeeks(row.startDate, row.endDate)) {
      const key = `${row.personId}|${weekStart}`;
      totals.set(key, (totals.get(key) ?? 0) + row.hoursPerWeek);
      if (!projectsByWeek.has(key)) projectsByWeek.set(key, new Map());
      projectsByWeek.get(key)?.set(row.projectId, row.projectName);
    }
  }
  const capacities = new Map<string, { bookedHours: number; capacityHours: number; ratio: number; weekLabel: string; projectNames: string[] }>();
  const firstVisibleWeek = iso(monday(new Date()));
  for (const [key, bookedHours] of totals) {
    const [personId, weekStart] = key.split("|");
    if (weekStart < firstVisibleWeek) continue;
    const person = peopleById.get(personId);
    if (!person) continue;
    const capacityHours = weekCapacity(person, weekStart, leaves, holidays).capacity;
    const ratio = capacityHours > 0 ? bookedHours / capacityHours : bookedHours > 0 ? 2 : 0;
    const weekLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${weekStart}T00:00:00Z`));
    capacities.set(key, { bookedHours, capacityHours, ratio, weekLabel, projectNames: Array.from(projectsByWeek.get(key)?.values() ?? []) });
  }
  return rows.map((row) => {
    const clashWeeks = isDeclinedBooking(row) ? [] : bookingWeeks(row.startDate, row.endDate).flatMap((weekStart) => {
      const capacity = capacities.get(`${row.personId}|${weekStart}`);
      return capacity && capacity.ratio > redThreshold ? [{ weekStart, ...capacity }] : [];
    });
    const clashFlagged = clashWeeks.length > 0;
    const clashNote = clashFlagged ? `This booking falls in a week above ${Math.round(redThreshold * 100)}% of available capacity.` : "";
    return { ...row, clashFlagged, clashNote, clashWeeks };
  });
}

async function getPeople(): Promise<Person[]> {
  const f = airtable.fields;
  const rows = await listAirtableRecords("people", [f.people.fullName, f.people.firstName, f.people.lastName, f.people.team, f.people.lineManager, f.people.status, f.people.contractedHours, f.people.workingDaysPerWeek, f.people.region]);
  return rows.map((record) => ({
    id: record.id, name: str(get(record, f.people.fullName)) || `${str(get(record, f.people.firstName))} ${str(get(record, f.people.lastName))}`.trim(),
    firstName: str(get(record, f.people.firstName)), team: selected(get(record, f.people.team)), managerIds: links(get(record, f.people.lineManager)),
    status: selected(get(record, f.people.status)), contractedHours: num(get(record, f.people.contractedHours)), workdays: num(get(record, f.people.workingDaysPerWeek)) || 5,
    region: selected(get(record, f.people.region)),
  }));
}

async function getProjects(): Promise<Project[]> {
  const f = airtable.fields.projectsAndBids;
  const rows = await listAirtableRecords("projectsAndBids", [f.name, f.lead]);
  return rows.map((record) => ({ id: record.id, name: str(get(record, f.name)), leadIds: links(get(record, f.lead)) }));
}

async function getBookingRows(): Promise<BookingRow[]> {
  const f = airtable.fields;
  const [rows, people, projects, leaves, holidays, settings, milestoneRecords] = await Promise.all([
    listAirtableRecords("resourceBookings", Object.values(f.resourceBookings)),
    getPeople(),
    getProjects(),
    listAirtableRecords("plannedLeave", [f.plannedLeave.person, f.plannedLeave.status, f.plannedLeave.startDate, f.plannedLeave.endDate, f.plannedLeave.leaveDays]),
    listAirtableRecords("publicHolidays", [f.publicHolidays.date, f.publicHolidays.region]),
    listAirtableRecords("settings", [f.settings.settingName, f.settings.redPercent]),
    listAirtableRecords("projectMilestones", [f.projectMilestones.name]),
  ]);
  const applicationSettings = settings.find((row) => get(row, f.settings.settingName) === "Application Settings");
  const redThreshold = num(applicationSettings && get(applicationSettings, f.settings.redPercent)) || 1.1;
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const milestonesById = new Map(milestoneRecords.map((milestone) => [milestone.id, str(get(milestone, f.projectMilestones.name))]));
  const bookings = rows.map((record) => {
    const personId = links(get(record, f.resourceBookings.person))[0] ?? "";
    const projectId = links(get(record, f.resourceBookings.project))[0] ?? "";
    const milestoneId = links(get(record, f.resourceBookings.milestone))[0] ?? "";
    const project = projectsById.get(projectId);
    return {
      id: record.id, bookingId: str(get(record, f.resourceBookings.bookingId)), label: str(get(record, f.resourceBookings.label)),
      personId, personName: peopleById.get(personId)?.name ?? "Unknown person", projectId,
      projectName: project?.name ?? "Unknown project", startDate: str(get(record, f.resourceBookings.startDate)),
      endDate: str(get(record, f.resourceBookings.endDate)), hoursPerWeek: num(get(record, f.resourceBookings.hoursPerWeek)),
      confirmedOn: str(get(record, f.resourceBookings.confirmedOn)), clashFlagged: false,
      clashNote: "", clashWeeks: [], requestStatus: selected(get(record, f.resourceBookings.requestStatus)),
      requestNote: str(get(record, f.resourceBookings.requestNote)), leadName: project?.leadIds.map((id) => peopleById.get(id)?.name).filter(Boolean).join(", ") ?? "",
      milestoneId, milestoneName: milestonesById.get(milestoneId) ?? "", personConfirmationStatus: selected(get(record, f.resourceBookings.personConfirmationStatus)),
    };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.projectName.localeCompare(b.projectName));
  return withWeeklyCapacityFlags(bookings, people, leaves, holidays, redThreshold);
}

export async function syncBookingClashFlags() {
  const f = airtable.fields.resourceBookings;
  const [bookings, records] = await Promise.all([
    getBookingRows(),
    listAirtableRecords("resourceBookings", [f.clashFlagged]),
  ]);
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const updates = records.flatMap((record) => {
    const booking = bookingsById.get(record.id);
    if (!booking) return [];
    const storedFlag = get(record, f.clashFlagged) === true;
    const storedNote = str(get(record, f.clashNote));
    if (storedFlag === booking.clashFlagged && storedNote === booking.clashNote) return [];
    return [{ id: record.id, fields: { [f.clashFlagged]: booking.clashFlagged, [f.clashNote]: booking.clashNote } }];
  });
  if (updates.length) await updateAirtableRecords("resourceBookings", updates);
}

export async function getMyBookingRows(account: DemoAccount) {
  return (await getBookingRows()).filter((row) => row.personId === account.personId);
}

export async function getTeamBookingRows(account: DemoAccount) {
  if (account.assignedRoles.includes("admin")) return getBookingRows();
  const people = await getPeople();
  const reportIds = people.filter((person) => person.managerIds.includes(account.personId)).map((person) => person.id);
  const visibleIds = new Set([account.personId, ...reportIds]);
  return (await getBookingRows()).filter((row) => visibleIds.has(row.personId));
}

export async function getTeamRosterRows(account: DemoAccount): Promise<TeamRosterRow[]> {
  const [people, bookings] = await Promise.all([getPeople(), getBookingRows()]);
  const visiblePeople = account.assignedRoles.includes("admin")
    ? people.filter((person) => person.status !== "Left organisation")
    : people.filter((person) => person.status !== "Left organisation" && (person.id === account.personId || person.managerIds.includes(account.personId)));
  return visiblePeople.map((person) => {
    const personBookings = bookings.filter((booking) => booking.personId === person.id && !isDeclinedBooking(booking));
    const flaggedProjects = Array.from(new Map(personBookings.filter((booking) => booking.clashFlagged).map((booking) => [booking.projectId, booking.projectName])).values());
    return { personId: person.id, name: person.name, team: person.team, bookingCount: personBookings.length, flaggedProjects, hasCapacityAlert: flaggedProjects.length > 0 };
  }).sort((a, b) => Number(b.hasCapacityAlert) - Number(a.hasCapacityAlert) || a.name.localeCompare(b.name));
}

export async function getTeamMemberBookingRows(account: DemoAccount, personId: string) {
  const [people, bookings] = await Promise.all([getPeople(), getBookingRows()]);
  const person = people.find((item) => item.id === personId);
  const canSee = account.assignedRoles.includes("admin") || personId === account.personId || Boolean(person?.managerIds.includes(account.personId));
  if (!person || !canSee) return null;
  return { person, bookings: bookings.filter((booking) => booking.personId === personId) };
}

export async function getProjectBookingRows(account: DemoAccount) {
  const [projects, rows, milestoneRows] = await Promise.all([
    getProjects(), getBookingRows(),
    listAirtableRecords("projectMilestones", [airtable.fields.projectMilestones.name, airtable.fields.projectMilestones.project, airtable.fields.projectMilestones.status, airtable.fields.projectMilestones.hoursPerWeekRequired]),
  ]);
  const milestones = milestoneRows.map((row) => ({ id: row.id, name: str(get(row, airtable.fields.projectMilestones.name)), projectId: links(get(row, airtable.fields.projectMilestones.project))[0] ?? "", status: selected(get(row, airtable.fields.projectMilestones.status)), hoursPerWeekRequired: num(get(row, airtable.fields.projectMilestones.hoursPerWeekRequired)) }));
  if (account.assignedRoles.includes("admin")) return { projects, bookings: rows, milestones };
  const ownedProjects = projects.filter((project) => project.leadIds.includes(account.personId));
  const projectIds = new Set(ownedProjects.map((project) => project.id));
  return { projects: ownedProjects, bookings: rows.filter((row) => projectIds.has(row.projectId)), milestones: milestones.filter((milestone) => projectIds.has(milestone.projectId)) };
}

export async function getProjectsForRequest() {
  return getProjects();
}

function isDeclinedBooking(row: BookingRow) {
  return row.requestStatus === "Declined by lead" || row.personConfirmationStatus === "Declined";
}

function milestoneStatus(allocated: number, required: number) {
  if (allocated >= required) return "Resourced";
  return allocated > 0 ? "Partially resourced" : "Resourcing";
}

export async function createProjectMilestone(input: {
  account: DemoAccount; projectId: string; name: string; plannedStartDate: string; plannedEndDate: string;
  hoursPerWeekRequired: number; teamRequested: string; description: string;
}) {
  const [projects, people] = await Promise.all([getProjects(), getPeople()]);
  const project = projects.find((item) => item.id === input.projectId);
  if (!project || (!input.account.assignedRoles.includes("admin") && !project.leadIds.includes(input.account.personId))) throw new Error("You can only add milestones to a project you lead.");
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Enter a milestone name up to 120 characters.");
  if (!isIsoDate(input.plannedStartDate) || !isIsoDate(input.plannedEndDate) || input.plannedEndDate < input.plannedStartDate) throw new Error("Enter valid planned dates; the end date must be on or after the start date.");
  if (!Number.isFinite(input.hoursPerWeekRequired) || input.hoursPerWeekRequired <= 0 || input.hoursPerWeekRequired > 168) throw new Error("Weekly hours must be greater than zero and no more than 168.");
  const availableTeams = new Set(people.flatMap((person) => person.team.split(",").map((team) => team.trim())).filter(Boolean));
  if (!availableTeams.has(input.teamRequested)) throw new Error("Choose a team from the current People records.");
  const f = airtable.fields.projectMilestones;
  const records = await createAirtableRecords("projectMilestones", [{ fields: {
    [f.name]: input.name.trim(), [f.project]: [project.id], [f.plannedStartDate]: input.plannedStartDate,
    [f.plannedEndDate]: input.plannedEndDate, [f.expectedStartDate]: input.plannedStartDate,
    [f.expectedEndDate]: input.plannedEndDate, [f.hoursPerWeekRequired]: input.hoursPerWeekRequired,
    [f.teamRequested]: input.teamRequested, [f.status]: "Resourcing", [f.description]: input.description.trim(),
  } }]);
  return records[0]?.id;
}

export async function getMilestoneTeamChoices() {
  const people = await getPeople();
  return Array.from(new Set(people.filter((person) => person.status === "Active").flatMap((person) => person.team.split(",").map((team) => team.trim())).filter(Boolean))).sort();
}

export async function getProjectMilestoneRows(account: DemoAccount, projectId: string): Promise<MilestoneRow[] | null> {
  const [projects, records, bookings, people, leaves, holidays] = await Promise.all([
    getProjects(),
    listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones)),
    getBookingRows(),
    getPeople(),
    listAirtableRecords("plannedLeave", [airtable.fields.plannedLeave.person, airtable.fields.plannedLeave.status, airtable.fields.plannedLeave.startDate, airtable.fields.plannedLeave.endDate, airtable.fields.plannedLeave.leaveDays]),
    listAirtableRecords("publicHolidays", [airtable.fields.publicHolidays.date, airtable.fields.publicHolidays.region]),
  ]);
  const project = projects.find((item) => item.id === projectId);
  if (!project || (!account.assignedRoles.includes("admin") && !project.leadIds.includes(account.personId))) return null;
  const f = airtable.fields.projectMilestones;
  const activeBookings = bookings.filter((row) => !isDeclinedBooking(row));
  return records.filter((record) => links(get(record, f.project)).includes(projectId)).map((record) => {
    const milestoneBookings = bookings.filter((row) => row.milestoneId === record.id);
    const allocatedHoursPerWeek = activeBookings.filter((row) => row.milestoneId === record.id).reduce((sum, row) => sum + row.hoursPerWeek, 0);
    const remainingHoursPerWeek = Math.max(0, num(get(record, f.hoursPerWeekRequired)) - allocatedHoursPerWeek);
    const plannedStartDate = str(get(record, f.plannedStartDate)), plannedEndDate = str(get(record, f.plannedEndDate));
    const weeks = bookingWeeks(plannedStartDate, plannedEndDate);
    const teamRequested = selected(get(record, f.teamRequested));
    const candidates = people.filter((person) => person.status === "Active" && person.team.split(",").map((team) => team.trim()).includes(teamRequested)).map((person) => {
      const availableByWeek = weeks.map((weekStart) => {
        const capacity = weekCapacity(person, weekStart, leaves, holidays).capacity;
        const booked = activeBookings.filter((row) => row.personId === person.id && bookingWeeks(row.startDate, row.endDate).includes(weekStart)).reduce((sum, row) => sum + row.hoursPerWeek, 0);
        return Math.max(0, capacity - booked);
      });
      return { personId: person.id, name: person.name, availableHoursPerWeek: availableByWeek.length ? Math.min(...availableByWeek) : 0 };
    }).filter((person) => person.availableHoursPerWeek > 0).sort((a, b) => b.availableHoursPerWeek - a.availableHoursPerWeek || a.name.localeCompare(b.name));
    return {
      id: record.id, name: str(get(record, f.name)), projectId,
      plannedStartDate, plannedEndDate, expectedStartDate: str(get(record, f.expectedStartDate)), expectedEndDate: str(get(record, f.expectedEndDate)),
      hoursPerWeekRequired: num(get(record, f.hoursPerWeekRequired)), teamRequested,
      status: selected(get(record, f.status)), description: str(get(record, f.description)),
      firstBookingDate: str(get(record, f.firstBookingDate)), allocatedHoursPerWeek, remainingHoursPerWeek,
      candidates, noAvailablePeople: candidates.length === 0, bookings: milestoneBookings,
    };
  }).sort((a, b) => a.plannedStartDate.localeCompare(b.plannedStartDate) || a.name.localeCompare(b.name));
}

export async function updateMilestoneDates(account: DemoAccount, milestoneId: string, input: { plannedStartDate?: string; plannedEndDate?: string; expectedStartDate?: string; expectedEndDate?: string }) {
  const milestones = await listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones));
  const milestone = milestones.find((record) => record.id === milestoneId);
  if (!milestone) throw new Error("This milestone could not be found.");
  const f = airtable.fields.projectMilestones;
  const projectId = links(get(milestone, f.project))[0] ?? "";
  const project = (await getProjects()).find((item) => item.id === projectId);
  if (!project || (!account.assignedRoles.includes("admin") && !project.leadIds.includes(account.personId))) throw new Error("You can only change milestones on a project you lead.");
  const firstBookingDate = str(get(milestone, f.firstBookingDate));
  if (firstBookingDate) {
    if (!isIsoDate(input.expectedStartDate ?? "") || !isIsoDate(input.expectedEndDate ?? "") || input.expectedEndDate! < input.expectedStartDate!) throw new Error("After a booking, update the expected dates; expected end must be on or after expected start.");
    await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: { [f.expectedStartDate]: input.expectedStartDate, [f.expectedEndDate]: input.expectedEndDate } }]);
    return;
  }
  if (!isIsoDate(input.plannedStartDate ?? "") || !isIsoDate(input.plannedEndDate ?? "") || input.plannedEndDate! < input.plannedStartDate!) throw new Error("Enter valid planned dates; end must be on or after start.");
  await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: {
    [f.plannedStartDate]: input.plannedStartDate, [f.plannedEndDate]: input.plannedEndDate,
    [f.expectedStartDate]: input.plannedStartDate, [f.expectedEndDate]: input.plannedEndDate,
  } }]);
  const bookingFields = airtable.fields.resourceBookings;
  const pendingBookings = await listAirtableRecords("resourceBookings", [bookingFields.milestone, bookingFields.personConfirmationStatus]);
  const pendingUpdates = pendingBookings.filter((booking) => links(get(booking, bookingFields.milestone)).includes(milestoneId) && selected(get(booking, bookingFields.personConfirmationStatus)) === "Awaiting response").map((booking) => ({
    id: booking.id, fields: { [bookingFields.startDate]: input.plannedStartDate, [bookingFields.endDate]: input.plannedEndDate },
  }));
  await updateAirtableRecords("resourceBookings", pendingUpdates);
  await syncBookingClashFlags();
}

export async function updateProjectMilestone(account: DemoAccount, milestoneId: string, input: { name: string; teamRequested: string; hoursPerWeekRequired: number; description: string }) {
  const [milestones, people] = await Promise.all([
    listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones)), getPeople(),
  ]);
  const milestone = milestones.find((record) => record.id === milestoneId);
  if (!milestone) throw new Error("This milestone could not be found.");
  const mf = airtable.fields.projectMilestones;
  const projectId = links(get(milestone, mf.project))[0] ?? "";
  const project = (await getProjects()).find((item) => item.id === projectId);
  if (!project || (!account.assignedRoles.includes("admin") && !project.leadIds.includes(account.personId))) throw new Error("You can only edit milestones on a project you lead.");
  if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Enter a milestone name up to 120 characters.");
  if (!Number.isFinite(input.hoursPerWeekRequired) || input.hoursPerWeekRequired <= 0 || input.hoursPerWeekRequired > 168) throw new Error("Weekly hours must be greater than zero and no more than 168.");
  const availableTeams = new Set(people.flatMap((person) => person.team.split(",").map((team) => team.trim())).filter(Boolean));
  if (!availableTeams.has(input.teamRequested)) throw new Error("Choose a team from the current People records.");
  const [bookings] = await Promise.all([getBookingRows()]);
  const allocated = bookings.filter((row) => row.milestoneId === milestoneId && !isDeclinedBooking(row)).reduce((sum, row) => sum + row.hoursPerWeek, 0);
  await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: {
    [mf.name]: input.name.trim(), [mf.teamRequested]: input.teamRequested,
    [mf.hoursPerWeekRequired]: input.hoursPerWeekRequired, [mf.description]: input.description.trim(),
    [mf.status]: milestoneStatus(allocated, input.hoursPerWeekRequired),
  } }]);
}

export async function createMilestoneBooking(account: DemoAccount, milestoneId: string, personId: string, hoursPerWeek: number) {
  const milestones = await listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones));
  const milestone = milestones.find((record) => record.id === milestoneId);
  if (!milestone) throw new Error("This milestone could not be found.");
  const projectId = links(get(milestone, airtable.fields.projectMilestones.project))[0] ?? "";
  const [projects, people, milestonesForProject] = await Promise.all([getProjects(), getPeople(), getProjectMilestoneRows(account, projectId)]);
  const project = projects.find((item) => item.id === projectId);
  if (!project || (!account.assignedRoles.includes("admin") && !project.leadIds.includes(account.personId))) throw new Error("You can only book resources on a project you lead.");
  const selectedMilestone = milestonesForProject?.find((item) => item.id === milestoneId);
  if (!selectedMilestone) throw new Error("This milestone is outside your project scope.");
  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek <= 0 || hoursPerWeek > selectedMilestone.remainingHoursPerWeek) throw new Error("Choose weekly hours up to the milestone's remaining need.");
  const candidate = selectedMilestone.candidates.find((person) => person.personId === personId);
  if (!candidate || hoursPerWeek > candidate.availableHoursPerWeek) throw new Error("That person no longer has enough available capacity for this booking.");
  const person = people.find((item) => item.id === personId);
  if (!person) throw new Error("Choose a valid person.");
  const f = airtable.fields.resourceBookings, mf = airtable.fields.projectMilestones;
  const created = await createAirtableRecords("resourceBookings", [{ fields: {
    [f.label]: selectedMilestone.name, [f.person]: [personId], [f.project]: [projectId], [f.milestone]: [milestoneId],
    [f.requestedBy]: [account.personId], [f.source]: "Lead claimed", [f.startDate]: selectedMilestone.plannedStartDate,
    [f.endDate]: selectedMilestone.plannedEndDate, [f.hoursPerWeek]: hoursPerWeek,
    [f.personConfirmationStatus]: "Awaiting response", [f.clashFlagged]: false,
  } }]);
  const allocated = selectedMilestone.allocatedHoursPerWeek + hoursPerWeek;
  await updateAirtableRecords("projectMilestones", [{ id: milestoneId, fields: {
    [mf.status]: milestoneStatus(allocated, selectedMilestone.hoursPerWeekRequired),
  } }]);
  await syncBookingClashFlags();
  return { bookingRecordId: created[0]?.id, personName: person.name };
}

export async function respondToMilestoneBooking(account: DemoAccount, bookingRecordId: string, confirm: boolean) {
  const rows = await getBookingRows();
  const booking = rows.find((row) => row.id === bookingRecordId);
  if (!booking || booking.personId !== account.personId || booking.personConfirmationStatus !== "Awaiting response") throw new Error("This booking is no longer waiting for your response.");
  const f = airtable.fields.resourceBookings;
  await updateAirtableRecords("resourceBookings", [{ id: bookingRecordId, fields: {
    [f.personConfirmationStatus]: confirm ? "Confirmed" : "Declined",
    ...(confirm ? { [f.confirmedOn]: iso(new Date()) } : {}),
  } }]);
  if (booking.milestoneId) {
    const milestones = await listAirtableRecords("projectMilestones", Object.values(airtable.fields.projectMilestones));
    const milestone = milestones.find((record) => record.id === booking.milestoneId);
    if (milestone) {
    const active = (await getBookingRows()).filter((row) => row.milestoneId === booking.milestoneId && !isDeclinedBooking(row));
      const allocated = active.reduce((sum, row) => sum + row.hoursPerWeek, 0);
      const mf = airtable.fields.projectMilestones;
      await updateAirtableRecords("projectMilestones", [{ id: booking.milestoneId, fields: {
        [mf.status]: milestoneStatus(allocated, num(get(milestone, mf.hoursPerWeekRequired))),
        ...(confirm && !str(get(milestone, mf.firstBookingDate)) ? { [mf.firstBookingDate]: iso(new Date()) } : {}),
      } }]);
    }
  }
  await syncBookingClashFlags();
}

export async function createBookingRequest(input: { account: DemoAccount; projectId: string; startDate: string; endDate: string; hoursPerWeek: number; note: string }) {
  const projects = await getProjects();
  const project = projects.find((item) => item.id === input.projectId && item.leadIds.length > 0);
  if (!project) throw new Error("Choose a project that has a Project Lead.");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid start and end dates.");
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0 || input.hoursPerWeek > 168) throw new Error("Hours per week must be greater than 0 and no more than 168.");
  if (input.note.length > 500) throw new Error("Notes must be 500 characters or fewer.");
  const f = airtable.fields.resourceBookings;
  const created = await createAirtableRecords("resourceBookings", [{ fields: {
    [f.label]: `${project.name} (offline request)`, [f.person]: [input.account.personId], [f.project]: [project.id],
    [f.requestedBy]: [input.account.personId], [f.requestStatus]: "Requested by person", [f.requestNote]: input.note.trim(),
    [f.personConfirmationStatus]: "Not required",
    [f.startDate]: input.startDate, [f.endDate]: input.endDate, [f.hoursPerWeek]: input.hoursPerWeek,
    [f.clashFlagged]: false,
  } }]);
  await syncBookingClashFlags();
  return { bookingRecordId: created[0]?.id, leadNames: (await getPeople()).filter((item) => project.leadIds.includes(item.id)).map((item) => item.name) };
}

export async function decideBookingRequest(account: DemoAccount, bookingRecordId: string, approve: boolean) {
  const [rows, projects] = await Promise.all([getBookingRows(), getProjects()]);
  const booking = rows.find((row) => row.id === bookingRecordId);
  if (!booking || booking.requestStatus !== "Requested by person") throw new Error("This request is no longer waiting for a decision.");
  const project = projects.find((item) => item.id === booking.projectId && (account.assignedRoles.includes("admin") || item.leadIds.includes(account.personId)));
  if (!project) throw new Error("You can only decide requests for projects you lead.");
  const statusField = airtable.fields.resourceBookings.requestStatus;
  await updateAirtableRecords("resourceBookings", [{ id: booking.id, fields: { [statusField]: approve ? "Approved by lead" : "Declined by lead" } }]);
  await syncBookingClashFlags();
}

function quarterBounds(quarter: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) throw new Error("Choose a quarter such as 2026-Q4.");
  const year = Number(match[1]), q = Number(match[2]);
  return { start: new Date(Date.UTC(year, (q - 1) * 3, 1)), end: new Date(Date.UTC(year, q * 3, 0)) };
}
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function isIsoDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && iso(date) === value; }
function nextDay(date: Date) { return new Date(date.getTime() + 86400000); }
function monday(date: Date) { const result = new Date(date); result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7)); return result; }
function weekday(date: Date) { return date.getUTCDay() > 0 && date.getUTCDay() < 6; }

export async function getQuarterlyUtilisation(quarter: string) {
  const { start, end } = quarterBounds(quarter);
  const f = airtable.fields;
  const [people, bookings, leaves, holidays, settings] = await Promise.all([
    getPeople(), getBookingRows(),
    listAirtableRecords("plannedLeave", [f.plannedLeave.person, f.plannedLeave.status, f.plannedLeave.startDate, f.plannedLeave.endDate, f.plannedLeave.leaveDays]),
    listAirtableRecords("publicHolidays", [f.publicHolidays.date, f.publicHolidays.hoursLost, f.publicHolidays.region]),
    listAirtableRecords("settings", [f.settings.settingName, f.settings.amberPercent, f.settings.redPercent]),
  ]);
  const applicationSettings = settings.find((row) => get(row, f.settings.settingName) === "Application Settings");
  const amber = num(applicationSettings && get(applicationSettings, f.settings.amberPercent)) || 0.9;
  const red = num(applicationSettings && get(applicationSettings, f.settings.redPercent)) || 1.1;
  const weeks: Date[] = [];
  for (let date = new Date(start); date <= end; date = nextDay(date)) if (date.getUTCDay() === 1) weeks.push(new Date(date));
  const weekRecords: Array<{ key: string; personId: string; week: string; contracted: number; leave: number; holiday: number; capacity: number; booked: number; ratio: number; status: "Green" | "Amber" | "Red" }> = [];
  const summaries = people.filter((person) => person.status !== "Left organisation").map((person) => {
    let quarterCapacity = 0, quarterBooked = 0, peak = 0;
    for (const week of weeks) {
      const weekEnd = new Date(week); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const booked = bookings.filter((row) => row.personId === person.id && !isDeclinedBooking(row) && row.startDate <= iso(weekEnd) && row.endDate >= iso(week)).reduce((sum, row) => sum + row.hoursPerWeek, 0);
      const { capacity, leaveHours, holidayHours } = weekCapacity(person, iso(week), leaves, holidays);
      quarterCapacity += capacity; quarterBooked += booked;
      const ratio = capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0;
      if (ratio > peak) peak = ratio;
      weekRecords.push({
        key: `${person.id}-${iso(week)}`, personId: person.id, week: iso(week), contracted: person.contractedHours,
        leave: leaveHours, holiday: holidayHours, capacity, booked, ratio,
        status: ratio > red ? "Red" : ratio >= amber ? "Amber" : "Green",
      });
    }
    const status = peak > red ? "Red" : peak >= amber ? "Amber" : "Green";
    return { personId: person.id, name: person.name, team: person.team, quarterBooked, quarterCapacity, utilisation: quarterCapacity ? quarterBooked / quarterCapacity : 0, peak, status };
  }).sort((a, b) => b.peak - a.peak || a.name.localeCompare(b.name));
  const teamsByName = new Map<string, { name: string; quarterBooked: number; quarterCapacity: number; peak: number; peopleCount: number; reviewPeopleCount: number }>();
  for (const person of summaries) {
    const teamName = person.team.split(",")[0]?.trim() || "Unassigned";
    const team = teamsByName.get(teamName) ?? { name: teamName, quarterBooked: 0, quarterCapacity: 0, peak: 0, peopleCount: 0, reviewPeopleCount: 0 };
    team.quarterBooked += person.quarterBooked;
    team.quarterCapacity += person.quarterCapacity;
    team.peak = Math.max(team.peak, person.peak);
    team.peopleCount++;
    if (person.status === "Red") team.reviewPeopleCount++;
    teamsByName.set(teamName, team);
  }
  const teamSummaries = Array.from(teamsByName.values()).map((team) => ({
    ...team,
    utilisation: team.quarterCapacity ? team.quarterBooked / team.quarterCapacity : 0,
    status: team.peak > red ? "Red" as const : team.peak >= amber ? "Amber" as const : "Green" as const,
  })).sort((a, b) => b.utilisation - a.utilisation || a.name.localeCompare(b.name));
  await writePersonWeeks(quarter, weekRecords);
  return { quarter, summaries, teams: teamSummaries, thresholds: { amber, red }, totals: { booked: summaries.reduce((sum, item) => sum + item.quarterBooked, 0), capacity: summaries.reduce((sum, item) => sum + item.quarterCapacity, 0) } };
}

export async function getTeamQuarterlyUtilisation(quarter: string, teamName: string) {
  const report = await getQuarterlyUtilisation(quarter);
  return { ...report, summaries: report.summaries.filter((row) => (row.team.split(",")[0]?.trim() || "Unassigned") === teamName) };
}

async function writePersonWeeks(quarter: string, weeks: Array<{ key: string; personId: string; week: string; contracted: number; leave: number; holiday: number; capacity: number; booked: number; ratio: number; status: "Green" | "Amber" | "Red" }>) {
  if (!weeks.length) return;
  const f = airtable.fields.personWeeks;
  const fields = Object.values(f);
  const current = await listAirtableRecords("personWeeks", fields);
  const existingByKey = new Map(current.map((record) => [str(get(record, f.key)), record]));
  const now = new Date().toISOString();
  const creates: Array<{ fields: Record<string, unknown> }> = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  for (const week of weeks) {
    const values: Record<string, unknown> = {
      [f.key]: week.key, [f.person]: [week.personId], [f.weekStartingMonday]: week.week, [f.reportingQuarter]: quarter,
      [f.contractedHours]: week.contracted, [f.plannedLeaveHours]: week.leave, [f.publicHolidayHours]: week.holiday,
      [f.capacityHours]: week.capacity, [f.bookedHours]: week.booked, [f.loadPercent]: week.ratio, [f.loadStatus]: week.status,
    };
    const existing = existingByKey.get(week.key);
    if (!existing) {
      creates.push({ fields: { ...values, [f.calculatedAtUtc]: now } });
      continue;
    }
    const changes = Object.fromEntries(Object.entries(values).filter(([id, value]) => JSON.stringify(get(existing, id) ?? null) !== JSON.stringify(value ?? null)));
    if (Object.keys(changes).length) updates.push({ id: existing.id, fields: { ...changes, [f.calculatedAtUtc]: now } });
  }
  await createAirtableRecords("personWeeks", creates);
  await updateAirtableRecords("personWeeks", updates);
}
