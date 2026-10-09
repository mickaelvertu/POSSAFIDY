import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Lightbulb, Save, Send, ShieldAlert, Trash2, XCircle } from "lucide-react";
import type { AppUser, Article, InventoryCount, InventoryCountLine, InventoryCountStatus, InventoryReasonDecision, Store, StoreStock } from "../types";
import { generateRef } from "../services/stockService";
import {
  anomalyLines,
  applyDecisions,
  buildChargesReport,
  buildCountLine,
  chargesToCsv,
  countableArticles,
  InventorySuggestion,
  isValidCountedQuantity,
  missingReasons,
  suggestCountPriorities,
  suggestForLines,
  suggestForReview,
  summarizeCount
} from "../services/inventoryControl";

interface InventoryControlViewProps {
  currentUser: AppUser;
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  counts: InventoryCount[];
  canCount: boolean;
  canReview: boolean;
  onSaveCount: (count: InventoryCount, submit: boolean) => Promise<void>;
  onDeleteDraft: (count: InventoryCount) => Promise<void>;
  onValidateCount: (count: InventoryCount, decisions: Record<string, InventoryReasonDecision>, note: string) => Promise<void>;
  onRejectCount: (count: InventoryCount, note: string) => Promise<void>;
  onSignCount: (count: InventoryCount) => Promise<void>;
  onRefuseSignature: (count: InventoryCount, note: string) => Promise<void>;
  loadStoreManagers: (storeId: string) => Promise<{ id: string; name: string }[]>;
  onSettleCharges: (counts: InventoryCount[], method: "PAYSLIP" | "ADVANCE" | "OTHER", reference: string, note: string) => Promise<void>;
}

const STATUS_LABELS: Record<InventoryCountStatus, { label: string; className: string }> = {
  DRAFT: { label: "Brouillon", className: "bg-slate-100 text-slate-700 border-slate-300" },
  AWAITING_SIGNATURE: { label: "À signer", className: "bg-blue-100 text-blue-800 border-blue-300" },
  SUBMITTED: { label: "À contrôler", className: "bg-amber-100 text-amber-800 border-amber-300" },
  VALIDATED: { label: "Validé", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  REJECTED: { label: "Rejeté", className: "bg-rose-100 text-rose-800 border-rose-300" }
};

const SUGGESTION_STYLES: Record<InventorySuggestion["level"], string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-200 bg-rose-50 text-rose-900"
};

const money = (amount: number) => `${Math.round(amount).toLocaleString("fr-FR")} Ar`;
const formatDate = (timestamp?: number) => timestamp ? new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

function StatusBadge({ status }: { status: InventoryCountStatus }) {
  const { label, className } = STATUS_LABELS[status];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${className}`}>{label}</span>;
}

function Suggestions({ items, title }: { items: InventorySuggestion[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2" aria-label={title}>
      <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700"><Lightbulb className="h-4 w-4 text-amber-500" />{title}</h4>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${SUGGESTION_STYLES[item.level]}`}>
          <p className="font-semibold">{item.title}</p>
          <p className="mt-0.5 opacity-90">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

