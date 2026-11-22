import type { DemoAccount, EffectiveRole } from "@/lib/demo/accounts";
import { getEffectiveRoles } from "@/lib/demo/accounts";

export function hasAnyRole(account: DemoAccount, requiredRoles: EffectiveRole[]) {
  const effectiveRoles = new Set(getEffectiveRoles(account));
  return requiredRoles.some((role) => effectiveRoles.has(role));
}

export function canViewAllBookings(account: DemoAccount) {
  return hasAnyRole(account, ["admin"]);
}

export function canViewOrganisationLoad(account: DemoAccount) {
  return hasAnyRole(account, ["admin", "c_suite"]);
}

export function canRunPeopleRefresh(account: DemoAccount) {
  return hasAnyRole(account, ["admin", "hr"]);
}

export function roleLabels(account: DemoAccount) {
  return getEffectiveRoles(account).map((role) =>
    role === "c_suite"
      ? "C-Suite"
      : role === "project_lead"
        ? "Team Lead"
        : role === "line_manager"
          ? "Line Manager"
          : role === "admin"
            ? "Admin"
            : role === "hr"
              ? "HR"
              : "Individual",
  );
}
