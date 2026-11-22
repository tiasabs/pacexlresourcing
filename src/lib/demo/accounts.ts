export type AssignedRole = "admin" | "c_suite" | "hr";
export type DerivedRole = "line_manager" | "project_lead";
export type EffectiveRole = "individual" | AssignedRole | DerivedRole;

export type DemoAccount = {
  id: string;
  title: string;
  label: string;
  description: string;
  assignedRoles: AssignedRole[];
  derivedRoles: DerivedRole[];
};

// These six local demo personas will be replaced by App Accounts records when
// that table is added to the connected base.
export const demoAccounts: DemoAccount[] = [
  {
    id: "individual",
    title: "Individual",
    label: "Individual",
    description: "See your own load and bookings.",
    assignedRoles: [],
    derivedRoles: [],
  },
  {
    id: "line-manager",
    title: "Line Manager + Individual",
    label: "Line Manager",
    description: "See direct reports and your own bookings.",
    assignedRoles: [],
    derivedRoles: ["line_manager"],
  },
  {
    id: "team-lead",
    title: "Team Lead + Individual",
    label: "Team Lead",
    description: "See project teams and limited availability elsewhere.",
    assignedRoles: [],
    derivedRoles: ["project_lead"],
  },
  {
    id: "admin",
    title: "Admin + Individual",
    label: "Admin",
    description: "Access every feature and all records.",
    assignedRoles: ["admin"],
    derivedRoles: [],
  },
  {
    id: "c-suite",
    title: "C-Suite + Individual",
    label: "C-Suite",
    description: "See named load status and organisation-wide trends.",
    assignedRoles: ["c_suite"],
    derivedRoles: [],
  },
  {
    id: "hr",
    title: "HR + Individual",
    label: "HR",
    description: "Run People and planned leave uploads.",
    assignedRoles: ["hr"],
    derivedRoles: [],
  },
];

export function getDemoAccount(id: string) {
  return demoAccounts.find((account) => account.id === id) ?? null;
}

export function getEffectiveRoles(account: DemoAccount): EffectiveRole[] {
  return Array.from(
    new Set<EffectiveRole>([
      "individual",
      ...account.assignedRoles,
      ...account.derivedRoles,
    ]),
  );
}
