"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyActualLine } from "@/lib/airtable/resourcing-flow";

export function WeeklyActualsEntry({ workspace }: { workspace: { week: string; weekEnd: string; capacity: number; actualHours: number; capacityWarning: boolean; lines: WeeklyActualLine[]; locked: boolean; missingCount: number } }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(workspace.lines.map((line) => [line.key, line.actualHours === null ? "" : String(line.actualHours)])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const currentWeek = new Date(); currentWeek.setUTCDate(currentWeek.getUTCDate() - (currentWeek.getUTCDay() + 6) % 7);
  const currentWeekStart = currentWeek.toISOString().slice(0, 10);
  const future = workspace.week > currentWeekStart;
  const total = useMemo(() => workspace.lines.reduce((sum, line) => {
    const raw = values[line.key] ?? "";
    return sum + (raw.trim() === "" ? 0 : Number(raw) || 0);
  }, 0), [workspace.lines, values]);
  const byProject = useMemo(() => {
    const map = new Map<string, { projectName: string; lines: WeeklyActualLine[] }>();
    for (const line of workspace.lines) { const group = map.get(line.projectId) ?? { projectName: line.projectName, lines: [] }; group.lines.push(line); map.set(line.projectId, group); }
    return Array.from(map.values()).map((group) => ({ ...group, total: group.lines.reduce((sum, line) => sum + (values[line.key]?.trim() ? Number(values[line.key]) || 0 : 0), 0) }));
  }, [workspace.lines, values]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const entries = workspace.lines.map((line) => ({ key: line.key, hours: values[line.key]?.trim() === "" ? null : Number(values[line.key]) }));
    try {
      const response = await fetch("/api/actuals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week: workspace.week, entries }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Actual hours could not be saved.");
      setMessage(body.capacityWarning ? `Saved ${body.actualHours} actual hours. That is above this week’s capacity of ${body.capacity} hours; the entry is still recorded.` : `Saved ${body.actualHours} actual hours. ${body.missingCount ? `${body.missingCount} milestone line${body.missingCount === 1 ? " is" : "s are"} still blank.` : "All milestone lines have an entry."}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Actual hours could not be saved."); }
    finally { setBusy(false); }
  }

  function changeWeek(value: string) {
    if (!value) return;
    const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    router.push(`/actuals?week=${d.toISOString().slice(0, 10)}`);
  }

  return <section className="hr-records-section weekly-actuals-section">
    <div className="data-overview-heading"><div><p className="eyebrow">Work week</p><h2>{workspace.week} – {workspace.weekEnd}</h2></div><label className="actual-week-picker">Choose week<input type="date" value={workspace.week} onChange={(event) => changeWeek(event.target.value)} /></label></div>
    {future && <p className="empty-state">You can enter actual hours after this work week begins.</p>}
    {workspace.capacityWarning && <div className="capacity-notice" role="status"><strong>Your logged hours are above this week’s capacity.</strong><p>The app records the hours as entered. This warning does not block saving.</p></div>}
    <form onSubmit={save}>
      <div className="weekly-actual-summary"><div><span className="eyebrow">Hours entered</span><strong>{total.toFixed(2)}</strong></div><div><span className="eyebrow">Weekly capacity</span><strong>{workspace.capacity.toFixed(2)}</strong></div><div><span className="eyebrow">Milestones still blank</span><strong>{workspace.lines.filter((line) => !values[line.key]?.trim()).length}</strong></div></div>
      {byProject.map((project) => <section className="actual-project-block" key={project.lines[0]?.projectId}><div className="actual-project-heading"><h3>{project.projectName}</h3><strong>{project.total.toFixed(2)} h</strong></div><div className="hr-table-wrap"><table className="hr-table actuals-table"><thead><tr><th>Milestone</th><th>Expected</th><th>Actual hours</th></tr></thead><tbody>{project.lines.map((line) => <tr key={line.key}><td>{line.milestoneName}</td><td>{line.expectedHours.toFixed(2)} h</td><td><input aria-label={`Actual hours for ${line.projectName}, ${line.milestoneName}`} type="number" min="0" max="168" step="0.01" value={values[line.key] ?? ""} placeholder="Not logged" disabled={future || line.locked} onChange={(event) => setValues((current) => ({ ...current, [line.key]: event.target.value }))} /></td></tr>)}</tbody></table></div></section>)}
      {!workspace.lines.length && <p className="empty-state">No booked milestones overlap this week. If you worked on a project without a booking, request one from My bookings and the Project Lead can record it retrospectively.</p>}
      <div className="actual-save-row"><button className="primary-action" type="submit" disabled={busy || future || !workspace.lines.length}>{busy ? "Saving actuals…" : "Save actual hours"}</button>{workspace.locked && <span className="milestone-meta">Saved entries for this week are locked; any new retroactive entries can still be added once.</span>}</div>
      {error && <p className="upload-message upload-message-error" role="alert">{error}</p>}{message && <p className="upload-message upload-message-success" role="status">{message}</p>}
    </form>
  </section>;
}
