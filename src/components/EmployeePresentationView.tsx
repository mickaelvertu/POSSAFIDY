import { useEffect, useState } from "react";
import type { AppUser, Employee, Store } from "../types";
import { PRESENTATION_CRITERIA, presentationScore, type Finding, type PresentationCheck } from "../services/employeePresentation";
import { loadPresentationData, savePresentationCheck, syncPresentationDirectory, type DirectoryEmployee } from "../services/employeePresentationService";

const labels = { DRAFT: "Brouillon", SUBMITTED: "À contrôler", VALIDATED: "Validé", CORRECTION: "À corriger" };
const monthOf = (time: number) => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export default function EmployeePresentationView({ user, stores, employees }: { user: AppUser; stores: Store[]; employees: Employee[] }) {
  const admin = ["ADMIN", "SUPER_ADMIN"].includes(user.roleId);
  const allowed = admin || ["CONTROLEUR", "RESPONSABLE_MAGASIN"].includes(user.roleId) || user.permissions.includes("employee_presentation.control");
  const [directory, setDirectory] = useState<DirectoryEmployee[]>([]);
  const [checks, setChecks] = useState<PresentationCheck[]>([]);
  const [selected, setSelected] = useState<PresentationCheck | null>(null);
  const [storeId, setStoreId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(monthOf(Date.now()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const scope = stores.filter(s => admin || user.storeIds.includes(s.id));
  async function reload() {
    const data = await loadPresentationData(admin, user.storeIds);
    setDirectory(data.employees); setChecks(data.checks.sort((a, b) => b.created_at - a.created_at));
  }
  useEffect(() => { if (allowed) void reload().catch(e => setError(e.message)); }, [user.id]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "Erreur de sauvegarde."); } finally { setBusy(false); }
  }
  if (!allowed) return <p>Accès non autorisé.</p>;
  const editable = selected && selected.created_by === user.id && ["DRAFT", "CORRECTION"].includes(selected.status);
  const reviewable = admin && selected?.status === "SUBMITTED" && selected.created_by !== user.id;
  const matching = checks.filter(c => (!storeId || c.store_id === storeId) && monthOf(c.created_at) === month);
  const totals = new Map<string, { name: string; points: number; maximum: number; count: number }>();
  matching.filter(c => c.status === "VALIDATED").forEach(c => {
    const key = `${c.store_id}:${c.employee_id}`;
    const total = totals.get(key) || { name: `${c.employee_name} · ${stores.find(s => s.id === c.store_id)?.name || c.store_id}`, points: 0, maximum: 0, count: 0 };
    const score = presentationScore(c.findings); total.points += score.points; total.maximum += score.maximum; total.count++; totals.set(key, total);
  });
  const field = "rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
  const button = "rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
  function updateFinding(index: number, patch: Partial<Finding>) {
    setSelected(c => c && ({ ...c, findings: c.findings.map((f, i) => i === index ? { ...f, ...patch } : f) }));
  }
  return <div className="space-y-5 rounded-xl bg-slate-50 p-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Contrôle des employés</h2><p className="text-sm text-slate-600">Présentation sur le lieu de travail · 5 points par critère conforme</p></div>
      <div className="flex gap-2"><button disabled={busy} className={button} onClick={() => void perform(reload)}>Actualiser</button>{admin && <button disabled={busy} className={button} onClick={() => void perform(() => syncPresentationDirectory(employees))}>Synchroniser l’annuaire</button>}</div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-3"><select aria-label="Magasin" className={field} value={storeId} onChange={e => { setStoreId(e.target.value); setEmployeeId(""); }}><option value="">Tous les magasins</option>{scope.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input aria-label="Mois du bilan" className={field} type="month" value={month} onChange={e => setMonth(e.target.value)} />
      <select aria-label="Employé" className={field} value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Choisir un employé</option>{directory.filter(e => e.is_active && e.store_id === storeId).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} · {e.position}</option>)}</select>
      <button disabled={busy || !storeId || !employeeId} className={button} onClick={() => { const employee = directory.find(e => e.id === employeeId)!; setSelected({ id: crypto.randomUUID(), store_id: storeId, employee_id: employee.id, employee_name: `${employee.first_name} ${employee.last_name}`, created_by: user.id, created_by_name: user.displayName, created_at: Date.now(), updated_at: 0, status: "DRAFT", findings: PRESENTATION_CRITERIA.map(() => ({ result: "OK", note: "", photo: "" })), review_note: "", reviewed_by: "", reviewed_at: 0 }); }}>Nouveau contrôle</button>
    </div>
    {!directory.length && <p className="text-sm text-slate-600">Annuaire vide. Un administrateur doit synchroniser les fiches du personnel. Chaque employé doit être affecté à un magasin.</p>}
    {selected && <div className="space-y-4 rounded-xl border bg-white p-4">
      <div className="flex justify-between gap-3"><div><h3 className="font-bold">{selected.employee_name} · {labels[selected.status]}</h3><p className="text-sm">{stores.find(s => s.id === selected.store_id)?.name} · {selected.created_by_name} · {new Date(selected.created_at).toLocaleString("fr-FR")}</p></div><button disabled={busy} onClick={() => setSelected(null)}>Fermer</button></div>
      {selected.review_note && <p className="rounded bg-amber-50 p-3">Retour administrateur : {selected.review_note}</p>}
      {selected.findings.map((f, i) => <div key={i} className="grid gap-2 border-t pt-3 md:grid-cols-2"><label className="font-semibold">{PRESENTATION_CRITERIA[i]}<select disabled={!editable || busy} aria-label={PRESENTATION_CRITERIA[i]} className={`${field} ml-3`} value={f.result} onChange={e => updateFinding(i, { result: e.target.value as Finding["result"] })}><option value="OK">Conforme (+5)</option><option value="ISSUE">Anomalie (0)</option><option value="NA">Non applicable</option></select></label>
        <textarea disabled={!editable || busy} aria-label={`Observation : ${PRESENTATION_CRITERIA[i]}`} placeholder="Observation (obligatoire en cas d’anomalie)" className={field} value={f.note} onChange={e => updateFinding(i, { note: e.target.value })} />
        <input disabled={!editable || busy} aria-label={`Lien photo : ${PRESENTATION_CRITERIA[i]}`} type="url" className={field} placeholder="Lien photo https:// (facultatif)" value={f.photo} onChange={e => updateFinding(i, { photo: e.target.value })} />{f.photo.startsWith("https://") && <a className="text-sm text-teal-700 underline" href={f.photo} target="_blank" rel="noreferrer">Voir la photo</a>}
      </div>)}
      <p className="font-bold">Score : {presentationScore(selected.findings).points} / {presentationScore(selected.findings).maximum} points</p>
      {editable && <div className="flex gap-3">{(["DRAFT", "SUBMITTED"] as const).map(status => <button key={status} disabled={busy} className={button} onClick={() => void perform(async () => { await savePresentationCheck({ ...selected, status }, user); setSelected(null); })}>{status === "DRAFT" ? "Enregistrer le brouillon" : "Soumettre à l’administrateur"}</button>)}</div>}
      {reviewable && <div className="space-y-3"><textarea aria-label="Note de validation ou correction" className={`${field} w-full`} placeholder="Correction demandée ou note de validation" value={selected.review_note} onChange={e => setSelected({ ...selected, review_note: e.target.value })} /><div className="flex gap-3">{(["VALIDATED", "CORRECTION"] as const).map(status => <button key={status} disabled={busy} className={button} onClick={() => void perform(async () => { await savePresentationCheck({ ...selected, status }, user, true); setSelected(null); })}>{status === "VALIDATED" ? "Valider les points" : "Demander une correction"}</button>)}</div></div>}
      {selected.status === "SUBMITTED" && selected.created_by === user.id && <p className="text-sm text-amber-800">La validation nécessite un autre administrateur.</p>}
    </div>}
    <div><h3 className="mb-2 font-bold">Bilan mensuel · contrôles validés</h3>{!totals.size && <p className="text-sm text-slate-500">Aucun point validé sur cette période.</p>}{[...totals.entries()].map(([id, t]) => <p key={id} className="border-b py-2 text-sm">{t.name} : <strong>{t.points} / {t.maximum} points</strong> · {t.count} contrôle(s) · {t.maximum ? Math.round(t.points / t.maximum * 100) : 0} %</p>)}</div>
    <div><h3 className="mb-2 font-bold">Historique des contrôles</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Date</th><th>Employé / magasin</th><th>Contrôleur</th><th>Statut</th><th>Points</th><th /></tr></thead><tbody>{matching.map(c => <tr key={c.id} className="border-t"><td className="py-3">{new Date(c.created_at).toLocaleDateString("fr-FR")}</td><td>{c.employee_name}<br />{stores.find(s => s.id === c.store_id)?.name}</td><td>{c.created_by_name}</td><td>{labels[c.status]}</td><td>{presentationScore(c.findings).points} / {presentationScore(c.findings).maximum}</td><td><button disabled={busy} className="text-teal-700 underline" onClick={() => setSelected(structuredClone(c))}>Ouvrir</button></td></tr>)}</tbody></table>{!matching.length && <p className="py-3 text-sm text-slate-500">Aucun contrôle sur cette période.</p>}</div></div>
  </div>;
}
