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

The six demo personas are defined in `src/lib/demo/accounts.ts`. Admin, HR, and C-Suite are assigned roles; Individual is implicit; Line Manager and Project Lead are derived from people and project relationships.

## HR snapshot workflow

HR and Admin can open `/hr` to review existing People and Planned Leave records, download CSV templates, preview full snapshots, and commit changes. The templates are in `public/templates` and require exact headers. Use UTF-8 CSV, `YYYY-MM-DD` dates, stable Employee IDs and Leave IDs, and decimal Leave Days such as `0.5`.

Imports add new records and update changed records only. Missing people are marked `Left organisation`; missing leave is marked `Cancelled`, or `Taken` when its end date is in the past. Records are never deleted. A missing-people rate at or above the configured threshold displays a warning and still permits commit. File contents are held in memory only for the preview and are not retained. Import Log records the file name, actor label, counts, status, and timestamps.

Only leave with approval `Status` of `Approved` is capacity relevant. The importer does not write formula fields such as `Leave Hours`.

## Foundation endpoints

- `POST /api/demo-session` sets the selected demo persona in a signed, HTTP-only cookie.
- `DELETE /api/demo-session` returns to persona selection.
- `GET /api/config-check` checks Airtable connectivity and configured table IDs.
- `POST /api/hr-import/preview` validates an uploaded CSV and creates an in-memory preview for HR/Admin.
- `POST /api/hr-import/commit` applies a validated preview and creates an Import Log row.

Airtable requests use table and field IDs and run server-side; the token is never sent to the browser. Reads are paginated. The token needs Airtable record read and write access to use the import workflow.

The demo session uses an ephemeral signed cookie; there is no session database. The local development secret fallback is only for this fictional local demo. Configure `DEMO_SESSION_SECRET` before running in any deployed environment.
