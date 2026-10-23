import { useState, FormEvent } from "react";
import MaterialConsumptionForm from "./MaterialConsumptionForm";
import { 
  Production, 
  ProductionConsumptionLine, 
  ProductionOutputLine, 
  Store, 
  Article, 
  StoreStock, 
  UserProfile, 
  StockTransfer,
  RecyclingDecision,
  RETURN_REASON_LABELS,
  RECYCLING_DECISION_LABELS
} from "../types";
import { generateRef, getArticleStock } from "../services/stockService";
import { 
  Factory, 
  Plus, 
  CheckCircle2, 
  ArrowRight, 
  RotateCcw, 
  X, 
  Trash2, 
  Boxes, 
  Layers,
  FlaskConical,
  Sparkles,
  ArrowRightLeft,
  Pencil
} from "lucide-react";

interface ProductionViewProps {
  onConsumeMaterial: (storeId: string, articleId: string, quantity: number, reason: string) => Promise<void>;
  productions: Production[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateProduction: (prod: Production) => Promise<boolean>;
  onUpdateDraftProduction: (original: Production, updated: Production) => Promise<boolean>;
  onDeleteDraftProduction: (production: Production) => Promise<void>;
  onInitiateReturn: (transfer: StockTransfer) => void;
  transfers: StockTransfer[];
  onDecideRecycling: (
    transferId: string,
    decisions: Array<{ lineId: string; decision: RecyclingDecision; note?: string }>
  ) => Promise<boolean>;
}

export default function ProductionView({
  onConsumeMaterial,
  productions,
  stores,
  articles,
  stocks,
  currentUser,
  onCreateProduction,
  onUpdateDraftProduction,
  onDeleteDraftProduction,
  onInitiateReturn,
  transfers,
  onDecideRecycling
}: ProductionViewProps) {
  const [recyclingChoices, setRecyclingChoices] = useState<Record<string, { decision: RecyclingDecision; note: string }>>({});
  const recyclingTransfers = transfers.filter(transfer =>
    transfer.type === "RECYCLING"
    && ["VALIDATED", "DISCREPANCY"].includes(transfer.status)
    && currentUser.storeIds.includes(transfer.destination_store_id)
    && transfer.lines.some(line => line.quantity_accepted > 0 && !line.recycling_decision)
  );
  const recyclingSummary = Object.entries(
    transfers
      .filter(transfer => transfer.type === "RECYCLING" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status))
      .flatMap(transfer => transfer.lines)
      .reduce<Record<string, { received: number; recycled: number; destroyed: number; destroyedValue: number }>>((summary, line) => {
        const key = line.return_reason || "NONE";
        const row = summary[key] || { received: 0, recycled: 0, destroyed: 0, destroyedValue: 0 };
        row.received += line.quantity_accepted;
        if (line.recycling_decision === "RECYCLED") row.recycled += line.quantity_accepted;
        if (line.recycling_decision === "DESTROYED") {
          row.destroyed += line.quantity_accepted;
          row.destroyedValue += line.quantity_accepted * (articles.find(article => article.id === line.article_id)?.prix_achat || 0);
        }
        summary[key] = row;
        return summary;
      }, {})
  );
  const handleDecide = async (transfer: StockTransfer) => {
    const decisions = transfer.lines
      .filter(line => line.quantity_accepted > 0 && !line.recycling_decision && recyclingChoices[line.id])
      .map(line => ({ lineId: line.id, decision: recyclingChoices[line.id].decision, note: recyclingChoices[line.id].note.trim() || undefined }));
    if (decisions.length === 0) {
      alert("Choisissez une décision pour au moins une ligne.");
      return;
    }
    if (await onDecideRecycling(transfer.id, decisions)) {
      setRecyclingChoices(current => {
        const next = { ...current };
        decisions.forEach(item => delete next[item.lineId]);
        return next;
      });
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [editingProduction, setEditingProduction] = useState<Production | null>(null);

  // Manufacturer store
  const manufStore = stores.find(s => s.store_type === "MANUFACTURER") || stores[0];
  const centralStore = stores.find(s => s.store_type === "CENTRAL_WAREHOUSE") || stores[0];

  const rawArticles = articles.filter(a => a.article_type === "RAW_MATERIAL");
  const outputArticles = articles.filter(a => a.is_active);

  // Production Form State
  const [consumptions, setConsumptions] = useState<Array<{ article_id: string; quantity: number }>>([
    { article_id: rawArticles[0]?.id || "", quantity: 10 }
  ]);
  const [outputs, setOutputs] = useState<Array<{ article_id: string; quantity: number }>>([
    { article_id: outputArticles[0]?.id || "", quantity: 5 }
  ]);
  const [batchNote, setBatchNote] = useState("");

  // Return Form State (Return unused raw materials to central warehouse)
  const [returnArticleId, setReturnArticleId] = useState(rawArticles[0]?.id || "");
  const [returnQuantity, setReturnQuantity] = useState(5);
  const [returnReason, setReturnReason] = useState("Surplus de production non consommé");

  const [recycledConsumptions, setRecycledConsumptions] = useState<Array<{ article_id: string; quantity: number }>>([]);
  const recycledAvailability = (articleId: string) => {
    const approved = transfers
      .filter(transfer => transfer.type === "RECYCLING" && transfer.destination_store_id === manufStore?.id)
      .flatMap(transfer => transfer.lines)
      .filter(line => line.article_id === articleId && line.recycled_available && line.recycling_decision === "RECYCLED")
      .reduce((sum, line) => sum + line.quantity_accepted, 0);
    const used = productions
      .filter(production => production.id !== editingProduction?.id && production.manufacturer_store_id === manufStore?.id)
      .flatMap(production => production.consumptions)
      .filter(line => line.source === "RECYCLED" && line.article_id === articleId)
      .reduce((sum, line) => sum + line.quantity, 0);
    const quarantine = stocks.find(stock => stock.store_id === manufStore?.id && stock.article_id === articleId)?.quarantine_quantity || 0;
    return Math.max(0, Math.min(approved - used, quarantine));
  };
  const recycledArticles = articles.filter(article => recycledAvailability(article.id) > 0);
  const recycledConsumedTotal = productions
    .flatMap(production => production.consumptions)
    .filter(line => line.source === "RECYCLED")
    .reduce((sum, line) => sum + line.quantity, 0);

  const handleOpenProductionModal = () => {
    setRecycledConsumptions([]);
    setEditingProduction(null);
    setConsumptions([{ article_id: rawArticles[0]?.id || "", quantity: 10 }]);
    setOutputs([{ article_id: outputArticles[0]?.id || "", quantity: 5 }]);
    setBatchNote("");
    setIsModalOpen(true);
  };

  const handleOpenEditProductionModal = (production: Production) => {
    if (production.status !== "DRAFT" || production.created_by !== currentUser.uid) return;
    setEditingProduction(production);
    const rawLines = production.consumptions.filter(line => line.source !== "RECYCLED");
    setConsumptions(rawLines.length > 0 ? rawLines.map(line => ({ article_id: line.article_id, quantity: line.quantity })) : []);
    setRecycledConsumptions(production.consumptions.filter(line => line.source === "RECYCLED").map(line => ({ article_id: line.article_id, quantity: line.quantity })));
    setOutputs(production.outputs.map(line => ({ article_id: line.article_id, quantity: line.quantity })));
    setBatchNote(production.notes || "");
    setIsModalOpen(true);
  };

  const handleAddConsumptionLine = () => {
    setConsumptions([...consumptions, { article_id: rawArticles[0]?.id || "", quantity: 5 }]);
  };

  const handleAddOutputLine = () => {
    setOutputs([...outputs, { article_id: outputArticles[0]?.id || "", quantity: 5 }]);
  };

  const handleSubmitProduction = async (e: FormEvent) => {
    e.preventDefault();
    const recycledTotals = recycledConsumptions.reduce<Record<string, number>>((totals, line) => {
      totals[line.article_id] = (totals[line.article_id] || 0) + line.quantity;
      return totals;
    }, {});
    if (Object.entries(recycledTotals).some(([articleId, total]) => Number(total) > recycledAvailability(articleId))) {
      alert("La quantité recyclée demandée dépasse le stock à recycler disponible.");
      return;
    }
    if (
      consumptions.length + recycledConsumptions.length === 0 ||
      outputs.length === 0 ||
      recycledConsumptions.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || !line.article_id) ||
      consumptions.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || !rawArticles.some(article => article.id === line.article_id)) ||
      outputs.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0 || !outputArticles.some(article => article.id === line.article_id))
    ) {
      alert("Veuillez renseigner au moins une matière première consommée et un article fabriqué.");
      return;
    }

