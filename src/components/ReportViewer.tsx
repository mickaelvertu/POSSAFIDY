import { useMemo, useState } from "react";
import { storeLabel } from "../services/storeLabel";
import { 
  ReportType, 
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
  GeneralFilters 
} from "../types";
import { filterReportData, RESELLER_PAYMENT_LABELS } from "../services/reportService";
import { downloadReportCsv, getReportTableConfig } from "../services/reportColumns";
import ReportDataTable, { ReportSortState } from "./ReportDataTable";
import StockLedgerGrid from "./StockLedgerGrid";
import { buildStockLedger } from "../services/stockLedger";
import { 
  Printer, 
  Download, 
  X, 
  FileText, 
  Calendar, 
  User, 
  Filter,
  SlidersHorizontal
} from "lucide-react";

interface ReportViewerProps {
  reportType: ReportType;
  filters: GeneralFilters;
  stores: Store[];
  categories: Category[];
  articles: Article[];
  stocks: StoreStock[];
  transfers: StockTransfer[];
  movements: StockMovement[];
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
  expenses?: Expense[];
  currentUser: { email: string; displayName: string };
  onClose: () => void;
}

export default function ReportViewer({
  reportType,
  filters,
  stores,
  categories,
  articles,
  stocks,
  transfers,
  movements,
  sales,
  productions,
  auditLogs,
  expenses,
  currentUser,
  onClose,
}: ReportViewerProps) {
  const [printDate] = useState(new Date().toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "medium"
  }));

  const getStoreName = (id: string) => { const s = stores.find(st => st.id === id); return s ? storeLabel(s) : id; };
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || id;
  const getArticle = (id: string) => articles.find(a => a.id === id);
  const filteredData = useMemo(() => filterReportData({ articles, stores, stocks, transfers, movements, sales, productions, auditLogs, expenses }, reportType === "RESELLER_CREDIT" ? { ...filters, statuses: [], resellerPaymentStatus: filters.resellerPaymentStatus || "ALL" } : filters), [articles, stores, stocks, transfers, movements, sales, productions, auditLogs, expenses, filters, reportType]);
  const reportStocks = filteredData.stocks;
  const reportTransfers = filteredData.transfers;
  const reportMovements = filteredData.movements;
  // The ledger needs every movement (balances), so the direction filter is applied afterwards, per entry.
  const reportLedger = useMemo(() => reportType === "STOCK_LEDGER"
    ? buildStockLedger(
        filterReportData({ articles, stores, stocks, transfers, movements, sales, productions, auditLogs }, { ...filters, movementDirection: "ALL" }).movements,
        { getArticle, getStore: id => stores.find(store => store.id === id), transfers, sales },
        filters.movementDirection || "ALL"
      )
    : [], [reportType, articles, stores, stocks, transfers, movements, sales, productions, auditLogs, filters]);
  const reportSales = filteredData.sales;
  const reportProductions = filteredData.productions;
  const reportAuditLogs = filteredData.auditLogs;
  const reportExpenses = filteredData.expenses || [];
  const matchesSaleArticle = (articleId: string) => {
    const article = getArticle(articleId);
    return (!filters.articleId || articleId === filters.articleId) &&
      (!filters.categoryIds.length || Boolean(article && filters.categoryIds.includes(article.category_id))) &&
      (!filters.articleType || filters.articleType === "ALL" || article?.article_type === filters.articleType);
  };
  const filteredSalesLines = reportSales.flatMap(sale => sale.lines.filter(line => matchesSaleArticle(line.article_id)));
  const salesByCustomer = [...reportSales.reduce((groups, sale) => {
    const group = groups.get(sale.customer_name) || { name: sale.customer_name, count: 0, total: 0 };
    group.count += 1;
    group.total += sale.total;
    groups.set(sale.customer_name, group);
    return groups;
  }, new Map<string, { name: string; count: number; total: number }>()).values()].sort((a, b) => b.total - a.total);
  const salesByArticle = [...filteredSalesLines.reduce((groups, line) => {
    const group = groups.get(line.article_id) || { id: line.article_id, name: line.article_name, code: line.article_code, quantity: 0, total: 0 };
    group.quantity += line.quantity;
    group.total += line.total;
    groups.set(line.article_id, group);
    return groups;
  }, new Map<string, { id: string; name: string; code: string; quantity: number; total: number }>()).values()].sort((a, b) => b.total - a.total);
  const salesByCategory = [...filteredSalesLines.reduce((groups, line) => {
    const article = getArticle(line.article_id);
    const categoryId = article?.category_id || "unknown";
    const group = groups.get(categoryId) || { id: categoryId, quantity: 0, total: 0, articleIds: new Set<string>() };
    group.quantity += line.quantity;
    group.total += line.total;
    group.articleIds.add(line.article_id);
    groups.set(categoryId, group);
    return groups;
  }, new Map<string, { id: string; quantity: number; total: number; articleIds: Set<string> }>()).values()].sort((a, b) => b.total - a.total);

  // Modulable table state : tri, colonnes visibles, export
  const [sort, setSort] = useState<ReportSortState | null>(null);
  const [hiddenKeysByReport, setHiddenKeysByReport] = useState<Record<string, string[]>>({});
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);

  const tableConfig = useMemo(() => getReportTableConfig(reportType, {
    getStoreName,
    getCategoryName,
    getArticle,
    reportStocks,
    reportMovements,
    reportLedger,
    reportTransfers,
    reportSales,
    reportProductions,
    reportAuditLogs,
    reportExpenses,
    salesByCustomer,
    salesByArticle,
    salesByCategory,
    filteredSalesLines
  }), [reportType, reportStocks, reportMovements, reportLedger, reportTransfers, reportSales, reportProductions, reportAuditLogs, reportExpenses, salesByCustomer, salesByArticle, salesByCategory, filteredSalesLines]);

  const hiddenKeys = useMemo(() => new Set(hiddenKeysByReport[reportType] || []), [hiddenKeysByReport, reportType]);

  const toggleColumn = (key: string) => {
    setHiddenKeysByReport(current => {
      const existing = new Set(current[reportType] || []);
      if (existing.has(key)) existing.delete(key); else existing.add(key);
      return { ...current, [reportType]: [...existing] };
    });
  };

  const handleSort = (key: string) => {
    setSort(current => current?.key === key
      ? (current.dir === "asc" ? { key, dir: "desc" } : null)
      : { key, dir: "asc" });
  };

  const handleExport = () => {
    const visibleColumns = tableConfig.columns.filter(col => !hiddenKeys.has(col.key));
    downloadReportCsv(`rapport-${reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, visibleColumns, tableConfig.rows);
  };

  // Active filters summary
  const getFiltersSummary = () => {
    const parts: string[] = [];
    if (filters.startDate || filters.endDate) {
      parts.push(`Période: ${filters.startDate || "Début"} au ${filters.endDate || "Ce jour"}`);
    } else {
      parts.push("Période: Historique complet");
    }
    if (filters.storeIds.length > 0) {
      parts.push(`Magasins: ${filters.storeIds.map(getStoreName).join(", ")}`);
    } else {
      parts.push("Magasins: Tous les sites");
    }
    if (filters.categoryIds.length > 0) {
      parts.push(`Catégories: ${filters.categoryIds.map(getCategoryName).join(", ")}`);
    }
    if (filters.articleIds?.length) {
      parts.push(`Articles: ${filters.articleIds.map(id => {
        const article = getArticle(id);
        return article ? `${article.code} — ${article.name}` : id;
      }).join(", ")}`);
    }
    if (filters.articleId) {
      const article = getArticle(filters.articleId);
      parts.push(`Article: ${article ? `${article.code} — ${article.name}` : filters.articleId}`);
    }
    if (filters.articleType && filters.articleType !== "ALL") {
      parts.push(`Type article: ${filters.articleType === "RESALE" ? "Revente" : "Matière Première"}`);
    }
    if (filters.statuses.length > 0) {
      parts.push(`Statuts: ${filters.statuses.join(", ")}`);
    }
    if (filters.movementDirection === "IN") parts.push("Mouvements: entrées uniquement");
    if (filters.movementDirection === "OUT") parts.push("Mouvements: sorties uniquement");
    if (reportType === "RESELLER_CREDIT") {
      parts.push(`Paiement : ${RESELLER_PAYMENT_LABELS[filters.resellerPaymentStatus || "ALL"]} (par vente)`);
      parts.push("Ventes validées ; période selon la date de vente ; encaissements cumulés et soldes à ce jour.");
    }
    if (filters.customerName) parts.push(`Client / revendeur : ${filters.customerName}`);
    if (filters.searchRef) parts.push(`Recherche : ${filters.searchRef}`);
    return parts;
  };

  // Title dictionary
  const REPORT_TITLES: Record<ReportType, string> = {
    RESELLER_CREDIT: "N° 17 — CRÉDITS & ENCAISSEMENTS DES REVENDEURS",
    STOCK_BY_ARTICLE: "N\u00b0 18 \u2014 \u00c9TAT DU STOCK PAR ARTICLE CONSOLID\u00c9",
    STOCK_STATUS: "RAPPORT OFFICIEL DE L'ÉTAT DU STOCK MULTI-MAGASINS",
    STOCK_MOVEMENTS: "JOURNAL DÉTAILLÉ DES MOUVEMENTS DE STOCK (TOUS FLUX)",
    STOCK_LEDGER: "GRILLE DES MOUVEMENTS DE STOCK PAR ARTICLE (VUE EXCEL)",
    TRANSFERS: "REGISTRE GÉNÉRAL DES EXPÉDITIONS & TRANSFERTS",
    RECEIPTS: "JOURNAL DE RÉCEPTION & CONTRÔLE DES MARCHANDISES",
    DISCREPANCIES: "RAPPORT DES ÉCARTS, AVARIES ET REJETS DE LIVRAISON",
    SALES: "JOURNAL CONSOLIDÉ DES VENTES & ENCAISSEMENTS",
    SALES_BY_CUSTOMER: "ANALYSE DU CHIFFRE D'AFFAIRES PAR CLIENT",
    SALES_BY_ARTICLE: "VENTES DÉTAILLÉES PAR ARTICLE ET CONDITIONNEMENT",
    SALES_BY_CATEGORY: "VENTES PAR CATÉGORIE DE PRODUITS GILEADA",
    RAW_MATERIAL_CONSUMPTION: "ÉTAT DE CONSOMMATION DES MATIÈRES PREMIÈRES",
    PRODUCTION: "REGISTRE DE FABRICATION & PRODUITS FINIS LABORATOIRE",
    RETURNS: "REGISTRE DES RETOURS VERS LE DÉPÔT CENTRAL",
    AUDIT_LOG: "JOURNAL D'AUDIT ET DE TRAÇABILITÉ DES OPÉRATIONS",
    EXPENSES: "REGISTRE DES DÉPENSES & FRAIS D'EXPLOITATION"
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200">
        
        {/* Modal Top Bar (hidden in print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Aperçu & Édition du Rapport GILEADA</h3>
              <p className="text-xs text-slate-500">Document certifié conforme aux règles d'audit</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {reportType !== "STOCK_LEDGER" && <div className="relative print:hidden">
              <button
                type="button"
                onClick={() => setIsColumnMenuOpen(open => !open)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-all cursor-pointer"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Colonnes
              </button>
              {isColumnMenuOpen && (
                <div className="absolute right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10 p-2 space-y-1">
                  {tableConfig.columns.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenKeys.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="cursor-pointer"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>}
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer print:hidden"
            >
              <Download className="h-4 w-4" />
              Exporter (CSV / Excel)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Imprimer / Sauvegarder PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div className="printable-document flex-1 overflow-y-auto p-6 sm:p-10 text-slate-800 bg-white" id="printable-report-area">
          
          {/* Header standard GILEADA */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <img src="/branding/gileada-logo.png" alt="GILEADA" className="h-20 w-44 object-contain" />
                  <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">MADAGASCAR</span>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-1">
                  Laboratoire Pharmaceutique, Soins Naturels & Réseau de Distribution
                </p>
                <p className="text-[11px] text-slate-500">
                  Antananarivo • Toamasina • Mahajanga • Antsirabe • Madagascar
                </p>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1">
                <div className="font-bold text-slate-800 flex items-center sm:justify-end gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Édité le : {printDate}
                </div>
                <div className="text-slate-600 flex items-center sm:justify-end gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  Opérateur : <span className="font-semibold text-slate-800">{currentUser.displayName || currentUser.email}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  REF-DOC: GILEADA-{Date.now().toString(36).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-baseline justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wide uppercase">
                {REPORT_TITLES[reportType]}
              </h2>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                Période active & Filtres appliqués
              </span>
            </div>

            {/* Active Filters Box */}
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Filtres appliqués pour ce rapport :
              </div>
              <div className="flex flex-wrap gap-2 text-slate-600">
                {getFiltersSummary().map((filterText, idx) => (
                  <span key={idx} className="bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                    {filterText}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* REPORT CONTENT (colonnes modulables, triables & exportables) */}
          {reportType === "STOCK_LEDGER" ? (
            <StockLedgerGrid blocks={reportLedger} />
          ) : (
            <ReportDataTable
              columns={tableConfig.columns}
              rows={tableConfig.rows}
              rowKey={tableConfig.rowKey}
              hiddenKeys={hiddenKeys}
              sort={sort}
              onSort={handleSort}
            />
          )}

          {/* Footer & Signature Section */}
          <div className="mt-12 pt-6 border-t-2 border-slate-300 flex justify-between items-end text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">Direction Générale & Contrôle de Gestion GILEADA</p>
              <p className="text-[11px] text-slate-500">Document généré automatiquement sous contrôle cryptographique</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Page 1 / 1 • Certifié ISO 9001:2015</p>
            </div>
            <div className="text-center w-48">
              <div className="h-14 border-b border-dashed border-slate-400 mb-1"></div>
              <span className="text-[11px] font-semibold text-slate-700">Visa & Signature Autorité</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
