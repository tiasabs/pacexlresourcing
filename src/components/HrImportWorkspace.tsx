"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CurrentPerson = { id: string; employeeId: unknown; name: unknown; email: unknown; team: unknown; region: unknown; status: unknown; hours: unknown; days: unknown };
type CurrentLeave = { id: string; leaveId: unknown; title: unknown; person: string; type: unknown; status: unknown; startDate: unknown; endDate: unknown; days: unknown; sync: unknown };
type Preview = { previewId: string; kind: "people" | "plannedLeave"; fileName: string; rowsReceived: number; added: number; updated: number; unchanged: number; markedInactive: number; markedCancelled: number; missingPercentage: number; missingWarning: boolean; warnings: string[]; issues: Array<{ row: number; message: string }> };
type Message = { tone: "success" | "warning" | "error"; text: string };

function ImportCard({ kind, title, description, template, preview, busy, resetKey, onSubmitFile, onCommit }: {
  kind: "people" | "plannedLeave";
  title: string;
  description: string;
  template: string;
  preview: Preview | null;
  busy: boolean;
  resetKey: number;
  onSubmitFile: (kind: "people" | "plannedLeave", file: File) => void;
  onCommit: (preview: Preview) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const cardPreview = preview?.kind === kind ? preview : null;

  return (
    <section className="hr-import-card">
      <div className="hr-import-title">
        <div>
          <p className="eyebrow">{kind === "people" ? "People export" : "Leave export"}</p>
          <h2>{title}</h2>
        </div>
        <a className="text-button template-link" href={template} download>Get CSV template</a>
      </div>
      <p>{description} Dates: DD-MM-YYYY. Common HR header names are recognized; extra columns are ignored.</p>

      <div className="hr-upload-row">
        <label className="file-picker">
          Choose CSV export
          <input key={resetKey} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <span className={file ? "selected-file" : "selected-file muted"}>{file?.name ?? "No file selected"}</span>
        <button className="primary-action" type="button" disabled={!file || busy} onClick={() => file && onSubmitFile(kind, file)}>
          {busy && !cardPreview ? "Uploading…" : "Submit file for review"}
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
          <p className="review-instruction">Check the changes below. Submit updates sends them to Airtable.</p>
          <dl className="hr-preview-stats">
            <div><dt>Rows received</dt><dd>{cardPreview.rowsReceived}</dd></div>
            <div><dt>New</dt><dd>{cardPreview.added}</dd></div>
            <div><dt>Changed</dt><dd>{cardPreview.updated}</dd></div>
            <div><dt>Unchanged</dt><dd>{cardPreview.unchanged}</dd></div>
            {kind === "people"
              ? <div><dt>Mark as left</dt><dd>{cardPreview.markedInactive}</dd></div>
              : <div><dt>Cancel or mark taken</dt><dd>{cardPreview.markedCancelled}</dd></div>}
          </dl>
          {cardPreview.missingWarning && <p className="hr-warning" role="status">{Math.round(cardPreview.missingPercentage * 100)}% of active people are missing from this snapshot. This is a warning; you can still submit.</p>}
          {cardPreview.warnings.length > 0 && <div className="hr-notes"><strong>Notes</strong><ul>{cardPreview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
          {cardPreview.issues.length > 0 && <div className="hr-errors"><strong>Correct the CSV and submit it again</strong><ul>{cardPreview.issues.slice(0, 12).map((issue, index) => <li key={`${issue.row}-${index}`}>{issue.row === 1 ? "File" : `Row ${issue.row}`}: {issue.message}</li>)}</ul>{cardPreview.issues.length > 12 && <p>And {cardPreview.issues.length - 12} more issue(s).</p>}</div>}
          <button className="primary-action commit-button" type="button" disabled={busy || cardPreview.issues.length > 0} onClick={() => onCommit(cardPreview)}>
            {busy ? "Submitting…" : "Submit updates to Airtable"}
          </button>
        </div>
      )}
    </section>
  );
}

export function HrImportWorkspace({ people, leave }: { people: CurrentPerson[]; leave: CurrentLeave[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);

  async function submitFile(kind: "people" | "plannedLeave", file: File) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function submitUpdates(item: Preview) {
    setBusy(true);
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
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Updates could not be submitted." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="hr-import-guidance">HR exports vary. These CSV templates show the information the app uses; your export can use common alternative column names and any column order. Extra columns are ignored, and blank optional cells leave existing values unchanged. Stable employee and leave IDs are required to match records.</p>
      <div className="hr-flow-steps" aria-label="Upload steps">
        <span><b>1</b> Choose a file</span><span aria-hidden="true">›</span>
        <span><b>2</b> Review the changes</span><span aria-hidden="true">›</span>
        <span><b>3</b> Submit to Airtable</span>
      </div>
      {message && <p className={`upload-message upload-message-${message.tone}`} role="status">{message.text}</p>}
      <div className="hr-import-grid">
        <ImportCard
          kind="people"
          title="People"
          description="Employee ID matches records. Blank cells leave existing values unchanged. New people need a name, team, region and contracted hours; blank workdays default to five."
          template="/templates/hr-people-template.csv"
          preview={preview}
          busy={busy}
          resetKey={resetKey}
          onSubmitFile={submitFile}
          onCommit={submitUpdates}
        />
        <ImportCard
          kind="plannedLeave"
          title="Planned leave"
          description="Leave ID matches records, and Employee ID links leave to a person. Blank cells leave existing values unchanged; new leave needs dates, days, type and status."
          template="/templates/hr-planned-leave-template.csv"
          preview={preview}
          busy={busy}
          resetKey={resetKey}
          onSubmitFile={submitFile}
          onCommit={submitUpdates}
        />
      </div>
      <section className="hr-records-section">
        <div className="data-overview-heading"><div><p className="eyebrow">Airtable</p><h2>People ({people.length})</h2></div></div>
        <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Employee ID</th><th>Name</th><th>Team</th><th>Region</th><th>Hours / week</th><th>Status</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td>{String(person.employeeId ?? "")}</td><td>{String(person.name ?? "")}</td><td>{String(person.team ?? "")}</td><td>{String(person.region ?? "")}</td><td>{String(person.hours ?? "")}</td><td>{String(person.status ?? "")}</td></tr>)}</tbody></table>{!people.length && <p className="data-freshness">No People records could be read.</p>}</div>
      </section>
      <section className="hr-records-section">
        <div className="data-overview-heading"><div><p className="eyebrow">Airtable</p><h2>Planned leave ({leave.length})</h2></div></div>
        <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>Leave ID</th><th>Person</th><th>Dates</th><th>Days</th><th>Approval status</th><th>Sync status</th></tr></thead><tbody>{leave.map((record) => <tr key={record.id}><td>{String(record.leaveId ?? "")}</td><td>{record.person}</td><td>{String(record.startDate ?? "")} – {String(record.endDate ?? "")}</td><td>{String(record.days ?? "")}</td><td>{String(record.status ?? "")}</td><td>{String(record.sync ?? "")}</td></tr>)}</tbody></table>{!leave.length && <p className="data-freshness">No Planned Leave records could be read.</p>}</div>
      </section>
    </>
  );
}