    const prodNumber = generateRef("PRD", productions.length);

    const consumptionLines: ProductionConsumptionLine[] = [
      ...consumptions.map(c => ({ ...c, recycled: false })),
      ...recycledConsumptions.map(c => ({ ...c, recycled: true }))
    ].map((c, idx) => {
      const art = articles.find(a => a.id === c.article_id);
      return {
        id: editingProduction?.consumptions[idx]?.id || `cons-${Date.now()}-${idx}`,
        article_id: c.article_id,
        article_code: art?.code || "MP",
        article_name: art?.name || "Matière Première",
        unit: art?.unit || "Kg",
        quantity: Number(c.quantity),
        ...(c.recycled ? { source: "RECYCLED" as const } : {})
      };
    });

    const outputLines: ProductionOutputLine[] = outputs.map((o, idx) => {
      const art = articles.find(a => a.id === o.article_id);
      return {
        id: editingProduction?.outputs[idx]?.id || `out-${Date.now()}-${idx}`,
        article_id: o.article_id,
        article_code: art?.code || "PF",
        article_name: art?.name || "Produit Fini",
        unit: art?.unit || "Unité",
        quantity: Number(o.quantity)
      };
    });

    const newProd: Production = editingProduction ? {
      ...editingProduction,
      consumptions: consumptionLines,
      outputs: outputLines,
      notes: batchNote
    } : {
      id: `prod-${Date.now()}`,
      production_number: prodNumber,
      manufacturer_store_id: manufStore.id,
      status: "COMPLETED",
      consumptions: consumptionLines,
      outputs: outputLines,
      notes: batchNote || "Lot de fabrication standard",
      created_by: currentUser.uid,
      created_by_name: currentUser.displayName || currentUser.email,
      validated_by: currentUser.uid,
      validated_by_name: currentUser.displayName || currentUser.email,
      created_at: Date.now(),
      validated_at: Date.now()
    };

