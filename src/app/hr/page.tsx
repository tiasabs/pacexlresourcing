import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { HrImportWorkspace } from "@/components/HrImportWorkspace";
import { canRunPeopleRefresh } from "@/lib/auth/permissions";
import { getHrCurrentLists } from "@/lib/airtable/hr-import";
import { getDemoSession } from "@/lib/demo/session";

export default async function HrPage() {
  const account = await getDemoSession();
  if (!account) redirect("/");
  if (!canRunPeopleRefresh(account)) redirect("/home");
  const lists = await getHrCurrentLists().catch(() => ({ people: [], leave: [] }));
  return (
    <AppShell account={account}>
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Data operations</p>
          <h1>People and leave</h1>
          <p className="dashboard-lede">Review current HR records, upload a people or leave export, and check the proposed Airtable changes before submitting.</p>
        </div>
      </section>
      <HrImportWorkspace people={lists.people} leave={lists.leave} />
    </AppShell>
  );
}
