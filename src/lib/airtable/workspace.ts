import "server-only";

import { airtable } from "@/config/airtable";
import { listAirtableRecords, updateAirtableRecords, createAirtableRecords, type AirtableRecord } from "@/lib/airtable/records";
import type { DemoAccount } from "@/lib/demo/accounts";

type Project = { id: string; name: string; leadIds: string[] };
type Person = { id: string; name: string; firstName: string; team: string; managerIds: string[]; status: string; contractedHours: number; workdays: number; region: string };
export type BookingRow = {
  id: string; bookingId: string; label: string; personId: string; personName: string; projectId: string; projectName: string;
  startDate: string; endDate: string; hoursPerWeek: number; confirmedOn: string; clashFlagged: boolean; clashNote: string;
  clashWeeks: Array<{ weekStart: string; weekLabel: string; bookedHours: number; contractedHours: number }>;
  requestStatus: string; requestNote: string; leadName: string;
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

function withWeeklyClashes(rows: BookingRow[], people: Person[]) {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.requestStatus === "Declined by lead") continue;
    for (const weekStart of bookingWeeks(row.startDate, row.endDate)) {
      const key = `${row.personId}|${weekStart}`;
      totals.set(key, (totals.get(key) ?? 0) + row.hoursPerWeek);
    }
  }
  return rows.map((row) => {
    const person = peopleById.get(row.personId);
    const clashWeeks = row.requestStatus === "Declined by lead" || !person ? [] : bookingWeeks(row.startDate, row.endDate).flatMap((weekStart) => {
      const bookedHours = totals.get(`${row.personId}|${weekStart}`) ?? 0;
      if (bookedHours <= person.contractedHours) return [];
      const weekLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${weekStart}T00:00:00Z`));
      return [{ weekStart, weekLabel, bookedHours, contractedHours: person.contractedHours }];
    });
    const clashFlagged = clashWeeks.length > 0;
    const clashNote = clashWeeks.map((week) => `Week starting ${week.weekLabel}: ${week.bookedHours} hours booked against ${week.contractedHours} contracted hours.`).join(" ");
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
  const [rows, people, projects] = await Promise.all([
    listAirtableRecords("resourceBookings", Object.values(f.resourceBookings)), getPeople(), getProjects(),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const bookings = rows.map((record) => {
    const personId = links(get(record, f.resourceBookings.person))[0] ?? "";
    const projectId = links(get(record, f.resourceBookings.project))[0] ?? "";
    const project = projectsById.get(projectId);
    return {
      id: record.id, bookingId: str(get(record, f.resourceBookings.bookingId)), label: str(get(record, f.resourceBookings.label)),
      personId, personName: peopleById.get(personId)?.name ?? "Unknown person", projectId,
      projectName: project?.name ?? "Unknown project", startDate: str(get(record, f.resourceBookings.startDate)),
      endDate: str(get(record, f.resourceBookings.endDate)), hoursPerWeek: num(get(record, f.resourceBookings.hoursPerWeek)),
      confirmedOn: str(get(record, f.resourceBookings.confirmedOn)), clashFlagged: false,
      clashNote: "", clashWeeks: [], requestStatus: selected(get(record, f.resourceBookings.requestStatus)),
      requestNote: str(get(record, f.resourceBookings.requestNote)), leadName: project?.leadIds.map((id) => peopleById.get(id)?.name).filter(Boolean).join(", ") ?? "",
    };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.projectName.localeCompare(b.projectName));
  return withWeeklyClashes(bookings, people);
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

export async function getProjectBookingRows(account: DemoAccount) {
  const [projects, rows] = await Promise.all([getProjects(), getBookingRows()]);
  if (account.assignedRoles.includes("admin")) return { projects, bookings: rows };
  const ownedProjects = projects.filter((project) => project.leadIds.includes(account.personId));
  const projectIds = new Set(ownedProjects.map((project) => project.id));
  return { projects: ownedProjects, bookings: rows.filter((row) => projectIds.has(row.projectId)) };
}

export async function getProjectsForRequest() {
  return getProjects();
}

export async function createBookingRequest(input: { account: DemoAccount; projectId: string; startDate: string; endDate: string; hoursPerWeek: number; note: string }) {
  const projects = await getProjects();
  const project = projects.find((item) => item.id === input.projectId && item.leadIds.length > 0);
  if (!project) throw new Error("Choose a project that has a Project Lead.");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate) || input.endDate < input.startDate) throw new Error("Enter valid start and end dates.");
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0 || input.hoursPerWeek > 168) throw new Error("Hours per week must be greater than 0 and no more than 168.");
  if (input.note.length > 500) throw new Error("Notes must be 500 characters or fewer.");
  const f = airtable.fields.resourceBookings;
  const existing = await getBookingRows();
  const person = (await getPeople()).find((item) => item.id === input.account.personId);
  const proposed: BookingRow = {
    id: "proposed", bookingId: "", label: "", personId: input.account.personId, personName: person?.name ?? "", projectId: project.id, projectName: project.name,
    startDate: input.startDate, endDate: input.endDate, hoursPerWeek: input.hoursPerWeek, confirmedOn: "", clashFlagged: false, clashNote: "", clashWeeks: [],
    requestStatus: "Requested by person", requestNote: input.note, leadName: "",
  };
  const proposedWithClash = person ? withWeeklyClashes([...existing, proposed], [person]).at(-1) : undefined;
  const isClash = proposedWithClash?.clashFlagged ?? false;
  const created = await createAirtableRecords("resourceBookings", [{ fields: {
    [f.label]: `${project.name} (offline request)`, [f.person]: [input.account.personId], [f.project]: [project.id],
    [f.requestedBy]: [input.account.personId], [f.requestStatus]: "Requested by person", [f.requestNote]: input.note.trim(),
    [f.startDate]: input.startDate, [f.endDate]: input.endDate, [f.hoursPerWeek]: input.hoursPerWeek,
    [f.clashFlagged]: isClash, ...(isClash ? { [f.clashNote]: proposedWithClash?.clashNote } : {}),
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
      const booked = bookings.filter((row) => row.personId === person.id && row.requestStatus !== "Declined by lead" && row.startDate <= iso(weekEnd) && row.endDate >= iso(week)).reduce((sum, row) => sum + row.hoursPerWeek, 0);
      const personHolidayDates = new Set(holidays.filter((row) => selected(get(row, f.publicHolidays.region)) === person.region && str(get(row, f.publicHolidays.date)) >= iso(week) && str(get(row, f.publicHolidays.date)) <= iso(weekEnd)).map((row) => str(get(row, f.publicHolidays.date))));
      const leaveHours = leaves.filter((row) => links(get(row, f.plannedLeave.person)).includes(person.id) && selected(get(row, f.plannedLeave.status)) === "Approved")
        .reduce((sum, row) => {
          const leaveStart = new Date(`${str(get(row, f.plannedLeave.startDate))}T00:00:00Z`);
          const leaveEnd = new Date(`${str(get(row, f.plannedLeave.endDate))}T00:00:00Z`);
          if (Number.isNaN(leaveStart.valueOf()) || Number.isNaN(leaveEnd.valueOf()) || leaveStart > weekEnd || leaveEnd < week) return sum;
          let weekdaysInOverlap = 0, weekdaysInLeave = 0;
          for (let day = new Date(leaveStart); day <= leaveEnd; day = nextDay(day)) if (weekday(day) && !personHolidayDates.has(iso(day))) {
            weekdaysInLeave++;
            if (day >= week && day <= weekEnd) weekdaysInOverlap++;
          }
          const totalLeaveDays = num(get(row, f.plannedLeave.leaveDays));
          const proportionalDays = weekdaysInLeave ? totalLeaveDays * weekdaysInOverlap / weekdaysInLeave : 0;
          return sum + proportionalDays * person.contractedHours / person.workdays;
        }, 0);
      const dailyHours = person.workdays ? person.contractedHours / person.workdays : 0;
      const holidayHours = personHolidayDates.size * dailyHours;
      const weekdaysThisWeek = Array.from({ length: 5 }, (_, index) => { const day = new Date(week); day.setUTCDate(day.getUTCDate() + index); return iso(day); });
      const maxLeaveHoursAfterHolidays = Math.max(0, Math.min(person.workdays, weekdaysThisWeek.length - personHolidayDates.size) * dailyHours);
      const capacity = Math.max(0, person.contractedHours - holidayHours - Math.min(leaveHours, maxLeaveHoursAfterHolidays));
      quarterCapacity += capacity; quarterBooked += booked;
      const ratio = capacity > 0 ? booked / capacity : booked > 0 ? 2 : 0;
      if (ratio > peak) peak = ratio;
      weekRecords.push({
        key: `${person.id}-${iso(week)}`, personId: person.id, week: iso(week), contracted: person.contractedHours,
        leave: Math.min(leaveHours, maxLeaveHoursAfterHolidays), holiday: holidayHours, capacity, booked, ratio,
        status: ratio > red ? "Red" : ratio >= amber ? "Amber" : "Green",
      });
    }
    const status = peak > red ? "Red" : peak >= amber ? "Amber" : "Green";
    return { personId: person.id, name: person.name, team: person.team, quarterBooked, quarterCapacity, utilisation: quarterCapacity ? quarterBooked / quarterCapacity : 0, peak, status };
  }).sort((a, b) => b.peak - a.peak || a.name.localeCompare(b.name));
  await writePersonWeeks(quarter, weekRecords);
  return { quarter, summaries, totals: { booked: summaries.reduce((sum, item) => sum + item.quarterBooked, 0), capacity: summaries.reduce((sum, item) => sum + item.quarterCapacity, 0) } };
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
