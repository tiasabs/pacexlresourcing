import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountAdmin } from "@/components/AccountAdmin";
import { getAccountAdminRows } from "@/lib/airtable/resourcing-flow";
import { canViewAllBookings } from "@/lib/auth/permissions";
import { getDemoSession } from "@/lib/demo/session";

export default async function AccountsPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canViewAllBookings(account)) redirect("/home");
  const data = await getAccountAdminRows(account);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Admin</p><h1>Demo accounts</h1><p className="dashboard-lede">Link each persona to a People record and assign its permissions manually.</p></div></section>
    <section className="capacity-notice"><strong>Changes apply the next time a persona is selected.</strong><p>Line Manager and Project Lead are manually assigned roles. Individual access is implicit.</p></section>
    <AccountAdmin {...data} />
  </AppShell>;
}
