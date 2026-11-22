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
    description: "See your own workload and bookings.",
    assignedRoles: [],
    derivedRoles: [],
  },
  {
    id: "line-manager",
    title: "Line Manager + Individual",
    label: "Line Manager",
    description: "See booking for yourself and your direct reports.",
    assignedRoles: [],
    derivedRoles: ["line_manager"],
  },
  {
    id: "project-lead",
    title: "Project Lead + Individual",
    label: "Project Lead",
    description: "See bookings for yourself and your project team.",
    assignedRoles: [],
    derivedRoles: ["project_lead"],
  },
  {
    id: "admin",
    title: "Admin + Individual",
    label: "Admin",
    description: "Access all features and records.",
    assignedRoles: ["admin"],
    derivedRoles: [],
  },
  {
    id: "c-suite",
    title: "C-Suite + Individual",
    label: "C-Suite",
    description: "See your own bookings and access organisation-wide resourcing reports.",
    assignedRoles: ["c_suite"],
    derivedRoles: [],
  },
  {
    id: "hr",
    title: "HR + Individual",
    label: "HR",
    description: "See your own bookings and upload people and planned leave information.",
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
