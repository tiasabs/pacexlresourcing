# Resourcing Radar

A local resourcing app for a fictional charity PMO. The demo provides six persona shortcuts, a role-aware workspace, an end-to-end bid/project resourcing flow, weekly actual-hours logging, and an HR workspace for People and Planned Leave snapshots.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Choose a persona to enter the demo. There is no login step. The picker is a demonstration shortcut; future sign-in is planned through a single sign-on provider.

## Airtable setup

The base and table/field IDs are in `src/config/airtable.ts`. Store the Airtable personal access token in `.env.local` as `AIRTABLE_PERSONAL_ACCESS_TOKEN`. Do not expose it through a `NEXT_PUBLIC_` variable or commit it. `.env.example` lists the expected local variables.

The base contains People, Projects and Bids, Project Milestones, Resource Bookings, Booking Terms, Booking Allocations, Weekly Actuals, Planned Leave, Public Holidays, Settings, App Accounts, Person Weeks, and Import Log. App code uses table and field IDs from `src/config/airtable.ts`. A typed `Application Settings` row holds load thresholds and HR refresh settings.

The six enabled demo personas are records in App Accounts linked to People. Admin, HR, C-Suite, Line Manager, and Project Lead are assigned roles; Individual is implicit. Admin manages accounts and role assignments. Each request reloads account and role data from Airtable, so changes to App Roles take effect on the next page request.

## Booking views

- `/projects` lets Project Leads create Projects and lightweight Bids, add and edit milestones, view availability, book people, and manage requests for their projects. A Bid can be marked Go and converted into a Project. Internal Bid Due Date is kept separate from the external submission deadline.
- `/bookings` shows the signed-in demo person's bookings read-only and lets them request a booking for a selected project, dates, and hours. Requests do not reserve capacity; the lead chooses the final dates, team, hours, and milestone allocation when turning one into a booking. In-app notices are derived from saved booking records; no email or notification table is used.
- `/actuals` lets a person enter weekly actual hours for booked milestones, with project and week totals. Blank entries remain unlogged; zero is a logged zero. Entries can be added retroactively, while saved entries can only be edited through the Sunday after their work week.
- `/team` shows the signed-in person's own bookings and direct reports' bookings.
- `/leadership` shows quarterly booked hours divided by capacity, peak weekly load/status, and expected-versus-actual summaries by team. Weeks belong to the quarter containing Monday. Forward views are based on current bookings, including regular demo records through 2027 Q4. C-Suite can see named load; booking details are available to Admin.

The demo uses fictional people, projects, milestones, bookings, and future booking records. Milestone planned dates lock on the first saved booking, while expected dates remain editable. Booking and allocation changes are effective-dated so past weekly expectations remain available for comparison. AI document extraction and milestone drafting remain deferred until the manual flow is established.

## HR snapshot workflow

HR and Admin can open `/hr` to review existing People and Planned Leave records, download CSV templates, preview full snapshots, and commit changes. For the demo, standardize HR exports to the two provided CSV templates. The uploader also recognizes common header variations and ignores extra columns. For a real charity, configure the export once to match the HR system it uses. Use `DD-MM-YYYY` dates, stable Employee IDs and Leave IDs, and decimal Leave Days such as `0.5`. Export Excel workbooks as CSV before uploading.

Imports add new records and update changed records only. Blank or absent columns leave existing values unchanged. Unrecognized team, region, or employment-status values are left unchanged for existing people and shown as notes; new people still need valid name, team, region, and contracted hours. Blank working days default to five and blank status defaults to Active for new people, both shown as preview notes. New leave rows need an Employee ID, dates, days, type, and status. Missing people are marked `Left organisation`; missing leave is marked `Cancelled`, or `Taken` when its end date is in the past. Records are never deleted. A missing-people rate at or above the configured threshold displays a warning and still permits commit. File contents are held in memory only for the preview and are not retained. Import Log records the file name, actor label, counts, status, and timestamps.

Only leave with approval `Status` of `Approved` is capacity relevant. `Leave Hours` looks up the linked person's `Daily Hours` (contracted hours divided evenly by working days) and multiplies by `Leave Days`, preserving half days and other fractions to two decimal places. The importer does not write formula fields.

## Foundation endpoints

- `POST /api/demo-session` sets the selected demo persona in a signed, HTTP-only cookie.
- `DELETE /api/demo-session` returns to persona selection.
- `GET /api/config-check` checks Airtable connectivity and configured table IDs.
- `POST /api/hr-import/preview` validates an uploaded CSV and creates an in-memory preview for HR/Admin.
- `POST /api/hr-import/commit` applies a validated preview and creates an Import Log row.
- `POST /api/projects` and `POST /api/projects/bid` create Projects and Bids; `PATCH /api/projects` edits them.
- `GET /api/bookings/availability` returns team availability and load status without exposing other projects' details.
- `POST /api/bookings/lead` creates a booking immediately; `POST /api/bookings/edit` preserves prior booking terms; `POST /api/bookings/request` creates a capacity-neutral request; `POST /api/bookings/decision` books or declines a request.
- `POST /api/actuals` saves weekly milestone actual hours.
- `POST /api/accounts` lets Admin manage demo accounts and roles.

Airtable requests use table and field IDs and run server-side; the token is never sent to the browser. Reads are paginated. The token needs Airtable record read and write access for the app workflows.

The demo session uses an ephemeral signed cookie; there is no session database. The local development secret fallback is only for this fictional local demo. Configure `DEMO_SESSION_SECRET` before running in any deployed environment.
