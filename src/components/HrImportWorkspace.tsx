"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type CurrentPerson = { id: string; employeeId: unknown; name: unknown; email: unknown; team: unknown; region: unknown; status: unknown; hours: unknown; days: unknown; role: unknown; roleLevel: unknown; manager: string; startDate: unknown; endDate: unknown };
type Preview = { previewId: string; kind: "people" | "plannedLeave"; fileName: string; rowsReceived: number; added: number; updated: number; unchanged: number; markedInactive: number; markedCancelled: number; missingPercentage: number; missingWarning: boolean; warnings: string[]; issues: Array<{ row: number; message: string }>; changes: Array<{ category: string; label: string; details: string }> };
type Message = { tone: "success" | "warning" | "error"; text: string };
type UploadAction = { kind: "people" | "plannedLeave"; action: "preview" | "commit" } | null;

function ImportCard({ kind, title, template, preview, activeAction, resetKey, onSubmitFile, onCommit }: {
  kind: "people" | "plannedLeave";
  title: string;
  template: string;
  preview: Preview | null;
  activeAction: UploadAction;
  resetKey: number;
  onSubmitFile: (kind: "people" | "plannedLeave", file: File) => void;
  onCommit: (preview: Preview) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const cardPreview = preview?.kind === kind ? preview : null;
  const busy = activeAction !== null;
  const previewing = activeAction?.kind === kind && activeAction.action === "preview";
  const committing = activeAction?.kind === kind && activeAction.action === "commit";

  return (
    <section className="hr-import-card">
      <div className="hr-import-title">
        <h2>{title}</h2>
        <a className="text-button template-link" href={template} download>Download template</a>
      </div>

      <div className="hr-upload-row">
        <label className="file-picker">
          Choose file
          <input key={resetKey} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <span className={file ? "selected-file" : "selected-file muted"}>{file?.name ?? "No file selected"}</span>
        <button className="primary-action" type="button" disabled={!file || busy} onClick={() => file && onSubmitFile(kind, file)}>
          {previewing ? "Uploading…" : "Submit file for review"}
        </button>
      </div>

      {cardPreview && (
        <div className="hr-preview" aria-live="polite">
          <div className="hr-preview-heading">
            <div>
              <p className="eyebrow">Review changes</p>
              <h3>{cardPreview.fileName}</h3>
            </div>
            <span className={cardPreview.issues.length ? "upload-state upload-state-error" : "upload-state upload-state-ready"}>
              {cardPreview.issues.length ? `${cardPreview.issues.length} issue${cardPreview.issues.length === 1 ? "" : "s"}` : "File received"}
            </span>
          </div>
          <p className="review-instruction">Unchanged records are skipped. Check the listed exceptions before submitting.</p>
          <dl className="hr-preview-stats">
            <div><dt>Rows received</dt><dd>{cardPreview.rowsReceived}</dd></div>
            <div><dt>New</dt><dd>{cardPreview.added}</dd></div>
            <div><dt>Changed</dt><dd>{cardPreview.updated}</dd></div>
            <div><dt>Unchanged</dt><dd>{cardPreview.unchanged}</dd></div>
            {kind === "people"
              ? <div><dt>Mark as left</dt><dd>{cardPreview.markedInactive}</dd></div>
              : <div><dt>Cancel or mark taken</dt><dd>{cardPreview.markedCancelled}</dd></div>}
          </dl>
          {cardPreview.changes.length > 0 && <div className="hr-change-review"><strong>Changes to review ({cardPreview.changes.length})</strong><ul>{cardPreview.changes.slice(0, 6).map((change, index) => <li key={`${change.category}-${change.label}-${index}`}><span className="hr-change-category">{change.category}</span><span><b>{change.label}</b><small>{change.details}</small></span></li>)}</ul>{cardPreview.changes.length > 6 && <details><summary>Show {cardPreview.changes.length - 6} more</summary><ul>{cardPreview.changes.slice(6).map((change, index) => <li key={`${change.category}-${change.label}-${index + 6}`}><span className="hr-change-category">{change.category}</span><span><b>{change.label}</b><small>{change.details}</small></span></li>)}</ul></details>}</div>}
          {cardPreview.missingWarning && <p className="hr-warning" role="status">{Math.round(cardPreview.missingPercentage * 100)}% of active people are missing from this snapshot. This is a warning; you can still submit.</p>}
          {cardPreview.warnings.length > 0 && <div className="hr-notes"><strong>Notes</strong><ul>{cardPreview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
          {cardPreview.issues.length > 0 && <div className="hr-errors"><strong>Correct the CSV and submit it again</strong><ul>{cardPreview.issues.slice(0, 12).map((issue, index) => <li key={`${issue.row}-${index}`}>{issue.row === 1 ? "File" : `Row ${issue.row}`}: {issue.message}</li>)}</ul>{cardPreview.issues.length > 12 && <p>And {cardPreview.issues.length - 12} more issue(s).</p>}</div>}
          <button className="primary-action commit-button" type="button" disabled={busy || cardPreview.issues.length > 0} onClick={() => onCommit(cardPreview)}>
            {committing ? "Submitting…" : "Submit updates to Airtable"}
          </button>
        </div>
      )}
    </section>
  );
}

export function HrImportWorkspace({ people }: { people: CurrentPerson[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [activeAction, setActiveAction] = useState<UploadAction>(null);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (uploadOpen && !dialog.open) dialog.showModal();
    if (!uploadOpen && dialog.open) dialog.close();
  }, [uploadOpen]);

  async function submitFile(kind: "people" | "plannedLeave", file: File) {
    setActiveAction({ kind, action: "preview" });
    setPreview(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/hr-import/preview", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload could not be reviewed.");
      setPreview(body);
      const issueCount = body.issues?.length ?? 0;
      setMessage({
        tone: issueCount ? "warning" : "success",
        text: issueCount ? `File uploaded. Review found ${issueCount} issue${issueCount === 1 ? "" : "s"} below.` : "File uploaded. Review the changes below, then submit them to Airtable.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Upload could not be reviewed." });
    } finally {
      setActiveAction(null);
    }
  }

  async function submitUpdates(item: Preview) {
    setActiveAction({ kind: item.kind, action: "commit" });
    setMessage(null);
    try {
      const response = await fetch("/api/hr-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId: item.previewId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Updates could not be submitted.");
      setPreview(null);
      setResetKey((key) => key + 1);
      setMessage({ tone: "success", text: `Submitted to Airtable: ${body.added} new, ${body.updated} changed, ${body.unchanged} unchanged.` });
      setUploadOpen(false);
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Updates could not be submitted." });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <>
      {message && <p className={`upload-message upload-message-${message.tone}`} role="status">{message.text}</p>}
      <section className="hr-records-section">
        <div className="data-overview-heading hr-people-heading">
          <div><h2>People ({people.length})</h2></div>
          <button className="primary-action" type="button" onClick={() => { setMessage(null); setUploadOpen(true); }}>Upload People &amp; Leave data</button>
        </div>
        <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Employee ID</th><th>Name</th><th>Team</th><th>Region</th><th>Hours / week</th><th>Status</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td>{String(person.employeeId ?? "")}</td><td><Link className="hr-person-link" href={`/hr/${person.id}`}>{String(person.name ?? "View details")}</Link></td><td>{String(person.team ?? "")}</td><td>{String(person.region ?? "")}</td><td>{String(person.hours ?? "")}</td><td>{String(person.status ?? "")}</td></tr>)}</tbody></table>{!people.length && <p className="data-freshness">No People records could be read.</p>}</div>
      </section>
      <dialog ref={dialogRef} className="hr-upload-dialog" aria-labelledby="hr-upload-title" onCancel={() => setUploadOpen(false)} onClose={() => setUploadOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setUploadOpen(false); }}>
        <div className="hr-dialog-heading">
          <div><p className="eyebrow">HR data</p><h2 id="hr-upload-title">Upload People &amp; Leave data</h2></div>
          <button className="text-button" type="button" onClick={() => setUploadOpen(false)}>Close</button>
        </div>
        <div className="hr-import-grid">
          <ImportCard key={`people-${resetKey}`} kind="people" title="People file" template="/templates/hr-people-template.csv" preview={preview} activeAction={activeAction} resetKey={resetKey} onSubmitFile={submitFile} onCommit={submitUpdates} />
          <ImportCard key={`plannedLeave-${resetKey}`} kind="plannedLeave" title="Leave file" template="/templates/hr-planned-leave-template.csv" preview={preview} activeAction={activeAction} resetKey={resetKey} onSubmitFile={submitFile} onCommit={submitUpdates} />
        </div>
      </dialog>
    </>
  );
}
