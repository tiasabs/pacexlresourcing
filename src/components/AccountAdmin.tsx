"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AccountAdminRow } from "@/lib/airtable/resourcing-flow";
import type { AssignedRole } from "@/lib/demo/accounts";

type Props = { accounts: AccountAdminRow[]; people: Array<{ id: string; name: string }>; roles: Array<{ key: AssignedRole; label: string }> };

function AccountForm({ account, people, roles }: Props & { account?: AccountAdminRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account?.id, label: data.get("label"), buttonLabel: data.get("buttonLabel"), personId: data.get("personId"), roles: data.getAll("roles"), enabled: data.get("enabled") === "on" }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The account could not be saved.");
      setMessage("Account saved. Its persona will use these permissions next time it is selected."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The account could not be saved."); }
    finally { setBusy(false); }
  }
  return <form className="account-admin-form" onSubmit={save}>
    <label>Account name<input name="label" required maxLength={100} defaultValue={account?.label ?? ""} placeholder="e.g. Data Lead" /></label>
    <label>Persona button<input name="buttonLabel" required maxLength={100} defaultValue={account?.buttonLabel ?? ""} placeholder="e.g. Project Lead" /></label>
    <label>People record<select name="personId" required defaultValue={account?.personId ?? ""}><option value="" disabled>Choose a person</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <fieldset><legend>Manually assigned roles</legend><div className="account-role-options">{roles.map((role) => <label key={role.key}><input type="checkbox" name="roles" value={role.key} defaultChecked={account?.roles.includes(role.key)} />{role.label}</label>)}</div></fieldset>
    <label className="account-enabled"><input type="checkbox" name="enabled" defaultChecked={account?.enabled ?? true} />Enabled</label>
    <button className="primary-action" disabled={busy} type="submit">{busy ? "Saving…" : account ? "Save account" : "Create account"}</button>
    {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
  </form>;
}

export function AccountAdmin({ accounts, people, roles }: Props) {
  return <div className="account-admin-list">
    {accounts.map((account) => <details className="account-admin-card" key={account.id}><summary><strong>{account.buttonLabel || account.label}</strong><span>{account.personName} · {account.enabled ? "Enabled" : "Disabled"}</span></summary><AccountForm account={account} accounts={accounts} people={people} roles={roles} /></details>)}
    <details className="account-admin-card account-admin-new"><summary><strong>Create a demo account</strong><span>Link a person and assign one or more roles</span></summary><AccountForm accounts={accounts} people={people} roles={roles} /></details>
  </div>;
}
