import { storeLabel } from "../services/storeLabel";
import { useState } from "react";
import { 
  StockMovement, 
  Store, 
  Article, 
  StockMovementType 
} from "../types";
import { 
  ArrowUpDown, 
  Search, 
  Filter, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2,
  FileText,
  Download,
  RotateCcw
} from "lucide-react";
import { downloadReportCsv, ReportColumn } from "../services/reportColumns";

interface MovementsViewProps {
  movements: StockMovement[];
  stores: Store[];
  articles: Article[];
}

export default function MovementsView({
  movements,
  stores,
  articles
}: MovementsViewProps) {
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const ALL_FLUX_TYPES: StockMovementType[] = [
    "PURCHASE",
    "CENTRAL_TO_POS",
    "CENTRAL_TO_RESELLER",
    "CENTRAL_TO_MANUFACTURER",
    "STORE_TO_STORE",
    "MANUFACTURER_TO_CENTRAL",
    "MANUFACTURER_TO_STORE",
    "SALE",
    "RETURN",
    "STORE_RETURN",
    "RECYCLING",
    "PRODUCTION",
    "CONSUMPTION",
    "INVENTORY_ADJUSTMENT",
    "LOSS",
    "EXPIRY"
  ];

  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || id;
  const getArticle = (id: string) => articles.find(a => a.id === id);
  const accessibleStoreIds = new Set(stores.map(store => store.id));
  const accessibleMovements = movements.filter(movement => {
    if (!accessibleStoreIds.has(movement.store_id)) return false;
    const store = stores.find(item => item.id === movement.store_id);
    const article = getArticle(movement.article_id);
    return (store?.store_type !== "POS" && store?.store_type !== "RESELLER") || article?.article_type === "RESALE";
  });

  const filteredMovements = accessibleMovements.filter((m) => {
    if (selectedType !== "ALL" && m.movement_type !== selectedType) return false;
    if (selectedStoreId !== "ALL" && m.store_id !== selectedStoreId) return false;
    if (dateFrom && m.created_at < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && m.created_at > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const art = getArticle(m.article_id);
      const storeName = getStoreName(m.store_id).toLowerCase();
      const matchRef = m.reference_number.toLowerCase().includes(q);
      const matchArt = art?.name.toLowerCase().includes(q) || art?.code.toLowerCase().includes(q);
      const matchStore = storeName.includes(q) || m.store_id.toLowerCase().includes(q);
      const matchOperator = m.created_by_name.toLowerCase().includes(q);
      if (!matchRef && !matchArt && !matchStore && !matchOperator) return false;
    }
    return true;
  });

  const resetFilters = () => {
    setSelectedType("ALL");
    setSelectedStoreId("ALL");
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  const handleExport = () => {
    const columns: ReportColumn<StockMovement>[] = [
      { key: "date", label: "Date / Heure", value: m => new Date(m.created_at).toLocaleString("fr-FR") },
      { key: "store", label: "Magasin", value: m => getStoreName(m.store_id) },
      { key: "type", label: "Type de Flux", value: m => m.movement_type },
      { key: "article", label: "Article", value: m => getArticle(m.article_id)?.name || "" },
      { key: "code", label: "Code Article", value: m => getArticle(m.article_id)?.code || "" },
      { key: "before", label: "Avant", value: m => m.before_quantity },
      { key: "variation", label: "Variation", value: m => m.quantity },
      { key: "after", label: "Après", value: m => m.after_quantity },
      { key: "reference", label: "Document Réf", value: m => m.reference_number },
      { key: "operator", label: "Opérateur", value: m => m.created_by_name }
    ];
    downloadReportCsv(`historique-mouvements-${new Date().toISOString().slice(0, 10)}.csv`, columns, filteredMovements);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Journal Immuable des Mouvements de Stock
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 9 & 10 : Traçabilité intégrale des 14 types de flux avec conservation du stock avant et du stock après.
          </p>
        </div>

        <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
          {accessibleMovements.length} Mouvements enregistrés
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-end justify-between">
        
        {/* Store */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Magasin :</label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tous les Magasins</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {storeLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Du :</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500" />
          <label className="text-xs font-bold text-slate-600">Au :</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Flux Type */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Type de Flux (14 flux) :</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tous les Flux</option>
            {ALL_FLUX_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {ft}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher document, article..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={resetFilters} title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
          <button type="button" onClick={handleExport} disabled={filteredMovements.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Exporter ({filteredMovements.length})
          </button>
        </div>

      </div>

      {/* Movements Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">Date / Heure</th>
                <th className="py-3 px-3">Magasin</th>
                <th className="py-3 px-3">Type de Flux</th>
                <th className="py-3 px-3">Article</th>
                <th className="py-3 px-3 text-right">Avant</th>
                <th className="py-3 px-3 text-right">Variation</th>
                <th className="py-3 px-3 text-right">Après</th>
                <th className="py-3 px-3">Document Réf</th>
                <th className="py-3 px-3">Opérateur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.map((m) => {
                const art = getArticle(m.article_id);
                const isPositive = m.quantity > 0;
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {new Date(m.created_at).toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {getStoreName(m.store_id)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.movement_type === "PURCHASE" ? "bg-blue-100 text-blue-800" :
                        m.movement_type === "SALE" ? "bg-emerald-100 text-emerald-800" :
                        m.movement_type === "PRODUCTION" ? "bg-purple-100 text-purple-800" :
                        m.movement_type === "CONSUMPTION" ? "bg-rose-100 text-rose-800" :
                        m.movement_type === "RETURN" ? "bg-amber-100 text-amber-800" :
                        m.movement_type === "INVENTORY_ADJUSTMENT" ? "bg-indigo-100 text-indigo-800" :
                        "bg-slate-100 text-slate-800"
                      }`}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{art?.name}</div>
                      <span className="font-mono text-[10px] text-slate-400 font-bold">[{art?.code}]</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                      {m.before_quantity}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono font-black ${
                      isPositive ? "text-emerald-700 bg-emerald-50/50" : "text-rose-700 bg-rose-50/50"
                    }`}>
                      {isPositive ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {m.after_quantity}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-blue-700 font-semibold text-[11px]">
                      {m.reference_number}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {m.created_by_name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
