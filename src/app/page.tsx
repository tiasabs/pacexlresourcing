import { DemoAccess } from "@/components/DemoAccess";
import { MotionToggle } from "@/components/MotionToggle";
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
        <div className="topbar-actions">
          <span className="demo-pill">Prototype</span>
          <MotionToggle />
        </div>
      </header>

      <section className="access-hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">Portfolio Management Office</p>
          <h1 id="page-title">A clearer view of who can take on what.</h1>
          <p className="hero-intro">
            Explore the prototype from six different perspectives. Choose a demo account to continue.
          </p>
        </div>
        <div className="hero-aside" aria-label="Prototype details">
          <span className="hero-aside-number">01</span>
          <span>Shared picture<br />of current commitments</span>
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
      <footer className="access-footer">
        <span>Fictional case-study data</span>
        <span>Resourcing Radar · Prototype</span>
      </footer>
    </main>
  );
}
