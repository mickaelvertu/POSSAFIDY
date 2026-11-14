import { ClipboardList, RefreshCw, Users, Plus, Search, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppUser, Employee, Store } from "../types";
import { PRESENTATION_CRITERIA, presentationScore, type Finding, type PresentationCheck } from "../services/employeePresentation";
import { loadPresentationData, savePresentationCheck, syncPresentationDirectory, type DirectoryEmployee } from "../services/employeePresentationService";

const labels = { DRAFT: "Brouillon", SUBMITTED: "À contrôler", VALIDATED: "Validé", CORRECTION: "À corriger" };
const monthOf = (time: number) => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export default function EmployeePresentationView({ user, stores, employees, onBack }: { user: AppUser; stores: Store[]; employees: Employee[]; onBack: () => void }) {
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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const scope = stores.filter(s => admin || user.storeIds.includes(s.id));
  async function reload() {
    const data = await loadPresentationData(admin, user.storeIds);
    setDirectory(data.employees); setChecks(data.checks.sort((a, b) => b.created_at - a.created_at));
  }
  useEffect(() => { if (allowed) void reload().catch(e => setError(e.message)).finally(() => setLoading(false)); else setLoading(false); }, [user.id]);
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
  const filteredChecks = matching.filter(c => (statusFilter === 'ALL' || c.status === statusFilter) && (c.employee_name + ' ' + c.created_by_name + ' ' + (stores.find(s => s.id === c.store_id)?.name || '')).toLowerCase().includes(search.toLowerCase()));
  const badge = (status: PresentationCheck['status']) => 'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ' + ({ DRAFT: 'border-slate-200 bg-slate-100 text-slate-600', SUBMITTED: 'border-amber-200 bg-amber-50 text-amber-800', VALIDATED: 'border-emerald-200 bg-emerald-50 text-emerald-700', CORRECTION: 'border-rose-200 bg-rose-50 text-rose-700' }[status]);
  const field = "min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-600";
  const secondary = "ui-btn h-auto min-h-10 rounded-xl border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-none hover:bg-slate-50 disabled:opacity-50";
  const button = "ui-btn h-auto min-h-10 rounded-xl border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-none hover:bg-emerald-700 disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500";
  function updateFinding(index: number, patch: Partial<Finding>) {
    setSelected(c => c && ({ ...c, findings: c.findings.map((f, i) => i === index ? { ...f, ...patch } : f) }));
  }
  return <div className="treasury-shell space-y-6 text-slate-900">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" />Retour à l’accueil</button>
    <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center"><div><h2 className="flex items-center gap-2 font-serif text-lg font-bold"><ClipboardList className="h-5 w-5 text-emerald-600" />Contrôle des employés</h2><p className="mt-1 text-xs text-slate-500">Présentation sur le lieu de travail · 5 points par critère conforme</p></div>
      <div className="flex flex-wrap gap-2"><button disabled={busy || loading} className={secondary} onClick={() => void perform(reload)}><RefreshCw className="h-4 w-4" />Actualiser</button>{admin && <button disabled={busy} className={secondary} onClick={() => void perform(() => syncPresentationDirectory(employees))}><Users className="h-4 w-4" />Synchroniser l’annuaire</button>}</div>
    </div>
    <div className="rounded-2xl bg-emerald-950 p-4 text-xs leading-6 text-emerald-100"><p className="font-bold text-emerald-300">Du contrôle à la validation des points</p><p>Renseignez les critères de présentation, justifiez les anomalies et soumettez le contrôle. Un autre administrateur valide les points ou demande une correction.</p></div>
    {(loading || busy) && <p role="status" className="text-sm text-slate-500">{loading ? "Chargement des contrôles…" : "Enregistrement en cours…"}</p>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <div className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-slate-600">Magasin<select aria-label="Magasin" className={field} value={storeId} onChange={e => { setStoreId(e.target.value); setEmployeeId(""); }}><option value="">Tous les magasins</option>{scope.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Mois du bilan<input aria-label="Mois du bilan" className={field} type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
      <label className="text-xs font-bold text-slate-600">Employé<select aria-label="Employé" className={field} value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Choisir un employé</option>{directory.filter(e => e.is_active && e.store_id === storeId).map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} · {e.position}</option>)}</select></label>
      <button disabled={busy || !storeId || !employeeId} className={button} onClick={() => { const employee = directory.find(e => e.id === employeeId)!; setSelected({ id: crypto.randomUUID(), store_id: storeId, employee_id: employee.id, employee_name: `${employee.first_name} ${employee.last_name}`, created_by: user.id, created_by_name: user.displayName, created_at: Date.now(), updated_at: 0, status: "DRAFT", findings: PRESENTATION_CRITERIA.map(() => ({ result: "OK", note: "", photo: "" })), review_note: "", reviewed_by: "", reviewed_at: 0 }); }}><Plus className="h-4 w-4" />Nouveau contrôle</button>
    </div>
    {!directory.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Annuaire vide. Un administrateur doit synchroniser les fiches du personnel. Chaque employé doit être affecté à un magasin.</p>}
    {selected && <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex justify-between gap-3"><div><h3 className="flex flex-wrap items-center gap-3 text-lg font-black">{selected.employee_name}<span className={badge(selected.status)}>{labels[selected.status]}</span></h3><p className="mt-1 text-xs text-slate-500">{stores.find(s => s.id === selected.store_id)?.name} · {selected.created_by_name} · {new Date(selected.created_at).toLocaleString("fr-FR")}</p></div><button className={secondary} disabled={busy} onClick={() => setSelected(null)}>Fermer</button></div>
      {selected.review_note && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Retour administrateur : {selected.review_note}</p>}
      {selected.findings.map((f, i) => <div key={i} className="grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2"><label className="text-sm font-bold text-slate-700">{PRESENTATION_CRITERIA[i]}<select disabled={!editable || busy} aria-label={PRESENTATION_CRITERIA[i]} className={`${field} mt-2`} value={f.result} onChange={e => updateFinding(i, { result: e.target.value as Finding["result"] })}><option value="OK">Conforme (+5)</option><option value="ISSUE">Anomalie (0)</option><option value="NA">Non applicable</option></select></label>
        <textarea disabled={!editable || busy} aria-label={`Observation : ${PRESENTATION_CRITERIA[i]}`} placeholder="Observation (obligatoire en cas d’anomalie)" className={`${field} min-h-24`} value={f.note} onChange={e => updateFinding(i, { note: e.target.value })} />
        <input disabled={!editable || busy} aria-label={`Lien photo : ${PRESENTATION_CRITERIA[i]}`} type="url" className={field} placeholder="Lien photo https:// (facultatif)" value={f.photo} onChange={e => updateFinding(i, { photo: e.target.value })} />{f.photo.startsWith("https://") && <a className="text-xs font-semibold text-emerald-700 underline underline-offset-4" href={f.photo} target="_blank" rel="noreferrer">Voir la photo</a>}
      </div>)}
      <p className="rounded-xl bg-emerald-950 p-4 text-sm font-bold tabular-nums text-emerald-100">Score : {presentationScore(selected.findings).points} / {presentationScore(selected.findings).maximum} points</p>
      {editable && <div className="flex flex-wrap gap-3">{(["DRAFT", "SUBMITTED"] as const).map(status => <button key={status} disabled={busy} className={status === "DRAFT" ? secondary : button} onClick={() => void perform(async () => { await savePresentationCheck({ ...selected, status }, user); setSelected(null); })}>{status === "DRAFT" ? "Enregistrer le brouillon" : "Soumettre à l’administrateur"}</button>)}</div>}
      {reviewable && <div className="space-y-3"><textarea aria-label="Note de validation ou correction" className={`${field} w-full`} placeholder="Correction demandée ou note de validation" value={selected.review_note} onChange={e => setSelected({ ...selected, review_note: e.target.value })} /><div className="flex flex-wrap gap-3">{(["VALIDATED", "CORRECTION"] as const).map(status => <button key={status} disabled={busy} className={status === "CORRECTION" ? secondary : button} onClick={() => void perform(async () => { await savePresentationCheck({ ...selected, status }, user, true); setSelected(null); })}>{status === "VALIDATED" ? "Valider les points" : "Demander une correction"}</button>)}</div></div>}
      {selected.status === "SUBMITTED" && selected.created_by === user.id && <p className="text-sm text-amber-800">La validation nécessite un autre administrateur.</p>}
    </div>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><h3 className="border-b border-slate-200 p-5 text-sm font-bold">Bilan mensuel · contrôles validés</h3>{!totals.size ? <p className="p-6 text-sm text-slate-500">Aucun point validé sur cette période.</p> : <div className="overflow-x-auto"><table className="ui-table w-full text-xs"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th>Employé / magasin</th><th>Points validés</th><th>Contrôles</th><th>Conformité</th></tr></thead><tbody>{[...totals.entries()].map(([id, t]) => <tr key={id} className="border-slate-100 hover:bg-slate-50"><td className="font-semibold">{t.name}</td><td className="font-bold tabular-nums text-emerald-700">{t.points} / {t.maximum}</td><td className="tabular-nums">{t.count}</td><td className="tabular-nums">{t.maximum ? Math.round(t.points / t.maximum * 100) : 0} %</td></tr>)}</tbody></table></div>}</section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-4 border-b border-slate-200 p-5"><h3 className="text-sm font-bold">Historique des contrôles</h3><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><div className="flex flex-1 flex-wrap gap-1.5">{(['ALL', 'DRAFT', 'SUBMITTED', 'VALIDATED', 'CORRECTION'] as const).map(value => <button type="button" key={value} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={'ui-btn ui-btn-sm h-auto min-h-8 rounded-lg border-0 px-3 py-1.5 text-xs font-bold shadow-none ' + (statusFilter === value ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{value === 'ALL' ? 'Tous les contrôles' : labels[value]}</button>)}</div><label className="relative block w-full xl:w-64"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Rechercher un contrôle" className={field + ' pl-10'} placeholder="Employé, magasin, contrôleur…" value={search} onChange={event => setSearch(event.target.value)} /></label></div></div>
      <div className="overflow-x-auto"><table className="ui-table w-full text-left text-xs"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th>Date</th><th>Employé / magasin</th><th>Contrôleur</th><th>Statut</th><th>Points</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{filteredChecks.map(c => <tr key={c.id} className="border-slate-100 hover:bg-slate-50"><td className="whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('fr-FR')}</td><td><p className="font-bold">{c.employee_name}</p><p className="mt-1 text-xs text-slate-500">{stores.find(s => s.id === c.store_id)?.name}</p></td><td>{c.created_by_name}</td><td><span className={badge(c.status)}>{labels[c.status]}</span></td><td className="whitespace-nowrap font-semibold tabular-nums">{presentationScore(c.findings).points} / {presentationScore(c.findings).maximum}</td><td><button disabled={busy} className={secondary} onClick={() => setSelected(structuredClone(c))}>Ouvrir</button></td></tr>)}</tbody></table></div>{!loading && !filteredChecks.length && <p className="p-10 text-center text-sm text-slate-500">{matching.length ? 'Aucun contrôle ne correspond aux filtres.' : 'Aucun contrôle sur cette période.'}</p>}
    </section>
  </div>;
}
