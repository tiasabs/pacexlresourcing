# HR upload examples

These are fictional CSV examples for previewing the HR upload flow. Dates use `DD-MM-YYYY`.

- `people-no-errors.csv` uses valid field values and adds employee `SAMPLE-001` in preview.
- `people-with-errors.csv` deliberately includes an invalid role level, team, region, hours value, working-day count, status, and date.
- `leave-no-errors.csv` uses a valid leave row for `SAMPLE-001`. It will preview with no validation errors only after `SAMPLE-001` exists in Airtable People. Replace this ID with a current Employee ID if you are using an existing People record.
- `leave-with-errors.csv` deliberately uses an unknown employee ID, invalid leave type/status, impossible dates, and negative leave days.

People and Planned Leave files are complete snapshots. Preview the People example first. Do not commit it over a real HR snapshot unless it contains all current People rows; rows omitted from a committed snapshot can be marked as having left the organisation. The connected demo base currently has one People row but no populated Employee ID, so a no-error leave preview requires seeding a People record or replacing the sample ID with one that exists.
