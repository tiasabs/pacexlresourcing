import { DemoAccess } from "@/components/DemoAccess";
import { getDemoAccounts } from "@/lib/airtable/app-accounts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/lib/demo/session";

export default async function AccessPage() {
  if (await getDemoSession()) redirect("/home");
  const accounts = await getDemoAccounts().catch(() => []);

  return (
    <main className="access-page">
      <header className="access-header">
        <Link className="wordmark" href="/" aria-label="Resourcing Radar home">
          <span className="wordmark-mark" aria-hidden="true">R</span>
          <span>Resourcing Radar</span>
        </Link>
      </header>

      <section className="access-hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <h1 id="page-title">Choose an account</h1>
          <p className="hero-intro">Choose a demo account.</p>
        </div>
      </section>

      <section className="access-panel" aria-labelledby="choose-account-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Demo access</p>
            <h2 id="choose-account-title">Demo accounts</h2>
          </div>
          <span className="section-count">{String(accounts.length).padStart(2, "0")} personas</span>
        </div>
        <DemoAccess accounts={accounts} />
      </section>
    </main>
  );
}
