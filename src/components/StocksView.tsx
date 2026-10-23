import { useEffect, useState, FormEvent } from "react";
import type { ChangeEvent } from "react";
import { 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  StockMovement,
  UserProfile, 
  ArticleTypeCode 
} from "../types";
import { getArticleStock, getQuarantineStock } from "../services/stockService";
import SearchableSelect from "./SearchableSelect";
import MovementsView from "./MovementsView";
import { 
  Boxes, 
  Search, 
  SlidersHorizontal, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpDown, 
  Plus, 
  Building2,
  DollarSign,
  X,
  Upload,
  Download
} from "lucide-react";
import { buildStockExportRecords, parseStockSyncFile, toStockCsv, validateStockSync } from "../services/stockSyncValidation";
import type { StockSyncRow } from "../services/stockSyncValidation";
import { validateInitialStockImport } from "../services/stockImportValidation";
import type { InitialStockImportRow } from "../services/stockImportValidation";

interface StocksViewProps {
  stores: Store[];
  categories: Category[];
  articles: Article[];
  stocks: StoreStock[];
  movements: StockMovement[];
  currentUser: UserProfile;
  onAdjustStock: (
    storeId: string, 
    articleId: string, 
    newQty: number, 
    reason: string,
    isDeposit: boolean
  ) => void;
  onImportInitialStocks: (rows: InitialStockImportRow[]) => Promise<void>;
  onSyncStocks: (rows: StockSyncRow[]) => Promise<void>;
}

