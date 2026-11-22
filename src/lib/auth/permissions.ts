import type { DemoAccount, EffectiveRole } from "@/lib/demo/accounts";
import { getEffectiveRoles } from "@/lib/demo/accounts";

export type BookingScope = {
  viewerPersonId: string;
  directReportIds: string[];
  leadProjectIds: string[];
};

export type BookingTarget = {
  personId: string;
  projectId: string;
};

export function hasAnyRole(account: DemoAccount, requiredRoles: EffectiveRole[]) {
  const effectiveRoles = new Set(getEffectiveRoles(account));
  return requiredRoles.some((role) => effectiveRoles.has(role));
}

export function canViewBookingDetails(
  account: DemoAccount,
  target: BookingTarget,
  scope: BookingScope,
) {
  if (hasAnyRole(account, ["admin"])) return true;
  if (target.personId === scope.viewerPersonId) return true;
  if (
    hasAnyRole(account, ["line_manager"]) &&
    scope.directReportIds.includes(target.personId)
  ) return true;
  if (
    hasAnyRole(account, ["project_lead"]) &&
    scope.leadProjectIds.includes(target.projectId)
  ) return true;
  return false;
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
        ? "Project Lead"
        : role === "line_manager"
          ? "Line Manager"
          : role === "admin"
            ? "Admin"
            : role === "hr"
              ? "HR"
              : "Individual",
  );
}
