# Resourcing Radar

A local resourcing app for a charity PMO. The first slice provides a six-persona demo entry page, role-aware workspace shell, and a server-side Airtable configuration check.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Choose a persona to enter the demo. There is no login step. The picker is a demonstration shortcut; future sign-in is planned through a single sign-on provider.

## Airtable setup

The base and existing table/field IDs are kept in `src/config/airtable.ts`. The Airtable personal access token must be stored in `.env.local` as `AIRTABLE_PERSONAL_ACCESS_TOKEN`. Do not expose it through a `NEXT_PUBLIC_` variable or commit it. `.env.example` lists the expected local variables.

The current connected base has People, Projects and Bids, Planned Leave, Resource Bookings, Public Holidays, and Settings. App Accounts, Effort Bands, Person Weeks, and Import Log still need to be added and their IDs entered in the config file. The Settings table currently uses two key/value rows; its agreed typed single-row shape has not yet been applied.

The demo personas are currently defined in `src/lib/demo/accounts.ts`. When App Accounts is ready, replace those local presets with records linked to People. Admin, HR, and C-Suite are assigned roles; Individual is implicit; Line Manager and Project Lead are derived from people and project relationships.

## Foundation endpoints

- `POST /api/demo-session` sets the selected demo persona in a signed, HTTP-only cookie.
- `DELETE /api/demo-session` returns to persona selection.
- `GET /api/config-check` checks whether the server has an Airtable token and whether planned table IDs are configured.

The demo session uses an ephemeral signed cookie; there is no session database. The local development secret fallback is only for this fictional local demo. Configure `DEMO_SESSION_SECRET` before running in any deployed environment.
