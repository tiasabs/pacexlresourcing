"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DemoAccount } from "@/lib/demo/accounts";

export function DemoAccess({ accounts }: { accounts: DemoAccount[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function enterAs(accountId: string) {
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/demo-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId }),
        });
        if (!response.ok) throw new Error("We couldn't open that demo account.");
        router.push("/home");
        router.refresh();
      } catch {
        setError("We couldn't open that demo account. Please try again.");
      }
    });
  }

  return (
    <div className="demo-access">
      {!accounts.length && <p className="upload-message upload-message-error" role="status">No enabled demo accounts linked to People records were found in Airtable.</p>}
      <div className="demo-grid" aria-label="Choose a demo account">
        {accounts.map((account, index) => (
          <button
            className="persona-card"
            disabled={pending}
            key={account.id}
            onClick={() => enterAs(account.id)}
            type="button"
          >
            <span className="persona-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="persona-copy">
              <span className="persona-title">{account.title}</span>
              <span className="persona-description">{account.description}</span>
            </span>
            <span className="persona-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <p className="demo-disclaimer">
        Demo access only. Choose a persona to explore its view; no password is required.
      </p>
      <p aria-live="polite" className="form-message" role="status">
        {pending ? "Opening your demo account…" : error}
      </p>
    </div>
  );
}