export default function StocksView({
  stores,
  categories,
  articles,
  stocks,
  movements,
  currentUser,
  onAdjustStock,
  onImportInitialStocks,
  onSyncStocks
}: StocksViewProps) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("ALL");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<"ALL" | ArticleTypeCode>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const STOCK_PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(STOCK_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(STOCK_PAGE_SIZE);
  }, [selectedStoreId, selectedCategoryId, selectedType, searchQuery, onlyLowStock]);

  // Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(false);
  const [adjustStoreId, setAdjustStoreId] = useState(stores[0]?.id || "");
  const [adjustArticleId, setAdjustArticleId] = useState("");
  const [adjustNewQty, setAdjustNewQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("Inventaire physique périodique");
  const [importRows, setImportRows] = useState<InitialStockImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [syncRows, setSyncRows] = useState<StockSyncRow[]>([]);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const [syncUnchanged, setSyncUnchanged] = useState(0);
  const [syncFileName, setSyncFileName] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const canStoreRawMaterials = (storeId: string) => {
    const store = stores.find(item => item.id === storeId);
    return store?.store_type === "CENTRAL_WAREHOUSE" || store?.store_type === "MANUFACTURER";
  };

  const isAdmin = currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN";
  const isSuperAdmin = currentUser.roleId === "SUPER_ADMIN";
  const canManageStockForStore = (storeId: string) => isAdmin && stores.find(store => store.id === storeId)?.store_type === "CENTRAL_WAREHOUSE";
  const centralStores = stores.filter(store => store.store_type === "CENTRAL_WAREHOUSE");
  const primaryCentralStore = centralStores.find(store => store.code === "DEP-01") || centralStores[0];

  const articlesForStore = (storeId: string) => articles.filter(article => canStoreRawMaterials(storeId) || article.article_type === "RESALE");

  const currentAdjustStock = getArticleStock(stocks, adjustStoreId, adjustArticleId);

  const handleOpenAdjustModal = (storeId?: string) => {
    const sId = storeId || (selectedStoreId !== "ALL" ? selectedStoreId : primaryCentralStore?.id || "");
    if (!canManageStockForStore(sId)) return;
    setAdjustStoreId(sId);
    setAdjustArticleId("");
    setAdjustNewQty(0);
    setIsDepositMode(false);
    setAdjustReason("Inventaire physique périodique");
    setIsAdjustModalOpen(true);
  };

  const handleConfirmAdjust = (e: FormEvent) => {
    e.preventDefault();
    if (!adjustArticleId) return;
    const currentStock = getArticleStock(stocks, adjustStoreId, adjustArticleId);
    const targetQuantity = isDepositMode
      ? currentStock + Number(adjustNewQty)
      : Number(adjustNewQty);
    onAdjustStock(adjustStoreId, adjustArticleId, targetQuantity, adjustReason, isDepositMode);
    setIsAdjustModalOpen(false);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportRows([]);
    setImportErrors([]);
    setImportStatus("");
    setImportFileName(file?.name || "");
    if (!file) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validation = validateInitialStockImport(parsed, stores, articles, stocks);
      setImportRows(validation.rows);
      setImportErrors(validation.errors);
      if (validation.errors.length === 0) {
        setImportStatus(`${validation.rows.length} ligne(s) validée(s), prêtes pour prévisualisation.`);
      }
    } catch (error) {
      setImportErrors([error instanceof Error ? `Lecture du fichier impossible : ${error.message}` : "Lecture du fichier impossible."]);
    }
  };

  const handleApplyInitialStockImport = async () => {
    if (!isSuperAdmin || importErrors.length > 0 || importRows.length === 0 || isImporting) return;
    const confirmed = window.confirm(
      `Importer ${importRows.length} lignes comme inventaire initial ? Les stocks existants concernés seront refusés. Cette opération créera des mouvements et ne peut pas être annulée automatiquement.`
    );
    if (!confirmed) return;

    setIsImporting(true);
    setImportStatus("");
    try {
      await onImportInitialStocks(importRows);
      setImportStatus(`${importRows.length} ligne(s) importée(s) avec succès.`);
      setImportRows([]);
    } catch (error) {
      setImportStatus(error instanceof Error
        ? `Import non confirmé : ${error.message}`
        : "Import non confirmé : une erreur inconnue est survenue. Vérifiez le suivi avant toute nouvelle tentative.");
    } finally {
      setIsImporting(false);
    }
  };

  const downloadFile = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportStock = (format: "csv" | "json") => {
    const scopeStores = selectedStoreId === "ALL" ? stores : stores.filter(store => store.id === selectedStoreId);
    const records = buildStockExportRecords(scopeStores, articles, stocks);
    const suffix = selectedStoreId === "ALL" ? "tous-magasins" : scopeStores[0]?.code || "magasin";
    const date = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      downloadFile(`stock-${suffix}-${date}.csv`, toStockCsv(records), "text/csv;charset=utf-8");
    } else {
      downloadFile(`stock-${suffix}-${date}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: records }, null, 2), "application/json");
    }
  };

  const handleSyncFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setSyncRows([]);
    setSyncErrors([]);
    setSyncUnchanged(0);
    setSyncStatus("");
    setSyncFileName(file?.name || "");
    if (!file) return;
    try {
      const records = parseStockSyncFile(file.name, await file.text());
      const validation = validateStockSync(records, stores, articles, stocks);
      setSyncRows(validation.rows);
      setSyncErrors(validation.errors);
      setSyncUnchanged(validation.unchanged);
    } catch (error) {
      setSyncErrors([error instanceof Error ? `Lecture du fichier impossible : ${error.message}` : "Lecture du fichier impossible."]);
    }
  };

  const handleApplySync = async () => {
    if (!isSuperAdmin || syncErrors.length > 0 || syncRows.length === 0 || isSyncing) return;
    if (!window.confirm(`Remplacer le stock de ${syncRows.length} ligne(s) par les quantités du fichier ? Un mouvement d'ajustement sera créé pour chaque écart.`)) return;
    setIsSyncing(true);
    setSyncStatus("");
    try {
      await onSyncStocks(syncRows);
      setSyncStatus(`${syncRows.length} ligne(s) mise(s) à jour.`);
      setSyncRows([]);
    } catch (error) {
      setSyncStatus(error instanceof Error ? `Import non confirmé : ${error.message}` : "Import non confirmé.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter stocks
  const filteredItems = articles.flatMap((art) => {
    // If a specific store is selected
    const targetStores = selectedStoreId === "ALL" ? stores : stores.filter(s => s.id === selectedStoreId);

    return targetStores.filter(store => canStoreRawMaterials(store.id) || art.article_type === "RESALE").map((store) => {
      const qty = getArticleStock(stocks, store.id, art.id);
      const isLow = qty <= (art.min_alert_stock || 10);
      return {
        article: art,
        store: store,
        quantity: qty,
        quarantine: getQuarantineStock(stocks, store.id, art.id),
        isLow: isLow
      };
    });
  }).filter((item) => {
    if (selectedCategoryId !== "ALL" && item.article.category_id !== selectedCategoryId) return false;
    if (selectedType !== "ALL" && item.article.article_type !== selectedType) return false;
    if (onlyLowStock && !item.isLow) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchCode = item.article.code.toLowerCase().includes(q);
      const matchName = item.article.name.toLowerCase().includes(q);
      if (!matchCode && !matchName) return false;
    }
    return true;
  });

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || id;

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              État & Inventaire Multi-Magasins
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 1 & 2 : Suivi en temps réel des stocks de revente et matières premières par site de stockage.
          </p>
        </div>
      </div>


      {isSuperAdmin && (
        <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="stock-sync-title">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
            <div className="min-w-0 flex-1">
              <h3 id="stock-sync-title" className="font-bold text-slate-900">Exporter / importer le stock par magasin</h3>
              <p className="mt-1 text-xs text-slate-700">
                Exportez le magasin sélectionné ({selectedStoreId === "ALL" ? "tous les magasins" : stores.find(s => s.id === selectedStoreId)?.name}), modifiez les quantités, puis réimportez le fichier CSV ou JSON : le stock est remplacé par les quantités du fichier et chaque écart crée un mouvement d’ajustement.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => handleExportStock("csv")} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-blue-100">
                  <Download className="h-4 w-4" /> Exporter CSV
                </button>
                <button type="button" onClick={() => handleExportStock("json")} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-blue-100">
                  <Download className="h-4 w-4" /> Exporter JSON
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-blue-100">
                  <Upload className="h-4 w-4" /> Importer CSV / JSON
                  <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleSyncFile} className="sr-only" />
                </label>
              </div>
              {syncFileName && <p className="mt-2 truncate text-xs text-slate-600">{syncFileName}</p>}
            </div>
          </div>

          {syncErrors.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
              <strong>Import bloqué ({syncErrors.length} erreur(s))</strong>
              <ul className="mt-1 list-inside list-disc">
                {syncErrors.slice(0, 20).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
              </ul>
              {syncErrors.length > 20 && <p className="mt-1">Et {syncErrors.length - 20} autre(s) erreur(s).</p>}
            </div>
          )}
          {syncFileName && syncErrors.length === 0 && (
            <div className="rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-700">
              <strong>Prévisualisation :</strong> {syncRows.length} ligne(s) modifiée(s), {syncUnchanged} inchangée(s). Aucun stock n’a encore été modifié.
              {syncRows.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="text-slate-500">
                      <tr><th className="pr-2">Magasin</th><th className="pr-2">Article</th><th className="pr-2 text-right">Actuel</th><th className="pr-2 text-right">Nouveau</th><th className="text-right">Écart</th></tr>
                    </thead>
                    <tbody>
                      {syncRows.slice(0, 200).map(row => (
                        <tr key={row.id} className="border-t border-slate-100">
                          <td className="pr-2">{stores.find(s => s.id === row.store_id)?.name}</td>
                          <td className="pr-2">{articles.find(a => a.id === row.article_id)?.name}</td>
                          <td className="pr-2 text-right font-mono">{row.before}</td>
                          <td className="pr-2 text-right font-mono">{row.quantity}</td>
                          <td className={`text-right font-mono font-bold ${row.quantity > row.before ? "text-emerald-700" : "text-rose-700"}`}>{row.quantity - row.before > 0 ? "+" : ""}{row.quantity - row.before}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {syncRows.length > 200 && <p className="mt-1">Et {syncRows.length - 200} autre(s) ligne(s).</p>}
                </div>
              )}
            </div>
          )}
          {syncStatus && <p className="text-xs font-semibold text-slate-700" role="status">{syncStatus}</p>}
          <button
            type="button"
            onClick={handleApplySync}
            disabled={isSyncing || syncRows.length === 0 || syncErrors.length > 0}
            className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSyncing ? "Application en cours…" : "Appliquer les quantités du fichier"}
          </button>
        </section>
      )}

      {isSuperAdmin && (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="initial-stock-import-title">
          <div className="flex items-start gap-3">
            <Upload className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <h3 id="initial-stock-import-title" className="font-bold text-slate-900">Importer l’inventaire initial</h3>
              <p className="mt-1 text-xs text-slate-700">
                Fichier JSON avec <code>data</code> et <code>review.ready_to_apply: true</code>. Les doublons, stocks déjà présents et écarts non approuvés sont refusés.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-amber-100">
                <Upload className="h-4 w-4" />
                Choisir un fichier JSON
                <input type="file" accept="application/json,.json" onChange={handleImportFile} className="sr-only" />
              </label>
              {importFileName && <p className="mt-2 truncate text-xs text-slate-600">{importFileName}</p>}
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-700">
              <strong>Prévisualisation :</strong> {importRows.length} ligne(s), {new Set(importRows.map(row => row.store_id)).size} magasin(s),{" "}
              {importRows.filter(row => row.quantity === 0).length} quantité(s) nulle(s). Aucun stock n’a encore été modifié.
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
              <strong>Import bloqué ({importErrors.length} erreur(s))</strong>
              <ul className="mt-1 list-inside list-disc">
                {importErrors.slice(0, 20).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
              </ul>
              {importErrors.length > 20 && <p className="mt-1">Et {importErrors.length - 20} autre(s) erreur(s).</p>}
            </div>
          )}
          {importStatus && <p className="text-xs font-semibold text-slate-700" role="status">{importStatus}</p>}
          <button
            type="button"
            onClick={handleApplyInitialStockImport}
            disabled={isImporting || importRows.length === 0 || importErrors.length > 0}
            className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? "Import en cours…" : "Confirmer l’import initial"}
          </button>
        </section>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        
        {/* Store selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Magasin :</label>
          <SearchableSelect
            value={selectedStoreId}
            options={stores.map(store => ({
              value: store.id,
              label: store.name,
              description: `${store.code} · ${store.store_type}`
            }))}
            onChange={setSelectedStoreId}
            placeholder="Saisir un magasin, code ou type..."
            allLabel="Tous les Magasins (Consolidé)"
            className="w-80 max-w-full"
          />
        </div>

        {/* Category selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Catégorie :</label>
          <SearchableSelect
            value={selectedCategoryId}
            options={categories.map(category => ({ value: category.id, label: category.name, description: category.code }))}
            onChange={setSelectedCategoryId}
            placeholder="Saisir une catégorie..."
            allLabel="Toutes les Catégories"
            className="w-72 max-w-full"
          />
        </div>

        {/* Article Type */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setSelectedType("ALL")}
            className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "ALL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"}`}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("RESALE")}
            className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "RESALE" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600"}`}
          >
            Revente
          </button>
          <button
            type="button"
            onClick={() => setSelectedType("RAW_MATERIAL")}
            className={`px-2.5 py-1 rounded font-bold transition ${selectedType === "RAW_MATERIAL" ? "bg-white text-purple-800 shadow-xs" : "text-slate-600"}`}
          >
            Mat. Première
          </button>
        </div>

        {/* Low stock checkbox */}
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded text-rose-600 focus:ring-rose-500"
          />
          <span className="text-rose-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Stock bas uniquement
          </span>
        </label>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2" />
          <input
            type="text"
            placeholder="Rechercher code, article..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

      </div>

      {/* Stocks Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">Site / Magasin</th>
                <th className="py-3 px-3">Réf</th>
                <th className="py-3 px-3">Désignation de l'Article</th>
                <th className="py-3 px-3">Catégorie</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Unité</th>
                <th className="py-3 px-3 text-right">Quantité Stock</th>
                <th className="py-3 px-3 text-right">Prix Normal</th>
                <th className="py-3 px-3 text-right">Prix Revendeur</th>
                <th className="py-3 px-3 text-right">Valeur Totale</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.slice(0, visibleCount).map((item, idx) => {
                const totalVal = item.quantity * item.article.prix_normal;
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{item.store.name}</span>
                      <div className="text-[10px] text-slate-400 font-mono">{item.store.code}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                      {item.article.code}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {item.article.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {getCategoryName(item.article.category_id)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.article.article_type === "RESALE" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                      }`}>
                        {item.article.article_type === "RESALE" ? "Revente" : "Matière 1ère"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {item.article.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                        item.isLow 
                          ? "text-rose-700 bg-rose-50 border border-rose-200" 
                          : "text-slate-900"
                      }`}>
                        {item.quantity}
                      </span>
                      {item.quarantine > 0 && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="Retours à recycler, non vendables">
                          +{item.quarantine} à recycler
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {item.article.prix_normal.toLocaleString("fr-FR")} Ar
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {item.article.prix_revendeur.toLocaleString("fr-FR")} Ar
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {totalVal.toLocaleString("fr-FR")} Ar
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenAdjustModal(item.store.id)}
                        disabled={!canManageStockForStore(item.store.id)}
                        title={!canManageStockForStore(item.store.id) ? "Seul l'administrateur peut gérer le stock du dépôt central" : "Ajuster le stock"}
                        className="text-blue-600 hover:text-blue-800 font-bold text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Ajuster
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>{Math.min(visibleCount, filteredItems.length)} ligne(s) affichée(s) sur {filteredItems.length}</span>
          {visibleCount < filteredItems.length && (
            <span className="flex gap-2">
              <button type="button" onClick={() => setVisibleCount(count => count + STOCK_PAGE_SIZE)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-bold text-slate-700 hover:bg-slate-100">
                Afficher {Math.min(STOCK_PAGE_SIZE, filteredItems.length - visibleCount)} de plus
              </button>
              <button type="button" onClick={() => setVisibleCount(filteredItems.length)} className="rounded-lg bg-slate-900 px-3 py-1 font-bold text-white hover:bg-slate-800">
                Tout afficher
              </button>
            </span>
          )}
        </div>
      </div>

      <MovementsView movements={movements} stores={stores} articles={articles} />

      {/* INVENTORY ADJUSTMENT MODAL */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-xs text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                  {isDepositMode ? <Plus className="h-5 w-5 text-blue-600" /> : <SlidersHorizontal className="h-5 w-5 text-blue-600" />}
                <h3 className="font-bold text-base text-slate-900">
                  {isDepositMode ? "Dépôt de stock" : "Ajustement d'Inventaire Physique"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjust} className="mt-4 space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Magasin :</label>
                <SearchableSelect
                  value={adjustStoreId}
                  onChange={(storeId) => {
                    setAdjustStoreId(storeId);
                    setAdjustArticleId("");
                    setAdjustNewQty(0);
                  }}
                  options={centralStores.map(store => ({ value: store.id, label: store.name, description: `${store.code} · ${store.store_type}` }))}
                  placeholder="Saisir un magasin..."
                  className="w-full"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Article :</label>
                <SearchableSelect
                  value={adjustArticleId}
                  onChange={(articleId) => {
                    setAdjustArticleId(articleId);
                    setAdjustNewQty(getArticleStock(stocks, adjustStoreId, articleId));
                  }}
                  options={articlesForStore(adjustStoreId).map(article => ({ value: article.id, label: article.name, description: `${article.code} · ${article.unit}` }))}
                  placeholder="Saisir un article..."
                  className="w-full"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center font-mono">
                <span className="text-slate-600">Stock Théorique Actuel :</span>
                <span className="font-bold text-slate-900 text-sm">{currentAdjustStock}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isDepositMode ? "Quantité à déposer :" : "Nouvelle Quantité Constatée (Comptage Physique) :"}
                </label>
                <input
                  type="number"
                  min={isDepositMode ? "1" : "0"}
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(Number(e.target.value))}
                  disabled={!adjustArticleId}
                  className="w-full font-mono font-bold text-base text-slate-900 bg-white border border-slate-300 rounded-lg p-2 text-right"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Motif du mouvement (Obligatoire pour l'audit) :
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: Inventaire de fin de mois, bris accidentel, comptage..."
                  className="w-full text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!adjustArticleId}
                  className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  {isDepositMode ? "Enregistrer le dépôt" : "Enregistrer l'Ajustement"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
