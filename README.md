# Resourcing Radar

A local resourcing app for a charity PMO. The demo provides six persona shortcuts, a role-aware workspace, a server-side Airtable read layer, and an HR workspace for People and Planned Leave snapshots.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Choose a persona to enter the demo. There is no login step. The picker is a demonstration shortcut; future sign-in is planned through a single sign-on provider.

## Airtable setup

The base and table/field IDs are in `src/config/airtable.ts`. Store the Airtable personal access token in `.env.local` as `AIRTABLE_PERSONAL_ACCESS_TOKEN`. Do not expose it through a `NEXT_PUBLIC_` variable or commit it. `.env.example` lists the expected local variables.

The base contains People, Projects and Bids, Planned Leave, Resource Bookings, Public Holidays, Settings, App Accounts, Effort Bands, Person Weeks, and Import Log. A typed `Application Settings` row holds load thresholds, the missing-row warning threshold, and refresh cadence; older key/value settings rows remain in place.

The six enabled demo personas are records in App Accounts linked to People. Admin, HR, and C-Suite are assigned roles; Individual is implicit; Line Manager and Project Lead are derived from People and project relationships. Each request reloads the account and role data from Airtable, so changes to App Roles take effect on the next page request.

## Booking views

- `/bookings` shows the signed-in demo person's bookings read-only. They can submit an offline request for a selected project, dates, and hours. The request is stored as a pending booking, contributes to the person's visible workload, and appears in the relevant Project Lead inbox. No email is sent.
- `/projects` shows bookings on projects the signed-in person leads and lets the lead approve or decline pending requests.
- `/team` shows the signed-in person's own bookings and direct reports' bookings.
- `/leadership` shows named quarterly booked hours divided by capacity and peak weekly load/status. It assigns weeks to the quarter containing Monday and labels results as based on current bookings. The server calculates and upserts the weekly rows in Person Weeks; C-Suite cannot drill into booking details.

The demo uses fictional seed people, projects, and bookings. Project-plan uploads, AI milestone drafting, editing/locking planned milestone dates, and automated weekly HR reminders remain future workflow work.

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
- `POST /api/bookings/request` creates a pending offline booking request for the signed-in person.
- `POST /api/bookings/decision` lets a Project Lead approve or decline a request on their project.

Airtable requests use table and field IDs and run server-side; the token is never sent to the browser. Reads are paginated. The token needs Airtable record read and write access to use the import workflow.

The demo session uses an ephemeral signed cookie; there is no session database. The local development secret fallback is only for this fictional local demo. Configure `DEMO_SESSION_SECRET` before running in any deployed environment.
