export const airtable = {
  baseId: "app5sERK0BpCKIR2H",
  tables: {
    people: "tblP1zQLS5VqEEZ1C",
    projectsAndBids: "tblZaEgUH8dKY31xR",
    plannedLeave: "tblYmEPZQYWZhw5cV",
    resourceBookings: "tbl8sutsxPF1Mt4oJ",
    publicHolidays: "tblgrs1ZOZYpX4oJa",
    settings: "tblKBRDjd77dT28Ej",
    appAccounts: null,
    effortBands: null,
    personWeeks: null,
    importLog: null,
  },
  fields: {
    people: {
      employeeId: "fldFKcjtOFkLCiG1p",
      fullName: "fldG4cBpoWm7Dvy8l",
      workEmail: "fldbRUnAFLtMCWATf",
      region: "fldGBI9Lz0RPdpdFp",
      contractedHours: "fldA1xyuUehh1vJde",
      workingDaysPerWeek: "fldgFaQRPxIjwxMkO",
      lineManager: "fldTwwcbEYVcjku8k",
    },
    settings: {
      settingName: "fldCgwlmXi07MfeHt",
      value: "fldP221ToaZAt3wzB",
    },
  },
} as const;

export type AirtableTableKey = keyof typeof airtable.tables;