    const saved = editingProduction
      ? await onUpdateDraftProduction(editingProduction, newProd)
      : await onCreateProduction(newProd);
    if (saved) {
      setEditingProduction(null);
      setIsModalOpen(false);
    }
  };

  const handleSubmitReturn = (e: FormEvent) => {
    e.preventDefault();
    const art = articles.find(a => a.id === returnArticleId);
    if (!art) return;

    const trfNumber = generateRef("RET", 99);
    const returnTransfer: StockTransfer = {
      id: `trf-return-${Date.now()}`,
      transfer_number: trfNumber,
      type: "RETURN",
      source_store_id: manufStore.id,
      destination_store_id: centralStore.id,
      status: "DRAFT",
      requested_by: currentUser.uid,
      requested_by_name: currentUser.displayName || currentUser.email,
      lines: [
        {
          id: `ret-line-${Date.now()}`,
          transfer_id: `trf-return-${Date.now()}`,
          article_id: art.id,
          article_code: art.code,
          article_name: art.name,
          unit: art.unit,
          quantity_sent: Number(returnQuantity),
          quantity_received: 0,
          quantity_accepted: 0,
          quantity_rejected: 0,
          note: returnReason
        }
      ],
      note: `Déclaration de retour de MP non consommée : ${returnReason}`,
      has_discrepancy: false,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    onInitiateReturn(returnTransfer);
    setIsReturnModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <MaterialConsumptionForm stores={stores} articles={articles} stocks={stocks} user={currentUser} onConsume={onConsumeMaterial} />
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Magasin de Production & Laboratoire
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Consommation de matières premières et fabrication de matières premières ou de produits finis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsReturnModalOpen(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retour MP vers Dépôt Central
          </button>
          <button
            type="button"
            onClick={handleOpenProductionModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nouvel Ordre de Fabrication
          </button>
        </div>
      </div>

      {/* Principle Schema Banner (Section 6) */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-700">
          Flux de Production GILEADA (Règle N°6)
        </span>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <span className="text-indigo-400 font-bold block mb-1">1. ENTRÉE / STOCKAGE</span>
            Dépôt Central → Transfert validé → Stock Matières Premières (Atelier).
          </div>
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <span className="text-rose-400 font-bold block mb-1">2. CONSOMMATION IMMÉDIATE</span>
            Diminue immédiatement le stock MP du laboratoire lors de la fabrication.
          </div>
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <span className="text-emerald-400 font-bold block mb-1">3. ARTICLES FABRIQUÉS</span>
            Crédite les matières premières ou produits finis fabriqués, prêts à transférer vers les magasins.
          </div>
        </div>
      </div>

      {recyclingTransfers.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-300 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Articles retournés à traiter (recyclage)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Reçus du dépôt, ces articles restent en stock de production tant qu'aucune décision n'est prise. « Recyclé » les met à disposition des ordres de fabrication (consommation tracée), « Détruit » les passe en perte.
            </p>
          </div>
          {recyclingTransfers.map(transfer => (
            <div key={transfer.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="font-mono text-xs font-black text-indigo-900">{transfer.transfer_number}</div>
              {transfer.lines.filter(line => line.quantity_accepted > 0 && !line.recycling_decision).map(line => (
                <div key={line.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{line.article_name}</span>
                    <span className="text-slate-500"> — {line.quantity_accepted} {line.unit}</span>
                    {line.return_reason && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">{RETURN_REASON_LABELS[line.return_reason]}</span>}
                    {line.expiry_date && <span className="ml-2 text-slate-500">DLC {line.expiry_date}</span>}
                  </div>
                  <select
                    value={recyclingChoices[line.id]?.decision || ""}
                    onChange={event => setRecyclingChoices(current => ({
                      ...current,
                      [line.id]: { decision: event.target.value as RecyclingDecision, note: current[line.id]?.note || "" }
                    }))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5"
                  >
                    <option value="" disabled>Décision…</option>
                    {(Object.keys(RECYCLING_DECISION_LABELS) as RecyclingDecision[]).map(decision => (
                      <option key={decision} value={decision}>{RECYCLING_DECISION_LABELS[decision]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Note (optionnel)"
                    value={recyclingChoices[line.id]?.note || ""}
                    disabled={!recyclingChoices[line.id]}
                    onChange={event => setRecyclingChoices(current => ({ ...current, [line.id]: { ...current[line.id], note: event.target.value } }))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 disabled:bg-slate-50"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => void handleDecide(transfer)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
              >
                Valider les décisions
              </button>
            </div>
          ))}
        </div>
      )}

      {recyclingSummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Bilan des retours par motif</h3>
          <p className="mb-2 text-[11px] text-emerald-700">♻ Recyclé consommé en fabrication : <span className="font-mono font-bold">{recycledConsumedTotal}</span></p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-1.5">Motif</th>
                <th className="py-1.5 text-right">Reçu</th>
                <th className="py-1.5 text-right">Recyclé</th>
                <th className="py-1.5 text-right">Détruit</th>
                <th className="py-1.5 text-right">À traiter</th>
                <th className="py-1.5 text-right">Perte (Ar)</th>
              </tr>
            </thead>
            <tbody>
              {recyclingSummary.map(([reason, row]) => (
                <tr key={reason} className="border-b border-slate-50">
                  <td className="py-1.5 font-semibold text-slate-800">{reason === "NONE" ? "Non précisé" : RETURN_REASON_LABELS[reason as keyof typeof RETURN_REASON_LABELS]}</td>
                  <td className="py-1.5 text-right font-mono">{row.received}</td>
                  <td className="py-1.5 text-right font-mono text-emerald-700">{row.recycled}</td>
                  <td className="py-1.5 text-right font-mono text-rose-700">{row.destroyed}</td>
                  <td className="py-1.5 text-right font-mono text-amber-700">{row.received - row.recycled - row.destroyed}</td>
                  <td className="py-1.5 text-right font-mono text-rose-700">{row.destroyedValue.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Production History */}
      <div className="space-y-4">
        {productions.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                  {p.production_number}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  Opérateur : {p.created_by_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-xs px-2.5 py-0.5 rounded-full border ${p.status === "DRAFT" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-emerald-100 text-emerald-800 border-emerald-300"}`}>
                  {p.status}
                </span>
                {p.status === "DRAFT" && p.created_by === currentUser.uid && (
                  <button type="button" onClick={() => handleOpenEditProductionModal(p)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50">
                    <Pencil className="h-3 w-3" /> Modifier
                  </button>
                )}
                {p.status === "DRAFT" && currentUser.roleId === "SUPER_ADMIN" && (
                  <button type="button" onClick={() => {
                    if (window.confirm(`Supprimer le brouillon ${p.production_number} ?`)) void onDeleteDraftProduction(p);
                  }} className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50">
                    <Trash2 className="h-3 w-3" /> Supprimer
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              
              {/* Consumed Raw Materials */}
              <div className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-200 text-xs">
                <div className="font-bold text-rose-800 mb-2 flex items-center gap-1.5">
                  <Layers className="h-4 w-4" />
                  Matières Premières Consommées (Sortie de stock MP) :
                </div>
                <div className="space-y-1.5">
                  {p.consumptions.map((c) => (
                    <div key={c.id} className="flex justify-between items-center">
                      <span className="font-medium text-slate-800">[{c.article_code}] {c.article_name}{c.source === "RECYCLED" && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">♻ recyclé</span>}</span>
                      <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                        -{c.quantity} {c.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manufactured Finished Goods */}
              <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200 text-xs">
                <div className="font-bold text-emerald-800 mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Articles fabriqués (entrée en stock) :
                </div>
                <div className="space-y-1.5">
                  {p.outputs.map((o) => (
                    <div key={o.id} className="flex justify-between items-center">
                      <span className="font-medium text-slate-800">[{o.article_code}] {o.article_name}</span>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        +{o.quantity} {o.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500 italic">
              Observation : "{p.notes}"
            </div>
          </div>
        ))}
      </div>

      {/* NEW PRODUCTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">{editingProduction ? `Modifier le brouillon ${editingProduction.production_number}` : "Nouvel Ordre de Fabrication Laboratoire"}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitProduction} className="mt-4 space-y-4 text-xs">
              
              {/* Consumptions Block */}
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-rose-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    1. Matières Premières à consommer :
                  </label>
                  <button
                    type="button"
                    onClick={handleAddConsumptionLine}
                    className="font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter MP
                  </button>
                </div>

                <div className="space-y-2">
                  {consumptions.map((c, idx) => {
                    const stockAvail = getArticleStock(stocks, manufStore.id, c.article_id);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={c.article_id}
                          onChange={(e) => {
                            const newCons = [...consumptions];
                            newCons[idx].article_id = e.target.value;
                            setConsumptions(newCons);
                          }}
                          className="flex-1 bg-white border border-slate-300 rounded-lg p-2 font-medium"
                        >
                          {rawArticles.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.code}] {a.name} ({a.unit})
                            </option>
                          ))}
                        </select>

                        <div className="w-24">
                          <input
                            type="number"
                            min="1"
                            value={c.quantity}
                            onChange={(e) => {
                              const newCons = [...consumptions];
                              newCons[idx].quantity = Math.max(1, Number(e.target.value));
                              setConsumptions(newCons);
                            }}
                            className="w-full text-right font-mono font-bold text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                            placeholder="Qté consommée"
                          />
                        </div>

                        <span className="text-[10px] text-slate-400 font-mono w-20 text-right">
                          Stock labo: {stockAvail}
                        </span>

                        {consumptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setConsumptions(consumptions.filter((_, i) => i !== idx))}
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-rose-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-800">♻ Articles recyclés à consommer (stock à recycler) :</span>
                    <button
                      type="button"
                      disabled={recycledArticles.length === 0}
                      onClick={() => setRecycledConsumptions([...recycledConsumptions, { article_id: recycledArticles[0].id, quantity: 1 }])}
                      className="font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" /> Ajouter recyclé
                    </button>
                  </div>
                  {recycledArticles.length === 0 && recycledConsumptions.length === 0 && (
                    <p className="text-[11px] text-slate-500">Aucun article recyclé disponible.</p>
                  )}
                  <div className="space-y-2">
                    {recycledConsumptions.map((c, idx) => {
                      const available = recycledAvailability(c.article_id);
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={c.article_id}
                            onChange={(e) => setRecycledConsumptions(recycledConsumptions.map((line, i) => i === idx ? { ...line, article_id: e.target.value } : line))}
                            className="flex-1 bg-white border border-slate-300 rounded-lg p-2 font-medium"
                          >
                            {articles.filter(a => recycledAvailability(a.id) > 0 || a.id === c.article_id).map(a => (
                              <option key={a.id} value={a.id}>[{a.code}] {a.name} ({a.unit})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            max={available}
                            value={c.quantity}
                            onChange={(e) => setRecycledConsumptions(recycledConsumptions.map((line, i) => i === idx ? { ...line, quantity: Math.max(1, Number(e.target.value)) } : line))}
                            className="w-24 text-right font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                          />
                          <span className="text-[10px] text-slate-400 font-mono w-24 text-right">À recycler: {available}</span>
                          <button
                            type="button"
                            onClick={() => setRecycledConsumptions(recycledConsumptions.filter((_, i) => i !== idx))}
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Outputs Block */}
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    2. Articles à fabriquer : matières premières ou produits finis
                  </label>
                  <button
                    type="button"
                    onClick={handleAddOutputLine}
                    className="font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter un article
                  </button>
                </div>

                <div className="space-y-2">
                  {outputs.map((o, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={o.article_id}
                        onChange={(e) => {
                          const newOuts = [...outputs];
                          newOuts[idx].article_id = e.target.value;
                          setOutputs(newOuts);
                        }}
                        className="flex-1 bg-white border border-slate-300 rounded-lg p-2 font-medium"
                      >
                        {outputArticles.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.code}] {a.name} ({a.unit}) — {a.article_type === "RAW_MATERIAL" ? "Matière première" : "Produit fini"}
                          </option>
                        ))}
                      </select>

                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          value={o.quantity}
                          onChange={(e) => {
                            const newOuts = [...outputs];
                            newOuts[idx].quantity = Math.max(1, Number(e.target.value));
                            setOutputs(newOuts);
                          }}
                          className="w-full text-right font-mono font-bold text-emerald-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                          placeholder="Qté fabriquée"
                        />
                      </div>

                      {outputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setOutputs(outputs.filter((_, i) => i !== idx))}
                          className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Batch note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  N° de Lot & Observations de laboratoire :
                </label>
                <input
                  type="text"
                  value={batchNote}
                  onChange={(e) => setBatchNote(e.target.value)}
                  placeholder="Ex: Lot de distillation cuve #2, rendement conforme..."
                  className="w-full text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              {/* Submit */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
                >
                  {editingProduction ? "Enregistrer les modifications" : "Enregistrer & Valider la Production"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DECLARE RETURN OF UNUSED RAW MATERIAL (Section 6) */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Retour de Matières Premières Non Consommées
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReturn} className="mt-3 space-y-3">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
                <strong>Règle Métier GILEADA :</strong> Le dépôt central ne sera recrédité qu'après contrôle et validation de la réception.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Matière Première à retourner :
                </label>
                <select
                  value={returnArticleId}
                  onChange={(e) => setReturnArticleId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                >
                  {rawArticles.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.code}] {a.name} ({a.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Quantité retournée :</label>
                <input
                  type="number"
                  min="1"
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(Number(e.target.value))}
                  className="w-full font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif du retour :</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full text-slate-900 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                >
                  Déclarer le Retour (Workflow Contrôlé)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
