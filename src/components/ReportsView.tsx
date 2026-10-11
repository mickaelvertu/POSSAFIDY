import { storeLabel } from "../services/storeLabel";
import { useMemo, useState, ReactNode } from "react";
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
  Expense,
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
  ShieldAlert,
  Wallet
} from "lucide-react";

interface ReportsViewProps {
  userAuditReport?: ReactNode;
  /** Fournies uniquement aux utilisateurs autorisés à consulter les dépenses. */
  expenses?: Expense[];
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
  userAuditReport,
  expenses,
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
  const [showUserAudit, setShowUserAudit] = useState(false);

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
  const [articleIds, setArticleIds] = useState<string[]>([]);
  const [articleQuery, setArticleQuery] = useState<string>("");

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
    { type: "AUDIT_LOG", number: 13, title: "Journal d'audit", description: "Traçabilité des opérations sensibles, utilisateurs et appareils", icon: ShieldAlert, color: "text-slate-800 bg-slate-100 border-slate-300" },
    { type: "STOCK_LEDGER", number: 14, title: "Grille des mouvements (Excel)", description: "Par article : stock avant, puis chaque variation (+4 transfert, −1 vente…) et stock après", icon: SlidersHorizontal, color: "text-cyan-600 bg-cyan-50 border-cyan-200" }
  ];

  const EXPENSES_REPORT: (typeof REPORTS_CATALOG)[number] | undefined = expenses ? {
    type: "EXPENSES",
    number: 16,
    title: "Dépenses",
    description: "Frais d'exploitation par magasin, catégorie, bénéficiaire et mode de paiement",
    icon: Wallet,
    color: "text-rose-600 bg-rose-50 border-rose-200"
  } : undefined;
  const reportCount = 14 + (userAuditReport ? 1 : 0) + (EXPENSES_REPORT ? 1 : 0);
  const allReports = EXPENSES_REPORT ? [...REPORTS_CATALOG, EXPENSES_REPORT] : REPORTS_CATALOG;

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
    customerName: customerName || undefined,
    articleIds: selectedReport === "STOCK_LEDGER" && articleIds.length ? articleIds : undefined
  }), [selectedReport, articleIds, startDate, endDate, selectedStoreIds, selectedStatuses, selectedMovementTypes, movementDirection, selectedCategoryIds, articleType, searchRef, minQty, maxQty, customerName]);

  const filteredData = useMemo(() => filterReportData({
    articles,
    stores,
    stocks,
    transfers,
    movements,
    sales,
    productions,
    auditLogs,
    expenses
  }, filters), [articles, stores, stocks, transfers, movements, sales, productions, auditLogs, expenses, filters]);
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
    ? ["DRAFT", "CHECKING", "VERIFIED", "APPROVED", "VALIDATED", "CANCELLED", "REFUNDED"]
    : selectedReport === "PRODUCTION" || selectedReport === "RAW_MATERIAL_CONSUMPTION"
      ? ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
      : ["TRANSFERS", "RECEIPTS", "DISCREPANCIES", "RETURNS"].includes(selectedReport)
        ? ["DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED", "VALIDATED", "DISCREPANCY", "CANCELLED"]
        : selectedReport === "AUDIT_LOG"
          ? [...new Set(auditLogs.map(log => log.action))]
          : selectedReport === "EXPENSES"
            ? ["DRAFT", "VALIDATED"]
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

  const renderReportCard = (rep: (typeof REPORTS_CATALOG)[number]) => {
    const isSelected = selectedReport === rep.type && !showUserAudit;
    const IconComp = rep.icon;
          return (
            <button
              type="button"
              key={rep.type}
              aria-pressed={isSelected}
              onClick={() => { setSelectedReport(rep.type); setShowUserAudit(false); }}
              className={`group flex min-h-44 w-full flex-col justify-between rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071312] ${
                isSelected 
                  ? "border-emerald-300/70 bg-[#eaf8f1] shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-300/30" 
                  : "border-white/10 bg-white/[0.06] hover:-translate-y-0.5 hover:border-emerald-200/35 hover:bg-white/[0.1]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[11px] font-bold tracking-wider ${isSelected ? "text-emerald-800" : "text-slate-400"}`}>
                    N° {rep.number}
                  </span>
                  <div className={`rounded-xl border p-2.5 transition-transform group-hover:scale-105 ${rep.color}`}>
                    <IconComp className="h-4 w-4" />
                  </div>
                </div>
                <h4 className={`mt-3 text-sm font-bold ${isSelected ? "text-slate-950" : "text-white"}`}>{rep.title}</h4>
                <p className={`mt-1.5 text-xs leading-relaxed ${isSelected ? "text-slate-600" : "text-slate-400"}`}>
                  {rep.description}
                </p>
              </div>

              <div className={`mt-4 flex items-center justify-between border-t pt-3 text-xs font-bold ${isSelected ? "border-emerald-900/10" : "border-white/10"}`}>
                <span className={isSelected ? "text-emerald-800" : "text-slate-400"}>
                  {isSelected ? "Rapport sélectionné" : "Ouvrir ce rapport"}
                </span>
                <ChevronRight className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${isSelected ? "text-emerald-700" : "text-slate-500"}`} />
              </div>
            </button>
          );
  };

  if (showUserAudit && userAuditReport) return <div className="space-y-4"><button type="button" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 print:hidden" onClick={() => setShowUserAudit(false)}>← Tous les rapports</button>{userAuditReport}</div>;

  return (
    <div className="space-y-7">
      <header className="relative isolate overflow-hidden rounded-3xl border border-emerald-200/15 bg-gradient-to-br from-[#12352d] via-[#0c2621] to-[#071714] p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
              <FileText className="h-3.5 w-3.5" />
              Centre de rapports
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Rapports officiels GILEADA
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-emerald-50/70">
              {reportCount} rapports certifiés pour suivre les stocks, les ventes, la production et les opérations.
              Chaque édition conserve ses filtres et ses totaux.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLaunchReport}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c2621]"
          >
            <Printer className="h-4 w-4" />
            Générer le rapport sélectionné
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-xs text-emerald-50/60">
          <span className="font-semibold text-emerald-100">          N° {allReports.find(report => report.type === selectedReport)?.number ?? 1}</span>
                    <span>{allReports.find(report => report.type === selectedReport)?.title ?? "État du stock"}</span>
          <span className="hidden h-1 w-1 rounded-full bg-emerald-200/50 sm:block" />
          <span>Filtres actifs pris en compte à la génération</span>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs du rapport filtré">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-2xl border border-white/70 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="reports-catalog-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Bibliothèque</p>
            <h3 id="reports-catalog-title" className="mt-1 text-lg font-bold text-white">Choisir un rapport</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300">
            {reportCount} éditions disponibles
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {REPORTS_CATALOG.map(renderReportCard)}
        {userAuditReport && (
          <button
            type="button"
            aria-pressed={showUserAudit}
            onClick={() => setShowUserAudit(true)}
            className={`group flex min-h-44 w-full flex-col justify-between rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071312] ${
              showUserAudit
                ? "border-emerald-300/70 bg-[#eaf8f1] shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-300/30"
                : "border-white/10 bg-white/[0.06] hover:-translate-y-0.5 hover:border-emerald-200/35 hover:bg-white/[0.1]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={`font-mono text-[11px] font-bold tracking-wider ${showUserAudit ? "text-emerald-800" : "text-slate-400"}`}>N° 15</span>
                <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-2.5 text-rose-300">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
              <h4 className={`mt-3 text-sm font-bold ${showUserAudit ? "text-slate-950" : "text-white"}`}>Fiche d’audit par utilisateur</h4>
              <p className={`mt-1.5 text-xs leading-relaxed ${showUserAudit ? "text-slate-600" : "text-slate-400"}`}>
                Affectations, ventes, salaire de base, avances, retenues et ajustements.
              </p>
            </div>
            <div className={`mt-4 flex items-center justify-between border-t pt-3 text-xs font-bold ${showUserAudit ? "border-emerald-900/10" : "border-white/10"}`}>
              <span className={showUserAudit ? "text-emerald-800" : "text-slate-400"}>{showUserAudit ? "Rapport sélectionné" : "Ouvrir ce rapport"}</span>
              <ChevronRight className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${showUserAudit ? "text-emerald-700" : "text-slate-500"}`} />
            </div>
          </button>
        )}
        {EXPENSES_REPORT && renderReportCard(EXPENSES_REPORT)}
        </div>
      </section>

      {/* Mandatory Filters Panel (Section 12) */}
      <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-7">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><Filter className="h-4 w-4" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Configuration</p>
              <h3 className="text-sm font-bold text-slate-900">
                Filtres du rapport <span className="font-normal text-slate-500">(N° {allReports.find(report => report.type === selectedReport)?.number ?? 1} — {allReports.find(report => report.type === selectedReport)?.title})</span>
              </h3>
            </div>
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
              setArticleIds([]);
              setArticleQuery("");
            }}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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

        {selectedReport === "STOCK_LEDGER" && (
          <div className="text-xs">
            <label className="block font-bold text-slate-700 mb-1" htmlFor="ledger-article">Articles précis (Multi-sélection) :</label>
            <input
              id="ledger-article"
              type="text"
              list="ledger-article-options"
              placeholder="Tous les articles — tapez un code ou un nom puis choisissez dans la liste"
              value={articleQuery}
              onChange={(e) => {
                const value = e.target.value;
                const match = articles.find(article => `${article.code} — ${article.name}` === value);
                if (match) {
                  setArticleIds(current => current.includes(match.id) ? current : [...current, match.id]);
                  setArticleQuery("");
                } else {
                  setArticleQuery(value);
                }
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
            <datalist id="ledger-article-options">
              {[...articles].filter(article => !articleIds.includes(article.id)).sort((a, b) => a.name.localeCompare(b.name, "fr-FR")).map(article => (
                <option key={article.id} value={`${article.code} — ${article.name}`} />
              ))}
            </datalist>
            {articleIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {articleIds.map(id => {
                  const article = articles.find(item => item.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setArticleIds(current => current.filter(item => item !== id))}
                      title="Retirer cet article"
                      className="px-3 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 bg-cyan-600 text-white border-cyan-600"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {article ? `${article.code} — ${article.name}` : id}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setArticleIds([])} className="px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-900">Tout retirer</button>
              </div>
            )}
          </div>
        )}
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
                  {storeLabel(s)}
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
