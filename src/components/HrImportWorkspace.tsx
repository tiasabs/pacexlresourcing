"use client";

import { useState } from "react";

type CurrentPerson = { id: string; employeeId: unknown; name: unknown; email: unknown; team: unknown; region: unknown; status: unknown; hours: unknown; days: unknown };
type CurrentLeave = { id: string; leaveId: unknown; title: unknown; person: string; type: unknown; status: unknown; startDate: unknown; endDate: unknown; days: unknown; sync: unknown };
type Preview = { previewId: string; kind: "people" | "plannedLeave"; fileName: string; rowsReceived: number; added: number; updated: number; unchanged: number; markedInactive: number; markedCancelled: number; missingPercentage: number; missingWarning: boolean; issues: Array<{ row: number; message: string }> };

function ImportCard({ kind, title, description, template, preview, onPreview, onCommit, busy, message }: {
  kind: "people" | "plannedLeave"; title: string; description: string; template: string; preview: Preview | null;
  onPreview: (kind: "people" | "plannedLeave", file: File) => void; onCommit: (preview: Preview) => void; busy: boolean; message: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  return <section className="hr-import-card">
    <div className="hr-import-title"><div><p className="eyebrow">Full snapshot CSV</p><h2>{title}</h2></div><a className="text-button template-link" href={template} download>Download template</a></div>
    <p>{description}</p>
    <div className="hr-upload-row"><label className="file-picker">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><span>{file?.name ?? "No file selected"}</span><button className="text-button" type="button" disabled={!file || busy} onClick={() => file && onPreview(kind, file)}>Preview upload</button></div>
    {preview?.kind === kind && <div className="hr-preview" aria-live="polite">
      <h3>Preview: {preview.fileName}</h3>
      <dl className="hr-preview-stats"><div><dt>Rows</dt><dd>{preview.rowsReceived}</dd></div><div><dt>New</dt><dd>{preview.added}</dd></div><div><dt>Changed</dt><dd>{preview.updated}</dd></div><div><dt>Unchanged</dt><dd>{preview.unchanged}</dd></div>{kind === "people" ? <div><dt>Mark left organisation</dt><dd>{preview.markedInactive}</dd></div> : <div><dt>Cancel / mark taken</dt><dd>{preview.markedCancelled}</dd></div>}</dl>
      {preview.missingWarning && <p className="hr-warning" role="status">{Math.round(preview.missingPercentage * 100)}% of currently active people are missing from this snapshot. This is a warning only; you can still commit.</p>}
      {preview.issues.length > 0 && <div className="hr-errors"><strong>Fix these rows before committing</strong><ul>{preview.issues.slice(0, 12).map((issue, index) => <li key={`${issue.row}-${index}`}>Row {issue.row}: {issue.message}</li>)}</ul>{preview.issues.length > 12 && <p>And {preview.issues.length - 12} more issue(s).</p>}</div>}
      <button className="text-button commit-button" type="button" disabled={busy || preview.issues.length > 0} onClick={() => onCommit(preview)}>Commit {kind === "people" ? "People" : "Planned Leave"} updates</button>
    </div>}
    {message && <p className="form-message" role="status">{message}</p>}
  </section>;
}

export function HrImportWorkspace({ people, leave }: { people: CurrentPerson[]; leave: CurrentLeave[] }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function createPreview(kind: "people" | "plannedLeave", file: File) {
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("kind", kind); form.set("file", file);
      const response = await fetch("/api/hr-import/preview", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not preview upload.");
      setPreview(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not preview upload."); }
    finally { setBusy(false); }
  }
  async function commitImport(item: Preview) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/hr-import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewId: item.previewId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not commit import.");
      setPreview(null); setMessage(`Committed. ${body.added} new, ${body.updated} changed, ${body.unchanged} unchanged.`);
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not commit import."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="notice-card"><span className="status-mark success" aria-hidden="true" /><div><strong>Weekly HR snapshot</strong><p>Files are validated in memory and aren’t retained. Unchanged records are skipped. Missing records are marked inactive or cancelled rather than deleted.</p></div><span className="notice-tag">HR and Admin</span></section>
    <div className="hr-import-grid">
      <ImportCard kind="people" title="People" description="Employee ID is the stable match key. Missing active people are marked Left organisation; the configured threshold produces a warning only." template="/templates/hr-people-template.csv" preview={preview} onPreview={createPreview} onCommit={commitImport} busy={busy} message={message} />
      <ImportCard kind="plannedLeave" title="Planned leave" description="Leave ID is the stable match key. Approved leave is capacity relevant; absent records are marked Cancelled, or Taken when their end date is in the past." template="/templates/hr-planned-leave-template.csv" preview={preview} onPreview={createPreview} onCommit={commitImport} busy={busy} message={message} />
    </div>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Current Airtable records</p><h2>People ({people.length})</h2></div></div><div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Employee ID</th><th>Name</th><th>Team</th><th>Region</th><th>Hours / week</th><th>Status</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td>{String(person.employeeId ?? "")}</td><td>{String(person.name ?? "")}</td><td>{String(person.team ?? "")}</td><td>{String(person.region ?? "")}</td><td>{String(person.hours ?? "")}</td><td>{String(person.status ?? "")}</td></tr>)}</tbody></table>{!people.length && <p className="data-freshness">No People records could be read.</p>}</div></section>
    <section className="hr-records-section"><div className="data-overview-heading"><div><p className="eyebrow">Current Airtable records</p><h2>Planned leave ({leave.length})</h2></div></div><div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Leave ID</th><th>Person</th><th>Dates</th><th>Days</th><th>Approval status</th><th>Sync status</th></tr></thead><tbody>{leave.map((record) => <tr key={record.id}><td>{String(record.leaveId ?? "")}</td><td>{record.person}</td><td>{String(record.startDate ?? "")} – {String(record.endDate ?? "")}</td><td>{String(record.days ?? "")}</td><td>{String(record.status ?? "")}</td><td>{String(record.sync ?? "")}</td></tr>)}</tbody></table>{!leave.length && <p className="data-freshness">No Planned Leave records could be read.</p>}</div></section>
  </>;
}
