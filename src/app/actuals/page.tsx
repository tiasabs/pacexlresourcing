import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { WeeklyActualsEntry } from "@/components/WeeklyActualsEntry";
import { getWeeklyActualWorkspace } from "@/lib/airtable/resourcing-flow";
import { getDemoSession } from "@/lib/demo/session";

export default async function ActualsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const account = await getDemoSession();
  if (!account) redirect("/");
  const query = await searchParams;
  const workspace = await getWeeklyActualWorkspace(account, query.week);
  return <AppShell account={account}>
    <section className="dashboard-intro"><div><p className="eyebrow">Your work record</p><h1>Weekly actual hours</h1><p className="dashboard-lede">Log your time against the milestones you worked on. The totals help the team plan future work.</p></div></section>
    <WeeklyActualsEntry workspace={workspace} />
  </AppShell>;
}
