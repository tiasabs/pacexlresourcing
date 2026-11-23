export type AssignedRole = "admin" | "c_suite" | "hr";
export type DerivedRole = "line_manager" | "project_lead";
export type EffectiveRole = "individual" | AssignedRole | DerivedRole;

export type DemoAccount = {
  id: string;
  title: string;
  label: string;
  description: string;
  personId: string;
  firstName: string;
  assignedRoles: AssignedRole[];
  derivedRoles: DerivedRole[];
};

export function getEffectiveRoles(account: DemoAccount): EffectiveRole[] {
  return Array.from(new Set<EffectiveRole>(["individual", ...account.assignedRoles, ...account.derivedRoles]));
}
