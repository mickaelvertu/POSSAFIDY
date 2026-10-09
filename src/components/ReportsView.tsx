import { useMemo, useState } from "react";
import { 
  ReportType, 
  GeneralFilters, 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  StockTransfer, 
  StockMovement, 
  Sale, 
  Production, 
  AuditLog, 
  UserProfile,
  StockMovementType,
  MovementDirection,
  ArticleTypeCode
} from "../types";
import { filterReportData, getReportKpis } from "../services/reportService";
import { 
  FileText, 
  Printer, 
  Filter, 
  Calendar, 
  Building2, 
  CheckSquare, 
  Square, 
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  Boxes,
  ArrowRightLeft,
  Truck,
  AlertTriangle,
  Factory,
  RotateCcw,
  ShieldAlert
} from "lucide-react";

interface ReportsViewProps {
  stores: Store[];
  categories: Category[];
  articles: Article[];
  stocks: StoreStock[];
  transfers: StockTransfer[];
  movements: StockMovement[];
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
  currentUser: UserProfile;
  onOpenReportViewer: (type: ReportType, filters: GeneralFilters) => void;
}

export default function ReportsView({
  stores,
  categories,
  articles,
  stocks,
  transfers,
  movements,
  sales,
  productions,
  auditLogs,
  currentUser,
  onOpenReportViewer
}: ReportsViewProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType>("STOCK_STATUS");

  // Comprehensive mandatory filters (Section 12)
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedMovementTypes, setSelectedMovementTypes] = useState<StockMovementType[]>([]);
  const [movementDirection, setMovementDirection] = useState<MovementDirection>("ALL");
  const [articleType, setArticleType] = useState<"ALL" | ArticleTypeCode>("ALL");
  const [searchRef, setSearchRef] = useState<string>("");
  const [minQty, setMinQty] = useState<number | undefined>(undefined);
  const [maxQty, setMaxQty] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState<string>("");

  const REPORTS_CATALOG: Array<{
    type: ReportType;
    number: number;
    title: string;
    description: string;
    icon: any;
    color: string;
  }> = [
    { type: "STOCK_STATUS", number: 1, title: "État du stock", description: "Quantités disponibles par magasin, catégorie et valorisation", icon: Boxes, color: "text-blue-600 bg-blue-50 border-blue-200" },
    { type: "STOCK_MOVEMENTS", number: 2, title: "Mouvements de stock", description: "Traçabilité des 14 types de flux avec stocks avant/après", icon: SlidersHorizontal, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
    { type: "STOCK_LEDGER", number: 14, title: "Grille des mouvements (Excel)", description: "Par article : stock avant, puis chaque variation (+4 transfert, −1 vente…) et stock après", icon: SlidersHorizontal, color: "text-cyan-600 bg-cyan-50 border-cyan-200" },
    { type: "TRANSFERS", number: 3, title: "Transferts", description: "Registre des expéditions entre dépôt central et points de vente", icon: ArrowRightLeft, color: "text-amber-600 bg-amber-50 border-amber-200" },
    { type: "RECEIPTS", number: 4, title: "Réceptions", description: "Rapport de conformité des réceptions contrôlées", icon: Truck, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { type: "DISCREPANCIES", number: 5, title: "Écarts", description: "Anomalies, rejets de livraison et avaries de transport", icon: AlertTriangle, color: "text-rose-600 bg-rose-50 border-rose-200" },
    { type: "SALES", number: 6, title: "Ventes consolidées", description: "Journal des ventes et encaissements caisse POS & Revendeurs", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { type: "SALES_BY_CUSTOMER", number: 7, title: "Ventes par client", description: "Analyse du chiffre d'affaires et fidélité clientèle", icon: TrendingUp, color: "text-teal-600 bg-teal-50 border-teal-200" },
    { type: "SALES_BY_ARTICLE", number: 8, title: "Ventes par article", description: "Volumes et montants vendus par article et conditionnement", icon: Boxes, color: "text-blue-600 bg-blue-50 border-blue-200" },
    { type: "SALES_BY_CATEGORY", number: 9, title: "Ventes par catégorie", description: "Performances commerciales des gammes de produits", icon: SlidersHorizontal, color: "text-purple-600 bg-purple-50 border-purple-200" },
    { type: "RAW_MATERIAL_CONSUMPTION", number: 10, title: "Consommation MP", description: "Quantités de matières premières consommées par l'atelier", icon: Factory, color: "text-rose-600 bg-rose-50 border-rose-200" },
    { type: "PRODUCTION", number: 11, title: "Production", description: "Rendements de fabrication et lots de produits finis", icon: Factory, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
    { type: "RETURNS", number: 12, title: "Retours", description: "Surplus et matières premières retournées au dépôt central", icon: RotateCcw, color: "text-amber-600 bg-amber-50 border-amber-200" },
    { type: "AUDIT_LOG", number: 13, title: "Journal d'audit", description: "Traçabilité des opérations sensibles, utilisateurs et appareils", icon: ShieldAlert, color: "text-slate-800 bg-slate-100 border-slate-300" }
  ];

  const filters = useMemo<GeneralFilters>(() => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    storeIds: selectedStoreIds,
    statuses: selectedStatuses,
    movementTypes: selectedMovementTypes,
    movementDirection,
    categoryIds: selectedCategoryIds,
    articleType,
    searchRef: searchRef || undefined,
    minQty,
    maxQty,
    customerName: customerName || undefined
  }), [startDate, endDate, selectedStoreIds, selectedStatuses, selectedMovementTypes, movementDirection, selectedCategoryIds, articleType, searchRef, minQty, maxQty, customerName]);

  const filteredData = useMemo(() => filterReportData({
    articles,
    stores,
    stocks,
    transfers,
    movements,
    sales,
    productions,
    auditLogs
  }, filters), [articles, stores, stocks, transfers, movements, sales, productions, auditLogs, filters]);
  const kpiData = useMemo(() => ({
    ...filteredData,
    transfers: selectedReport === "RETURNS"
      ? filteredData.transfers.filter(transfer => transfer.type === "RETURN")
      : selectedReport === "RECEIPTS"
        ? filteredData.transfers.filter(transfer => transfer.status === "RECEIVED" || transfer.status === "VALIDATED")
        : selectedReport === "DISCREPANCIES"
          ? filteredData.transfers.filter(transfer => transfer.has_discrepancy || transfer.status === "DISCREPANCY" || transfer.lines.some(line => line.quantity_rejected > 0))
          : filteredData.transfers
  }), [filteredData, selectedReport]);
  const kpis = useMemo(() => getReportKpis(selectedReport, kpiData, categories, filters), [selectedReport, kpiData, categories, filters]);
  const statusOptions = selectedReport.startsWith("SALES")
    ? ["DRAFT", "CHECKING", "VERIFIED", "VALIDATED", "CANCELLED", "REFUNDED"]
    : selectedReport === "PRODUCTION" || selectedReport === "RAW_MATERIAL_CONSUMPTION"
      ? ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
      : ["TRANSFERS", "RECEIPTS", "DISCREPANCIES", "RETURNS"].includes(selectedReport)
        ? ["DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED", "VALIDATED", "DISCREPANCY", "CANCELLED"]
        : selectedReport === "AUDIT_LOG"
          ? [...new Set(auditLogs.map(log => log.action))]
          : [];
  const movementTypeOptions = [...new Set(movements.map(movement => movement.movement_type))];

  // Helper toggle for multi-select
  const toggleStore = (id: string) => {
    if (selectedStoreIds.includes(id)) {
      setSelectedStoreIds(selectedStoreIds.filter(s => s !== id));
    } else {
      setSelectedStoreIds([...selectedStoreIds, id]);
    }
  };

  const toggleCategory = (id: string) => {
    if (selectedCategoryIds.includes(id)) {
      setSelectedCategoryIds(selectedCategoryIds.filter(c => c !== id));
    } else {
      setSelectedCategoryIds([...selectedCategoryIds, id]);
    }
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(current => current.includes(status) ? current.filter(item => item !== status) : [...current, status]);
  };

  const toggleMovementType = (type: StockMovementType) => {
    setSelectedMovementTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type]);
  };

  const handleLaunchReport = () => {
    onOpenReportViewer(selectedReport, filters);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Les 14 Rapports Officiels GILEADA
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 12 & 13 : Rapports certifiés reproductibles avec en-tête GILEADA, filtres actifs, totaux consolidés et pagination.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLaunchReport}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Printer className="h-4 w-4" />
          Générer & Imprimer le Rapport Officiel
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs du rapport filtré">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{kpi.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      {/* Grid of 13 Reports Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {REPORTS_CATALOG.map((rep) => {
          const isSelected = selectedReport === rep.type;
          const IconComp = rep.icon;
          return (
            <div
              key={rep.type}
              onClick={() => setSelectedReport(rep.type)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                isSelected 
                  ? "bg-blue-50/60 border-blue-500 shadow-md ring-2 ring-blue-500/20" 
                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-400">
                    N° {rep.number}
                  </span>
                  <div className={`p-2 rounded-xl border ${rep.color}`}>
                    <IconComp className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mt-2">{rep.title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {rep.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                <span className={isSelected ? "text-blue-700" : "text-slate-400"}>
                  {isSelected ? "Sélectionné" : "Choisir"}
                </span>
                <ChevronRight className={`h-4 w-4 ${isSelected ? "text-blue-600" : "text-slate-300"}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mandatory Filters Panel (Section 12) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Filtres Obligatoires pour ce Rapport (Règle Métier N°12)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setSelectedStoreIds([]);
              setSelectedCategoryIds([]);
              setSelectedStatuses([]);
              setSelectedMovementTypes([]);
              setMovementDirection("ALL");
              setArticleType("ALL");
              setSearchRef("");
              setMinQty(undefined);
              setMaxQty(undefined);
              setCustomerName("");
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
          >
            Réinitialiser les filtres
          </button>
        </div>

        {/* Row 1: Date Range, Article Type, Search Ref */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          
          {(statusOptions.length > 0 || selectedReport === "STOCK_MOVEMENTS" || selectedReport === "STOCK_LEDGER") && <div>
            <label className="block font-bold text-slate-700 mb-1">Date Début :</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Date Fin :</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Type d'Article :</label>
            <select
              value={articleType}
              onChange={(e) => setArticleType(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
            >
              <option value="ALL">Tous les Types</option>
              <option value="RESALE">RESALE (Revente)</option>
              <option value="RAW_MATERIAL">RAW_MATERIAL (Matière Première)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Numéro / Réf (Recherche) :</label>
            <input
              type="text"
              placeholder="Ex: TRF-2026, VTE-2026, PRD..."
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
          </div>

        </div>

        {/* Row 2: Multi-selection Stores */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Magasins & Entrepôts (Multi-sélection) :
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {stores.map((s) => {
              const isChecked = selectedStoreIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStore(s.id)}
                  className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    isChecked 
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs" 
                      : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {isChecked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  {s.name} ({s.code})
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Multi-selection Categories */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Catégories de Produits (Multi-sélection) :
          </label>
          <div className="flex flex-wrap gap-2 text-xs">
            {categories.map((c) => {
              const isChecked = selectedCategoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    isChecked 
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs" 
                      : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {isChecked ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 4: Client & Quantity bounds */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Nom du Client (pour Ventes) :</label>
            <input
              type="text"
              placeholder="Ex: Pharmacie, Mme Marie..."
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Quantité Min :</label>
            <input
              type="number"
              value={minQty !== undefined ? minQty : ""}
              onChange={(e) => setMinQty(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Min..."
              className="w-full font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Quantité Max :</label>
            <input
              type="number"
              value={maxQty !== undefined ? maxQty : ""}
              onChange={(e) => setMaxQty(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Max..."
              className="w-full font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-4">
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">Statuts inclus :</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(status => {
                const isSelected = selectedStatuses.includes(status);
                return <button key={status} type="button" aria-pressed={isSelected} onClick={() => toggleStatus(status)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${isSelected ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>{status}</button>;
              })}
            </div>
          </div>
          {(selectedReport === "STOCK_MOVEMENTS" || selectedReport === "STOCK_LEDGER") && (
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">Sens du mouvement :</p>
              <div className="flex flex-wrap gap-2">
                {([["ALL", "Entrées et sorties"], ["IN", "Entrées (+)"], ["OUT", "Sorties (−)"]] as Array<[MovementDirection, string]>).map(([direction, label]) => (
                  <button key={direction} type="button" aria-pressed={movementDirection === direction} onClick={() => setMovementDirection(direction)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${movementDirection === direction ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>{label}</button>
                ))}
              </div>
            </div>
          )}
          {(selectedReport === "STOCK_MOVEMENTS" || selectedReport === "STOCK_LEDGER") && movementTypeOptions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold text-slate-700">Types de mouvement :</p>
              <div className="flex flex-wrap gap-2">
                {movementTypeOptions.map(type => {
                  const isSelected = selectedMovementTypes.includes(type);
                  return <button key={type} type="button" aria-pressed={isSelected} onClick={() => toggleMovementType(type)} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${isSelected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>{type}</button>;
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={handleLaunchReport}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Afficher & Exporter le Rapport Officiel {selectedReport}
          </button>
        </div>

      </div>

    </div>
  );
}