export default function InventoryControlView({
  currentUser, stores, articles, stocks, counts, canCount, canReview,
  onSaveCount, onDeleteDraft, onValidateCount, onRejectCount, onSettleCharges, onSignCount, onRefuseSignature, loadStoreManagers
}: InventoryControlViewProps) {
  const [tab, setTab] = useState<"count" | "review" | "charges">(canCount ? "count" : "review");
  const activeStores = useMemo(() => stores.filter(store => store.is_active && store.store_type !== "RESELLER"), [stores]);
  const [storeId, setStoreId] = useState(activeStores[0]?.id || "");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [storeManagers, setStoreManagers] = useState<{ id: string; name: string }[]>([]);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [refuseNote, setRefuseNote] = useState("");
  const [error, setError] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, InventoryReasonDecision>>({});
  const [reviewNote, setReviewNote] = useState("");
  const [chargeFilter, setChargeFilter] = useState<{ startDate: string; endDate: string; managerId: string; storeId: string; settlement: "ALL" | "PENDING" | "SETTLED" }>({ startDate: "", endDate: "", managerId: "", storeId: "", settlement: "PENDING" });
  const [settling, setSettling] = useState<string | null>(null);
  const [settleMethod, setSettleMethod] = useState<"PAYSLIP" | "ADVANCE" | "OTHER">("PAYSLIP");
  const [settleReference, setSettleReference] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settleError, setSettleError] = useState("");
  const [settleBusy, setSettleBusy] = useState(false);

  const submitSettlement = async (managerId: string, countIds: string[]) => {
    setSettleBusy(true);
    setSettleError("");
    try {
      await onSettleCharges(counts.filter(count => countIds.includes(count.id)), settleMethod, settleReference.trim(), settleNote.trim());
      setSettling(null);
      setSettleReference("");
      setSettleNote("");
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "Impossible d'enregistrer la déduction.");
    } finally {
      setSettleBusy(false);
    }
  };
  const [openManagers, setOpenManagers] = useState<Record<string, boolean>>({});
  const chargeManagers = useMemo(
    () => [...new Map(counts.filter(count => (count.total_charged_amount || 0) > 0).map(count => [count.charged_to || count.created_by, count.charged_to_name || count.created_by_name])).entries()],
    [counts]
  );
  const chargesReport = useMemo(() => buildChargesReport(counts, chargeFilter), [counts, chargeFilter]);

  const exportCharges = () => {
    const url = URL.createObjectURL(new Blob([chargesToCsv(chargesReport.managers)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `retenues-inventaire-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const store = activeStores.find(item => item.id === storeId);
  useEffect(() => {
    if (!canCount || !storeId) return;
    let active = true;
    loadStoreManagers(storeId).then(list => { if (active) setStoreManagers(list); }).catch(() => { if (active) setStoreManagers([]); });
    return () => { active = false; };
  }, [canCount, storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const toSign = counts.filter(count => count.status === "AWAITING_SIGNATURE" && count.manager_id === currentUser.uid);
  const storeArticles = useMemo(() => store ? countableArticles(store, articles, stocks) : [], [store, articles, stocks]);
  const systemQuantity = (articleId: string) => stocks.find(stock => stock.store_id === storeId && stock.article_id === articleId)?.quantity || 0;

  const myCounts = useMemo(
    () => counts.filter(count => count.store_id === storeId && (canReview || count.created_by === currentUser.uid)).sort((a, b) => b.updated_at - a.updated_at),
    [counts, storeId, canReview, currentUser.uid]
  );

  const currentLines: InventoryCountLine[] = useMemo(() => storeArticles.flatMap(article => {
    const raw = quantities[article.id];
    if (raw === undefined || raw.trim() === "") return [];
    const value = Number(raw);
    return isValidCountedQuantity(value) ? [buildCountLine(article, systemQuantity(article.id), value, reasons[article.id])] : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [storeArticles, quantities, reasons, stocks, storeId]);

  const invalidInputs = storeArticles.filter(article => {
    const raw = quantities[article.id];
    return raw !== undefined && raw.trim() !== "" && !isValidCountedQuantity(Number(raw));
  });

  const prioritySuggestions = useMemo(() => store ? suggestCountPriorities(store, articles, stocks, counts) : [], [store, articles, stocks, counts]);
  const lineSuggestions = useMemo(() => suggestForLines(currentLines), [currentLines]);
  const summary = summarizeCount({ lines: currentLines });

  const resetEditor = () => {
    setDraftId(null);
    setQuantities({});
    setReasons({});
    setNotes("");
    setManagerId("");
    setError("");
  };

  const changeStore = (id: string) => {
    setStoreId(id);
    resetEditor();
  };

  const openDraft = (count: InventoryCount) => {
    setDraftId(count.id);
    setQuantities(Object.fromEntries(count.lines.map(line => [line.article_id, String(line.counted_quantity)])));
    setReasons(Object.fromEntries(count.lines.filter(line => line.reason).map(line => [line.article_id, line.reason as string])));
    setNotes(count.notes || "");
    setManagerId(count.manager_id || "");
    setError("");
  };

  const buildCount = (status: InventoryCountStatus): InventoryCount => {
    const existing = counts.find(count => count.id === draftId);
    const now = Date.now();
    return {
      id: existing?.id || `inventory-${crypto.randomUUID()}`,
      count_number: existing?.count_number || generateRef("INV", counts.length),
      store_id: storeId,
      store_name: store?.name || storeId,
      status,
      lines: currentLines,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      created_by: existing?.created_by || currentUser.uid,
      created_by_name: existing?.created_by_name || currentUser.displayName || currentUser.email,
      created_at: existing?.created_at || now,
      updated_at: now,
      ...(status === "AWAITING_SIGNATURE" ? { submitted_at: now } : {}),
      ...(managerId ? { manager_id: managerId, manager_name: storeManagers.find(item => item.id === managerId)?.name || existing?.manager_name } : {})
    };
  };

  const persist = async (submit: boolean) => {
    setError("");
    if (!store) return setError("Choisissez un magasin.");
    if (invalidInputs.length > 0) return setError("Certaines quantités comptées sont invalides (nombre positif attendu).");
    if (currentLines.length === 0) return setError("Saisissez au moins une quantité comptée.");
    if (submit) {
      if (!managerId) return setError("Désignez le responsable du magasin qui doit signer le comptage.");
      const missing = missingReasons(currentLines);
      if (missing.length > 0) return setError(`Un motif (5 caractères minimum) est obligatoire pour chaque anomalie : ${missing.map(line => line.article_name).join(", ")}.`);
    }
    setBusy(true);
    try {
      const count = buildCount(submit ? "AWAITING_SIGNATURE" : "DRAFT");
      await onSaveCount(count, submit);
      if (submit) resetEditor(); else setDraftId(count.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer l'inventaire.");
    } finally {
      setBusy(false);
    }
  };

  const runSignature = async (count: InventoryCount, action: "sign" | "refuse") => {
    if (action === "refuse" && refuseNote.trim().length < 5) return setError("Indiquez la raison du refus (5 caractères minimum).");
    setBusy(true);
    setError("");
    try {
      if (action === "sign") await onSignCount(count);
      else await onRefuseSignature(count, refuseNote.trim());
      setRefusing(null);
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (count: InventoryCount) => {
    if (!window.confirm(`Supprimer le brouillon ${count.count_number} ?`)) return;
    setBusy(true);
    try {
      await onDeleteDraft(count);
      if (draftId === count.id) resetEditor();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  const visibleArticles = storeArticles.filter(article => {
    const query = search.trim().toLowerCase();
    if (query && !`${article.name} ${article.code}`.toLowerCase().includes(query)) return false;
    if (onlyCounted) return (quantities[article.id] || "").trim() !== "";
    return true;
  });

  // ---- Review (administrator) ----
  const reviewable = counts.filter(count => count.status === "SUBMITTED").sort((a, b) => (a.submitted_at || 0) - (b.submitted_at || 0));
  const reviewed = counts.filter(count => count.status === "VALIDATED" || count.status === "REJECTED").sort((a, b) => (b.reviewed_at || 0) - (a.reviewed_at || 0)).slice(0, 15);
  const reviewCount = counts.find(count => count.id === reviewId);
  const reviewPreview = reviewCount && reviewCount.status === "SUBMITTED" ? applyDecisions(reviewCount, decisions) : undefined;
  const reviewHints = reviewCount ? suggestForReview(reviewCount, counts) : new Map<string, InventorySuggestion[]>();

  const openReview = (count: InventoryCount) => {
    setReviewId(count.id);
    setDecisions({});
    setReviewNote("");
    setError("");
  };

  const runReview = async (action: "validate" | "reject") => {
    if (!reviewCount) return;
    if (action === "reject" && reviewNote.trim().length < 5) return setError("Indiquez la raison du rejet (5 caractères minimum).");
    setBusy(true);
    setError("");
    try {
      if (action === "validate") await onValidateCount(reviewCount, decisions, reviewNote);
      else await onRejectCount(reviewCount, reviewNote.trim());
      setReviewId(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  const tabButton = (id: "count" | "review" | "charges", label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => { setTab(id); setError(""); }}
      className={`rounded-xl px-4 py-2 text-xs font-bold transition ${tab === id ? "bg-blue-600 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}
    >
      {label}{badge ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{badge}</span> : null}
    </button>
  );

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700"><ClipboardCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">Contrôle d'inventaire</h2>
            <p className="text-xs text-slate-500">Comptage physique par magasin, justification des écarts et validation par un administrateur.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canCount && tabButton("count", "Comptage")}
          {canReview && tabButton("review", "Contrôle admin", reviewable.length)}
          {canReview && tabButton("charges", "Retenues")}
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {tab === "count" && canCount && (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-600">
              Magasin à inventorier
              <select value={storeId} onChange={event => changeStore(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                {activeStores.length === 0 && <option value="">Aucun magasin accessible</option>}
                {activeStores.map(item => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
              </select>
            </label>
            <button type="button" onClick={resetEditor} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Nouveau comptage</button>
          </div>

          {toSign.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-xs">
              <h3 className="text-sm font-bold text-blue-900">Comptages à signer (vous êtes le responsable désigné)</h3>
              {toSign.map(count => {
                const anomalies = anomalyLines(count.lines);
                return (
                  <div key={count.id} className="space-y-2 rounded-xl border border-blue-200 bg-white p-3 text-xs">
                    <p><span className="font-mono font-semibold">{count.count_number}</span> · {count.store_name} · compté par <strong>{count.created_by_name}</strong> · {count.lines.length} article(s), {anomalies.length} anomalie(s)</p>
                    {anomalies.map(line => (
                      <p key={line.article_id} className="text-slate-600">{line.article_name} : théorique {line.system_quantity} → compté {line.counted_quantity} <strong className={line.variance < 0 ? "text-rose-700" : "text-emerald-700"}>({line.variance > 0 ? "+" : ""}{line.variance})</strong> — « {line.reason} »</p>
                    ))}
                    {refusing === count.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input value={refuseNote} onChange={event => setRefuseNote(event.target.value)} placeholder="Raison du refus (5 caractères minimum)" className="min-w-48 flex-1 rounded-lg border border-slate-300 px-2 py-1" />
                        <button type="button" disabled={busy} onClick={() => void runSignature(count, "refuse")} className="rounded-lg border border-rose-300 px-3 py-1 font-bold text-rose-700">Confirmer le refus</button>
                        <button type="button" onClick={() => setRefusing(null)} className="rounded-lg border border-slate-300 px-3 py-1 font-bold text-slate-600">Annuler</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-slate-500">En signant, vous attestez avoir été présent lors du comptage.</p>
                        <div className="flex gap-2">
                          <button type="button" disabled={busy} onClick={() => { setRefusing(count.id); setRefuseNote(""); }} className="rounded-lg border border-rose-300 px-3 py-1 font-bold text-rose-700">Refuser</button>
                          <button type="button" disabled={busy} onClick={() => void runSignature(count, "sign")} className="rounded-lg bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700 disabled:opacity-50">Signer (présence attestée)</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Suggestions items={prioritySuggestions} title="Suggestions : par quoi commencer" />

          {myCounts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="mb-2 text-sm font-bold">Mes inventaires de ce magasin</h3>
              <ul className="divide-y divide-slate-100 text-xs">
                {myCounts.slice(0, 8).map(count => (
                  <li key={count.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2"><span className="font-mono font-semibold">{count.count_number}</span><StatusBadge status={count.status} /><span className="text-slate-500">{formatDate(count.updated_at)}</span></span>
                    <span className="flex items-center gap-2">
                      {count.status === "VALIDATED" && (count.total_charged_amount || 0) > 0 && <span className="font-semibold text-rose-700">Retenu : {money(count.total_charged_amount || 0)}</span>}
                      {count.status === "REJECTED" && count.review_note && <span className="text-rose-700">{count.review_note}</span>}
                      {count.status === "DRAFT" && count.created_by === currentUser.uid && (
                        <>
                          <button type="button" onClick={() => openDraft(count)} className="font-bold text-blue-700 hover:underline">Reprendre</button>
                          <button type="button" onClick={() => void deleteDraft(count)} aria-label="Supprimer le brouillon" className="text-rose-600"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un article…" className="min-w-48 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={onlyCounted} onChange={event => setOnlyCounted(event.target.checked)} />Articles comptés seulement</label>
              <span className="text-xs text-slate-500">{draftId ? "Brouillon en cours" : "Nouveau comptage"} · {summary.counted} compté(s) · {summary.anomalies} anomalie(s)</span>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-4 py-2">Article</th><th className="px-3 py-2 text-right">Théorique</th><th className="px-3 py-2">Compté</th><th className="px-3 py-2 text-right">Écart</th><th className="px-3 py-2">Motif de l'anomalie</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleArticles.map(article => {
                    const line = currentLines.find(item => item.article_id === article.id);
                    const raw = quantities[article.id] ?? "";
                    const invalid = raw.trim() !== "" && !isValidCountedQuantity(Number(raw));
                    return (
                      <tr key={article.id} className={line && line.variance !== 0 ? "bg-amber-50/60" : ""}>
                        <td className="px-4 py-2"><p className="font-semibold">{article.name}</p><p className="font-mono text-[10px] text-slate-500">{article.code} · {article.unit}</p></td>
                        <td className="px-3 py-2 text-right font-mono">{systemQuantity(article.id)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0} inputMode="decimal" value={raw} aria-label={`Quantité comptée ${article.name}`}
                            onChange={event => setQuantities(current => ({ ...current, [article.id]: event.target.value }))}
                            className={`w-24 rounded-lg border px-2 py-1 font-mono ${invalid ? "border-rose-400" : "border-slate-300"}`}
                          />
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${!line || line.variance === 0 ? "text-slate-400" : line.variance < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {line ? `${line.variance > 0 ? "+" : ""}${line.variance}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {line && line.variance !== 0 ? (
                            <input
                              value={reasons[article.id] || ""} aria-label={`Motif ${article.name}`} placeholder="Motif obligatoire"
                              onChange={event => setReasons(current => ({ ...current, [article.id]: event.target.value }))}
                              className={`w-full min-w-48 rounded-lg border px-2 py-1 ${(reasons[article.id] || "").trim().length < 5 ? "border-amber-400" : "border-slate-300"}`}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleArticles.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucun article à afficher.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <Suggestions items={lineSuggestions} title="Suggestions sur votre comptage" />

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <label className="block text-xs font-semibold text-slate-600">Responsable du magasin (doit signer pour attester sa présence)
              <select value={managerId} onChange={event => setManagerId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
                <option value="">— Choisir le responsable —</option>
                {storeManagers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {storeManagers.length === 0 && <span className="mt-1 block font-normal text-amber-700">Aucun responsable de magasin actif n'est assigné à ce magasin.</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-600">Remarque générale (optionnelle)
              <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Manque estimé : <strong className="text-rose-700">{money(summary.shortageValue)}</strong> · Excédent : <strong className="text-emerald-700">{money(summary.surplusValue)}</strong></p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void persist(false)} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Save className="h-4 w-4" />Enregistrer en brouillon</button>
                <button type="button" disabled={busy} onClick={() => void persist(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" />Envoyer au responsable pour signature</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "charges" && canReview && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs           sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <label className="text-xs font-semibold text-slate-600">Du
              <input type="date" value={chargeFilter.startDate} onChange={event => setChargeFilter(current => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">Au
              <input type="date" value={chargeFilter.endDate} onChange={event => setChargeFilter(current => ({ ...current, endDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">Responsable
              <select value={chargeFilter.managerId} onChange={event => setChargeFilter(current => ({ ...current, managerId: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Tous</option>
                {chargeManagers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Magasin
              <select value={chargeFilter.storeId} onChange={event => setChargeFilter(current => ({ ...current, storeId: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Tous</option>
                {activeStores.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Statut
              <select value={chargeFilter.settlement} onChange={event => setChargeFilter(current => ({ ...current, settlement: event.target.value as "ALL" | "PENDING" | "SETTLED" }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="PENDING">À déduire</option>
                <option value="SETTLED">Déduit</option>
                <option value="ALL">Tous</option>
              </select>
            </label>
            <button type="button" onClick={exportCharges} disabled={chargesReport.managers.length === 0} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">Exporter en CSV</button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <span>Total : <strong>{money(chargesReport.total)}</strong> · à déduire : <strong>{money(chargesReport.managers.reduce((sum, group) => sum + group.pending_total, 0))}</strong> · déjà déduit : <strong>{money(chargesReport.managers.reduce((sum, group) => sum + group.settled_total, 0))}</strong></span>
            <span className="text-xs">{chargesReport.managers.length} responsable(s) concerné(s) · à déduire de la paie ou à imputer aux avances sur salaire</span>
          </div>

          {chargesReport.managers.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Aucune retenue sur cette période.</p>}

          {chargesReport.managers.map(group => {
            const isOpen = openManagers[group.manager_id] ?? true;
            return (
              <div key={group.manager_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpenManagers(current => ({ ...current, [group.manager_id]: !isOpen }))} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-slate-50">
                  <span><span className="font-bold">{group.manager_name}</span><span className="ml-2 text-xs text-slate-500">{group.counts} inventaire(s) · {group.details.length} article(s)</span></span>
                  <span className="text-sm font-bold text-rose-700">{money(group.total)}{group.pending_total > 0 && group.pending_total !== group.total && <span className="ml-2 text-xs font-semibold text-amber-700">dont {money(group.pending_total)} à déduire</span>}</span>
                </button>
                {isOpen && group.pending_count_ids.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 bg-amber-50 p-3 text-xs">
                    {settling !== group.manager_id ? (
                      <button type="button" onClick={() => { setSettling(group.manager_id); setSettleError(""); }} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-700">Marquer {money(group.pending_total)} comme déduit</button>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                        <label className="font-semibold text-slate-600">Déduit via
                          <select value={settleMethod} onChange={event => setSettleMethod(event.target.value as "PAYSLIP" | "ADVANCE" | "OTHER")} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2">
                            <option value="PAYSLIP">Fiche de paie</option>
                            <option value="ADVANCE">Avance sur salaire</option>
                            <option value="OTHER">Autre</option>
                          </select>
                        </label>
                        <label className="font-semibold text-slate-600">Référence *
                          <input value={settleReference} onChange={event => setSettleReference(event.target.value)} placeholder="Paie 2026-03, n° avance…" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                        </label>
                        <label className="font-semibold text-slate-600">Note
                          <input value={settleNote} onChange={event => setSettleNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" />
                        </label>
                        <div className="flex gap-2">
                          <button type="button" disabled={settleBusy || !settleReference.trim()} onClick={() => submitSettlement(group.manager_id, group.pending_count_ids)} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">{settleBusy ? "…" : "Confirmer"}</button>
                          <button type="button" onClick={() => setSettling(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold">Annuler</button>
                        </div>
                      </div>
                    )}
                    {settling === group.manager_id && settleError && <p role="alert" className="text-rose-700">{settleError}</p>}
                  </div>
                )}
                {isOpen && (
                  <div className="overflow-auto border-t border-slate-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr><th className="px-4 py-2">Date</th><th className="px-3 py-2">Inventaire</th><th className="px-3 py-2">Article</th><th className="px-3 py-2 text-right">Théo. → Compté</th><th className="px-3 py-2 text-right">Manquant</th><th className="px-3 py-2 text-right">Coût unit.</th><th className="px-3 py-2 text-right">Retenue</th><th className="px-3 py-2">Motif refusé</th><th className="px-3 py-2">Statut</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.details.map((detail, index) => (
                          <tr key={`${detail.count_id}-${detail.article_code}-${index}`}>
                            <td className="px-4 py-2 whitespace-nowrap">{formatDate(detail.reviewed_at)}</td>
                            <td className="px-3 py-2"><p className="font-mono font-semibold">{detail.count_number}</p><p className="text-slate-500">{detail.store_name}</p></td>
                            <td className="px-3 py-2"><p className="font-semibold">{detail.article_name}</p><p className="font-mono text-[10px] text-slate-500">{detail.article_code}</p></td>
                            <td className="px-3 py-2 text-right font-mono">{detail.system_quantity} → {detail.counted_quantity}</td>
                            <td className="px-3 py-2 text-right font-mono text-rose-700">{detail.missing_quantity} {detail.unit}</td>
                            <td className="px-3 py-2 text-right font-mono">{money(detail.unit_cost)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">{money(detail.amount)}</td>
                            <td className="px-3 py-2 italic text-slate-600">{detail.reason || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{detail.settled
                              ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Déduit {detail.settlement_date ? formatDate(detail.settlement_date) : ""}{detail.settlement_reference ? ` · ${detail.settlement_reference}` : ""}</span>
                              : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">À déduire</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "review" && canReview && (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="mb-2 text-sm font-bold">En attente de contrôle ({reviewable.length})</h3>
              {reviewable.length === 0 && <p className="text-xs text-slate-500">Aucun inventaire à contrôler.</p>}
              <ul className="space-y-2">
                {reviewable.map(count => {
                  const info = summarizeCount(count);
                  return (
                    <li key={count.id}>
                      <button type="button" onClick={() => openReview(count)} className={`w-full rounded-xl border p-3 text-left text-xs hover:bg-slate-50 ${reviewId === count.id ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                        <p className="font-mono font-bold">{count.count_number}</p>
                        <p>{count.store_name} · {count.created_by_name}</p>
                        <p className="text-slate-500">{formatDate(count.submitted_at)} · {info.anomalies} anomalie(s)</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <h3 className="mb-2 text-sm font-bold">Historique récent</h3>
              <ul className="space-y-2 text-xs">
                {reviewed.map(count => (
                  <li key={count.id} className="rounded-xl border border-slate-100 p-2">
                    <div className="flex items-center justify-between"><span className="font-mono font-semibold">{count.count_number}</span><StatusBadge status={count.status} /></div>
                    <p className="text-slate-500">{count.store_name} · {count.created_by_name}</p>
                    {(count.total_charged_amount || 0) > 0 && <p className="font-semibold text-rose-700">Retenu à {count.charged_to_name} : {money(count.total_charged_amount || 0)}</p>}
                  </li>
                ))}
                {reviewed.length === 0 && <li className="text-slate-500">Aucun historique.</li>}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            {!reviewCount || reviewCount.status !== "SUBMITTED" || !reviewPreview ? (
              <p className="py-10 text-center text-sm text-slate-500">Sélectionnez un inventaire à contrôler.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-mono text-base font-bold">{reviewCount.count_number}</h3>
                    <p className="text-xs text-slate-500">{reviewCount.store_name} · compté par <strong>{reviewCount.created_by_name}</strong> · soumis le {formatDate(reviewCount.submitted_at)}</p>
                  </div>
                  <StatusBadge status={reviewCount.status} />
                </div>
                {reviewCount.notes && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">Remarque : {reviewCount.notes}</p>}
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  Motif jugé exact : le stock est ajusté sans conséquence. Motif jugé inexact : le stock est ajusté, mais le manque est retenu au nom de <strong>{reviewCount.manager_signed_by_name || reviewCount.created_by_name}</strong>.
                </p>
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  Présence attestée : <strong>{reviewCount.manager_signed_by_name || "—"}</strong> a signé le {formatDate(reviewCount.manager_signed_at)}.
                </p>
                {reviewCount.created_by === currentUser.uid && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Vous avez réalisé ce comptage : un autre administrateur doit l'approuver.</p>}
                {anomalyLines(reviewCount.lines).length === 0 ? (
                  <p className="text-xs text-emerald-700">Aucune anomalie : le comptage correspond au stock théorique.</p>
                ) : (
                  <div className="space-y-3">
                    {anomalyLines(reviewCount.lines).map(line => {
                      const decision = decisions[line.article_id] ?? "ACCEPTED";
                      const lineHints = reviewHints.get(line.article_id) || [];
                      return (
                        <div key={line.article_id} className="rounded-xl border border-slate-200 p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold">{line.article_name} <span className="font-mono text-[10px] text-slate-500">{line.article_code}</span></p>
                              <p className="text-slate-600">Théorique {line.system_quantity} → compté {line.counted_quantity} <strong className={line.variance < 0 ? "text-rose-700" : "text-emerald-700"}>({line.variance > 0 ? "+" : ""}{line.variance} {line.unit} · {money(line.variance_value)})</strong></p>
                            </div>
                            <div className="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label={`Décision ${line.article_name}`}>
                              <button type="button" onClick={() => setDecisions(current => ({ ...current, [line.article_id]: "ACCEPTED" }))} className={`flex items-center gap-1 px-3 py-1.5 font-bold ${decision === "ACCEPTED" ? "bg-emerald-600 text-white" : "bg-white text-slate-700"}`}><CheckCircle2 className="h-3.5 w-3.5" />Motif exact</button>
                              <button type="button" onClick={() => setDecisions(current => ({ ...current, [line.article_id]: "REJECTED" }))} className={`flex items-center gap-1 px-3 py-1.5 font-bold ${decision === "REJECTED" ? "bg-rose-600 text-white" : "bg-white text-slate-700"}`}><XCircle className="h-3.5 w-3.5" />Motif inexact</button>
                            </div>
                          </div>
                          <p className="mt-2 rounded-lg bg-slate-50 p-2 italic text-slate-700">« {line.reason || "Aucun motif"} »</p>
                          {decision === "REJECTED" && line.variance < 0 && <p className="mt-2 flex items-center gap-1 font-semibold text-rose-700"><ShieldAlert className="h-4 w-4" />Retenue : {money(Math.abs(line.variance_value))} au nom de {reviewCount.manager_signed_by_name || reviewCount.created_by_name}</p>}
                          {decision === "REJECTED" && line.variance > 0 && <p className="mt-2 text-slate-500">Excédent : aucune retenue, le stock sera simplement aligné.</p>}
                          {lineHints.length > 0 && <div className="mt-2"><Suggestions items={lineHints} title="Suggestions de contrôle" /></div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <label className="block text-xs font-semibold text-slate-600">Commentaire de l'administrateur
                  <textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-600">Total retenu : <strong className="text-rose-700">{money(reviewPreview.totalCharged)}</strong></p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || reviewCount.created_by === currentUser.uid} onClick={() => void runReview("reject")} className="rounded-xl border border-rose-300 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Rejeter le comptage</button>
                    <button type="button" disabled={busy || reviewCount.created_by === currentUser.uid} onClick={() => void runReview("validate")} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">Valider et ajuster le stock</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
