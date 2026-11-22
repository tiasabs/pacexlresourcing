import { DemoAccess } from "@/components/DemoAccess";
import { demoAccounts } from "@/lib/demo/accounts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoSession } from "@/lib/demo/session";

export default async function AccessPage() {
  if (await getDemoSession()) redirect("/home");

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
          <p className="eyebrow">Portfolio Management Office</p>
          <h1 id="page-title">Choose an account</h1>
          <p className="hero-intro">
            Select a role to explore resourcing information from that perspective.
          </p>
        </div>
      </section>

      <section className="access-panel" aria-labelledby="choose-account-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Demo access</p>
            <h2 id="choose-account-title">Choose an account</h2>
          </div>
          <span className="section-count">06 personas</span>
        </div>
        <DemoAccess accounts={demoAccounts} />
      </section>
    </main>
  );
}
