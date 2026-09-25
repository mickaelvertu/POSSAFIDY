import { useState, FormEvent } from "react";
import { 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  UserProfile, 
  ArticleTypeCode 
} from "../types";
import { getArticleStock } from "../services/stockService";
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
  X
} from "lucide-react";

interface StocksViewProps {
  stores: Store[];
  categories: Category[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onAdjustStock: (
    storeId: string, 
    articleId: string, 
    newQty: number, 
    reason: string
  ) => void;
}

export default function StocksView({
  stores,
  categories,
  articles,
  stocks,
  currentUser,
  onAdjustStock
}: StocksViewProps) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("ALL");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<"ALL" | ArticleTypeCode>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustStoreId, setAdjustStoreId] = useState(stores[0]?.id || "");
  const [adjustArticleId, setAdjustArticleId] = useState(articles[0]?.id || "");
  const [adjustNewQty, setAdjustNewQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("Inventaire physique périodique");

  const currentAdjustStock = getArticleStock(stocks, adjustStoreId, adjustArticleId);

  const handleOpenAdjustModal = (storeId?: string, articleId?: string) => {
    const sId = storeId || (selectedStoreId !== "ALL" ? selectedStoreId : stores[0]?.id || "");
    const aId = articleId || articles[0]?.id || "";
    setAdjustStoreId(sId);
    setAdjustArticleId(aId);
    setAdjustNewQty(getArticleStock(stocks, sId, aId));
    setAdjustReason("Inventaire physique périodique");
    setIsAdjustModalOpen(true);
  };

  const handleConfirmAdjust = (e: FormEvent) => {
    e.preventDefault();
    onAdjustStock(adjustStoreId, adjustArticleId, Number(adjustNewQty), adjustReason);
    setIsAdjustModalOpen(false);
  };

  // Filter stocks
  const filteredItems = articles.flatMap((art) => {
    // If a specific store is selected
    const targetStores = selectedStoreId === "ALL" ? stores : stores.filter(s => s.id === selectedStoreId);

    return targetStores.map((store) => {
      const qty = getArticleStock(stocks, store.id, art.id);
      const isLow = qty <= (art.min_alert_stock || 10);
      return {
        article: art,
        store: store,
        quantity: qty,
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

        <button
          type="button"
          onClick={() => handleOpenAdjustModal()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Ajustement d'Inventaire
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        
        {/* Store selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Magasin :</label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tous les Magasins (Consolidé)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code} - {s.store_type})
              </option>
            ))}
          </select>
        </div>

        {/* Category selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Catégorie :</label>
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Toutes les Catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
              {filteredItems.slice(0, 100).map((item, idx) => {
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
                        onClick={() => handleOpenAdjustModal(item.store.id, item.article.id)}
                        className="text-blue-600 hover:text-blue-800 font-bold text-[11px]"
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
      </div>

      {/* INVENTORY ADJUSTMENT MODAL */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">
                  Ajustement d'Inventaire Physique
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
                <select
                  value={adjustStoreId}
                  onChange={(e) => {
                    setAdjustStoreId(e.target.value);
                    setAdjustNewQty(getArticleStock(stocks, e.target.value, adjustArticleId));
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.store_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Article :</label>
                <select
                  value={adjustArticleId}
                  onChange={(e) => {
                    setAdjustArticleId(e.target.value);
                    setAdjustNewQty(getArticleStock(stocks, adjustStoreId, e.target.value));
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                >
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.code}] {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center font-mono">
                <span className="text-slate-600">Stock Théorique Actuel :</span>
                <span className="font-bold text-slate-900 text-sm">{currentAdjustStock}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nouvelle Quantité Constatée (Comptage Physique) :
                </label>
                <input
                  type="number"
                  min="0"
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(Number(e.target.value))}
                  className="w-full font-mono font-bold text-base bg-white border border-slate-300 rounded-lg p-2 text-right"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Motif de l'ajustement (Obligatoire pour l'audit) :
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: Inventaire de fin de mois, bris accidentel, comptage..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
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
                  className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Enregistrer l'Ajustement
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
