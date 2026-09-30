import { useState, FormEvent } from "react";
import { 
  Sale, 
  SaleLine, 
  Store, 
  Article, 
  StoreStock, 
  UserProfile, 
  PaymentMethod, 
  SaleStatus 
} from "../types";
import { generateRef, getArticleStock } from "../services/stockService";
import { 
  ShoppingCart, 
  Plus, 
  Minus,
  CheckCircle2, 
  Clock, 
  Search, 
  Printer, 
  X, 
  Trash2, 
  DollarSign, 
  User, 
  CreditCard,
  Building2,
  FileCheck,
  Package,
  WalletCards
} from "lucide-react";

interface SalesViewProps {
  sales: Sale[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateSale: (sale: Sale) => Promise<boolean>;
  onVerifySale: (saleId: string) => void;
  onValidateSale: (saleId: string) => void;
  onCancelSale: (saleId: string) => void;
}

export default function SalesView({
  sales,
  stores,
  articles,
  stocks,
  currentUser,
  onCreateSale,
  onVerifySale,
  onValidateSale,
  onCancelSale
}: SalesViewProps) {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  // New Sale Form
  const eligibleStores = stores.filter(s => s.store_type === "POS" || s.store_type === "RESELLER");
  const saleArticles = articles.filter(article => article.is_active && article.article_type === "RESALE");
  const [selectedStoreId, setSelectedStoreId] = useState(eligibleStores[0]?.id || stores[0]?.id || "");
  const [customerName, setCustomerName] = useState("Client Comptoir");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerType, setCustomerType] = useState<"PARTICULIER" | "REVENDEUR" | "ENTREPRISE">("PARTICULIER");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [saleNotes, setSaleNotes] = useState("");
  const [articleSearch, setArticleSearch] = useState("");
  const [mobileSaleStep, setMobileSaleStep] = useState<"PRODUCTS" | "CART" | "PAYMENT">("PRODUCTS");

  const [saleLines, setSaleLines] = useState<Array<{
    article_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
  }>>([]);

  const currentStore = stores.find(s => s.id === selectedStoreId);
  const isResellerStore = currentStore?.store_type === "RESELLER";

  // Helper to get default unit price based on store type (Section 7)
  const getDefaultPriceForArticle = (articleId: string, storeId: string): number => {
    const art = articles.find(a => a.id === articleId);
    if (!art) return 0;
    const store = stores.find(s => s.id === storeId);
    if (store?.store_type === "RESELLER") {
      return art.prix_revendeur;
    }
    return art.prix_normal; // POS default
  };

  const handleOpenModal = () => {
    const storeId = eligibleStores[0]?.id || stores[0]?.id || "";
    setSelectedStoreId(storeId);
    setCustomerName("Client Comptoir");
    setCustomerPhone("");
    setCustomerType("PARTICULIER");
    setPaymentMethod("CASH");
    setSaleNotes("");
    setArticleSearch("");
    setMobileSaleStep("PRODUCTS");
    
    // Default 1 line
    const firstArt = saleArticles[0];
    if (!firstArt) {
      window.alert("Aucun article destiné à la revente n'est disponible dans ce magasin.");
      return;
    }
    const defaultPrice = getDefaultPriceForArticle(firstArt.id, storeId);
    setSaleLines([{
      article_id: firstArt.id,
      quantity: 1,
      unit_price: defaultPrice,
      discount: 0
    }]);
    setAmountPaid(defaultPrice);
    setIsModalOpen(true);
  };

  const handleStoreChange = (newStoreId: string) => {
    setSelectedStoreId(newStoreId);
    // Update unit prices of all lines according to new store type
    setSaleLines(lines => lines.map(line => ({
      ...line,
      unit_price: getDefaultPriceForArticle(line.article_id, newStoreId)
    })));
  };

  const handleAddLine = () => {
    const art = saleArticles[0];
    if (!art) return;
    const p = getDefaultPriceForArticle(art.id, selectedStoreId);
    setSaleLines([...saleLines, { article_id: art.id, quantity: 1, unit_price: p, discount: 0 }]);
  };

  const handleAddArticle = (articleId: string) => {
    setSaleLines(lines => {
      const existingIndex = lines.findIndex(line => line.article_id === articleId);
      if (existingIndex >= 0) {
        return lines.map((line, index) => index === existingIndex
          ? { ...line, quantity: line.quantity + 1 }
          : line);
      }

      return [...lines, {
        article_id: articleId,
        quantity: 1,
        unit_price: getDefaultPriceForArticle(articleId, selectedStoreId),
        discount: 0
      }];
    });
  };

  const updateLineQuantity = (idx: number, quantity: number) => {
    setSaleLines(lines => lines.map((line, index) => index === idx
      ? { ...line, quantity: Math.max(1, quantity) }
      : line));
  };

  const handleRemoveLine = (idx: number) => {
    if (!window.confirm("Supprimer cette ligne de vente ?")) return;
    setSaleLines(saleLines.filter((_, i) => i !== idx));
  };

  // Calculations
  const subtotal = saleLines.reduce((acc, l) => acc + (l.quantity * l.unit_price), 0);
  const totalDiscount = saleLines.reduce((acc, l) => acc + l.discount, 0);
  const netTotal = Math.max(0, subtotal - totalDiscount);
  const changeReturned = Math.max(0, amountPaid - netTotal);

  const handleSubmitSale = async (e: FormEvent) => {
    e.preventDefault();
    if (saleLines.length === 0) {
      alert("Veuillez ajouter au moins un article.");
      return;
    }

    const saleNumber = generateRef("VTE", sales.length);
    const lines: SaleLine[] = saleLines.map((l, idx) => {
      const art = articles.find(a => a.id === l.article_id);
      return {
        id: `saleline-${Date.now()}-${idx}`,
        sale_id: `sale-${Date.now()}`,
        article_id: l.article_id,
        article_code: art?.code || "REF",
        article_name: art?.name || "Article",
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        total: Math.max(0, (l.quantity * l.unit_price) - l.discount)
      };
    });

    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      sale_number: saleNumber,
      store_id: selectedStoreId,
      customer_name: customerName || "Client Comptoir",
      customer_phone: customerPhone,
      customer_type: customerType,
      status: "DRAFT", // Enters 4-step control cycle
      seller_id: currentUser.uid,
      seller_name: currentUser.displayName || currentUser.email,
      lines,
      subtotal,
      discount: totalDiscount,
      tax: 0,
      total: netTotal,
      payment_method: paymentMethod,
      payment_status: amountPaid >= netTotal ? "PAID" : "PARTIAL",
      amount_paid: amountPaid,
      change_returned: changeReturned,
      notes: saleNotes,
      device_id: "POS-WEB-CLIENT",
      created_at: Date.now()
    };

    if (await onCreateSale(newSale)) setIsModalOpen(false);
  };

  const filteredSales = sales.filter(s => {
    if (filterStatus !== "ALL" && s.status !== filterStatus) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchNum = s.sale_number.toLowerCase().includes(q);
      const matchCust = s.customer_name.toLowerCase().includes(q);
      if (!matchNum && !matchCust) return false;
    }
    return true;
  });

  const filteredSaleArticles = saleArticles.filter(article => {
    const query = articleSearch.trim().toLowerCase();
    return !query || article.name.toLowerCase().includes(query) || article.code.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Ventes & Caisse POS / Revendeurs
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 7 & 8 : Tarification stricte selon type de magasin et cycle de contrôle en 4 étapes (DRAFT → CHECKING → VERIFIED → VALIDATED).
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouvelle Vente / Ticket Caisse
        </button>
      </div>

      {/* Rules Notice */}
      <div className="bg-emerald-950 text-emerald-100 p-4 rounded-2xl shadow-xs text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <span className="font-bold uppercase tracking-wider text-emerald-300">
            Automatisations de Grille Tarifaire :
          </span>
          <p className="text-emerald-200/90 mt-0.5">
            • <strong>Point de Vente (POS)</strong> : Applique automatiquement le <strong>prix_normal</strong> (prix public).<br />
            • <strong>Magasin Revendeur (RESELLER)</strong> : Applique automatiquement le <strong>prix_revendeur</strong>.<br />
            • <strong>Validation</strong> : Déclenche immédiatement la sortie de stock dans le magasin vendeur.
          </p>
        </div>
        <div className="bg-emerald-900 px-3 py-2 rounded-xl text-center shrink-0 border border-emerald-800">
          <div className="font-mono text-base font-black text-white">
            {sales.filter(s => s.status === "VALIDATED").reduce((acc, s) => acc + s.total, 0).toLocaleString("fr-FR")} Ar
          </div>
          <div className="text-[10px] text-emerald-300">Chiffre d'Affaires Validé</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        
        {/* Status filters */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {["ALL", "DRAFT", "CHECKING", "VERIFIED", "VALIDATED", "CANCELLED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterStatus === st 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {st === "ALL" ? "Toutes les Ventes" : st}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher ticket, client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">N° Vente</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Magasin</th>
                <th className="py-3 px-3">Client</th>
                <th className="py-3 px-3">Articles</th>
                <th className="py-3 px-3">Mode Paiement</th>
                <th className="py-3 px-3 text-right">Total Net</th>
                <th className="py-3 px-3">Statut & Étape</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => {
                const store = stores.find(s => s.id === sale.store_id);
                return (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                      {sale.sale_number}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(sale.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{store?.name}</span>
                      <div className="text-[10px] text-slate-400 font-mono">{store?.store_type}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{sale.customer_name}</div>
                      <span className="text-[10px] text-slate-400 font-semibold">{sale.customer_type}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {sale.lines.map(l => `${l.article_name} (x${l.quantity})`).join(", ")}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                      {sale.payment_method}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 text-sm">
                      {sale.total.toLocaleString("fr-FR")} Ar
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sale.status === "VALIDATED" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                        sale.status === "VERIFIED" ? "bg-blue-100 text-blue-800 border border-blue-300" :
                        sale.status === "CHECKING" ? "bg-amber-100 text-amber-800 border border-amber-300" :
                        sale.status === "CANCELLED" ? "bg-rose-100 text-rose-800 border border-rose-300" :
                        "bg-slate-100 text-slate-700 border border-slate-300"
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* 4-step workflow actions */}
                        {sale.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => onVerifySale(sale.id)}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded text-[10px] shadow-xs cursor-pointer"
                          >
                            Contrôler (CHECKING)
                          </button>
                        )}

                        {sale.status === "CHECKING" && (
                          <button
                            type="button"
                            onClick={() => onVerifySale(sale.id)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[10px] shadow-xs cursor-pointer"
                          >
                            Vérifier (VERIFIED)
                          </button>
                        )}

                        {sale.status === "VERIFIED" && (
                          <button
                            type="button"
                            onClick={() => onValidateSale(sale.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Valider Caisse & Stock
                          </button>
                        )}

                        {/* Print Receipt */}
                        <button
                          type="button"
                          onClick={() => setReceiptSale(sale)}
                          title="Imprimer le ticket"
                          className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-200 cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE NEW SALE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm md:p-4 md:flex md:items-center md:justify-center">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[min(92dvh,900px)] md:max-w-6xl md:rounded-3xl md:border md:border-white/20">
            <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-900 md:text-lg">Nouvelle vente</h3>
                    <p className="truncate text-[11px] text-slate-500">{currentStore?.name} · {isResellerStore ? "Tarif revendeur" : "Tarif public"}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 md:hidden">
                {(["PRODUCTS", "CART", "PAYMENT"] as const).map((step, index) => (
                  <button key={step} type="button" onClick={() => setMobileSaleStep(step)} className={`rounded-lg px-2 py-2 text-[11px] font-bold ${mobileSaleStep === step ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>
                    {index + 1}. {step === "PRODUCTS" ? "Articles" : step === "CART" ? `Panier (${saleLines.length})` : "Paiement"}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmitSale} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${mobileSaleStep === "PAYMENT" ? "md:flex md:items-stretch md:justify-center" : "md:grid md:grid-cols-[minmax(0,1fr)_400px]"}`}>
              <section className={`${mobileSaleStep === "PRODUCTS" ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:border-r md:border-slate-200`}>
                <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white p-4 md:p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">Magasin vendeur
                      <select value={selectedStoreId} onChange={(e) => handleStoreChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500">
                        {eligibleStores.map(store => <option key={store.id} value={store.id}>{store.name} ({store.store_type})</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">Rechercher un article
                      <span className="relative mt-1.5 block">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input value={articleSearch} onChange={(e) => setArticleSearch(e.target.value)} placeholder="Nom ou référence..." className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500" />
                      </span>
                    </label>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900">Catalogue</h4>
                    <span className="text-xs text-slate-500">{filteredSaleArticles.length} article(s)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-3">
                    {filteredSaleArticles.map(article => {
                      const stock = getArticleStock(stocks, selectedStoreId, article.id);
                      const price = getDefaultPriceForArticle(article.id, selectedStoreId);
                      return (
                        <button key={article.id} type="button" onClick={() => handleAddArticle(article.id)} disabled={stock <= 0} className="group min-w-0 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 lg:rounded-2xl lg:p-3">
                          <div className="flex items-start justify-between gap-1">
                            <div className="hidden h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 sm:grid"><Package className="h-4 w-4" /></div>
                            <span className={`rounded-full px-1.5 py-1 text-[9px] font-bold lg:px-2 lg:text-[10px] ${stock > 5 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>Stock {stock}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 min-h-8 text-[11px] font-bold leading-4 text-slate-900 lg:mt-3 lg:min-h-10 lg:text-sm">{article.name}</p>
                          <p className="mt-1 truncate text-[8px] font-medium uppercase tracking-wide text-slate-400 lg:text-[10px]">{article.code} · {article.unit}</p>
                          <div className="mt-2 flex items-center justify-between gap-1 lg:mt-3">
                            <span className="truncate font-mono text-[10px] font-black text-emerald-700 lg:text-xs">{price.toLocaleString("fr-FR")} Ar</span>
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-white group-hover:bg-emerald-600 lg:h-8 lg:w-8"><Plus className="h-3 w-3 lg:h-4 lg:w-4" /></span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {filteredSaleArticles.length === 0 && <div className="py-12 text-center text-sm text-slate-500">Aucun article trouvé.</div>}
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:hidden">
                  <button type="button" onClick={() => setMobileSaleStep("CART")} className="flex w-full items-center justify-between rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">
                    <span>Voir le panier · {saleLines.length}</span><span>{netTotal.toLocaleString("fr-FR")} Ar</span>
                  </button>
                </div>
              </section>

              <aside className={`${mobileSaleStep === "PRODUCTS" ? "hidden md:flex" : "flex"} min-h-0 flex-1 flex-col bg-white ${mobileSaleStep === "PAYMENT" ? "md:w-full md:max-w-2xl" : ""}`}>
                <div className={`${mobileSaleStep === "PAYMENT" ? "hidden" : "block"} min-h-0 flex-1 overflow-y-auto p-4 md:p-5`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div><h4 className="font-black text-slate-900">Panier</h4><p className="text-xs text-slate-500">{saleLines.length} ligne(s)</p></div>
                    <button type="button" onClick={handleAddLine} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">+ Ligne libre</button>
                  </div>
                  <div className="space-y-3">
                    {saleLines.map((line, idx) => {
                      const article = articles.find(item => item.id === line.article_id);
                      const lineTotal = Math.max(0, line.quantity * line.unit_price - line.discount);
                      const stock = getArticleStock(stocks, selectedStoreId, line.article_id);
                      return (
                        <div key={`${line.article_id}-${idx}`} className="rounded-2xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{article?.name}</p><p className={`text-[10px] font-semibold ${line.quantity > stock ? "text-rose-600" : "text-slate-400"}`}>Stock disponible : {stock}</p></div>
                            <button type="button" onClick={() => handleRemoveLine(idx)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
                          </div>
                          <div className="mt-3 flex items-end gap-2">
                            <div className="flex items-center rounded-xl border border-slate-200">
                              <button type="button" onClick={() => updateLineQuantity(idx, line.quantity - 1)} className="p-2 text-slate-600"><Minus className="h-4 w-4" /></button>
                              <input type="number" min="1" value={line.quantity} onChange={(e) => updateLineQuantity(idx, Number(e.target.value))} className="w-10 bg-transparent text-center font-mono font-bold text-slate-900 outline-none" />
                              <button type="button" onClick={() => updateLineQuantity(idx, line.quantity + 1)} className="p-2 text-slate-600"><Plus className="h-4 w-4" /></button>
                            </div>
                            <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-500">Prix
                              <input type="number" value={line.unit_price} onChange={(e) => setSaleLines(lines => lines.map((item, i) => i === idx ? { ...item, unit_price: Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-right font-mono text-xs text-slate-900" />
                            </label>
                            <div className="pb-2 text-right font-mono text-xs font-black text-slate-900">{lineTotal.toLocaleString("fr-FR")} Ar</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`${mobileSaleStep === "PAYMENT" ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4 md:p-6`}>
                  <div className="mb-5 overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm font-bold">Résumé du panier</span>
                      </div>
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold">{saleLines.length} article(s)</span>
                    </div>
                    <div className="space-y-2 px-4 py-3 text-xs">
                      <div className="flex justify-between text-slate-300"><span>Sous-total</span><span className="font-mono">{subtotal.toLocaleString("fr-FR")} Ar</span></div>
                      <div className="flex justify-between text-slate-300"><span>Remises</span><span className="font-mono">-{totalDiscount.toLocaleString("fr-FR")} Ar</span></div>
                      {paymentMethod === "CASH" && <div className="flex justify-between text-emerald-300"><span>Monnaie à rendre</span><span className="font-mono font-bold">{changeReturned.toLocaleString("fr-FR")} Ar</span></div>}
                    </div>
                    <div className="flex items-end justify-between bg-emerald-600 px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-emerald-50">Total à payer</span>
                      <span className="font-mono text-2xl font-black">{netTotal.toLocaleString("fr-FR")} Ar</span>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center gap-2"><WalletCards className="h-5 w-5 text-emerald-600" /><h4 className="font-black text-slate-900">Client et paiement</h4></div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                    <label className="text-xs font-bold text-slate-600">Client
                      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900" />
                    </label>
                    <label className="text-xs font-bold text-slate-600">Type de client
                      <select value={customerType} onChange={(e) => setCustomerType(e.target.value as "PARTICULIER" | "REVENDEUR" | "ENTREPRISE")} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900"><option value="PARTICULIER">Particulier</option><option value="REVENDEUR">Revendeur agréé</option><option value="ENTREPRISE">Entreprise / Clinique</option></select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
                      <input type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ex. 034 00 000 00" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900" />
                    </label>
                    <label className="text-xs font-bold text-slate-600">Mode de règlement
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-semibold text-slate-900"><option value="CASH">Espèces</option><option value="MVOLA">MVola</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHECK">Chèque bancaire</option></select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">Montant encaissé (Ar)
                      <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-right font-mono text-base font-black text-slate-900" />
                    </label>
                  </div>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5">
                  {mobileSaleStep === "PRODUCTS" ? (
                    <button type="button" onClick={() => { setAmountPaid(netTotal); setMobileSaleStep("PAYMENT"); }} className="hidden w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 font-bold text-white md:flex"><span>Suivant · Résumer l'achat</span><span className="font-mono">{netTotal.toLocaleString("fr-FR")} Ar</span></button>
                  ) : mobileSaleStep === "CART" ? (
                    <button type="button" onClick={() => { setAmountPaid(netTotal); setMobileSaleStep("PAYMENT"); }} className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 font-bold text-white md:hidden"><span>Continuer vers le paiement</span><span className="font-mono">{netTotal.toLocaleString("fr-FR")} Ar</span></button>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMobileSaleStep("PRODUCTS")} className="rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50">Retour</button>
                      <button type="submit" className="flex-1 rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700">Enregistrer la vente (DRAFT)</button>
                    </div>
                  )}
                </div>
              </aside>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DE CAISSE MODAL */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="printable-document bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 print:hidden">
              <span className="font-bold text-slate-900">Reçu Caisse Officiel</span>
              <button
                type="button"
                onClick={() => setReceiptSale(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Receipt Content */}
            <div className="my-4 text-center border-b border-dashed border-slate-300 pb-3">
              <img src="/branding/gileada-logo.png" alt="GILEADA Madagascar" className="mx-auto mb-2 h-20 w-44 object-contain" />
              <p className="text-[10px] text-slate-500">Soins Naturels & Remèdes Thérapeutiques</p>
              <p className="text-[10px] font-mono text-slate-400 mt-1">Ticket N° {receiptSale.sale_number}</p>
              <p className="text-[10px] text-slate-500">
                Date : {new Date(receiptSale.created_at).toLocaleString("fr-FR")}
              </p>
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
              {receiptSale.lines.map(l => (
                <div key={l.id} className="flex justify-between items-center text-[11px]">
                  <div>
                    <div className="font-medium text-slate-800">{l.article_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {l.quantity} x {l.unit_price.toLocaleString("fr-FR")} Ar
                    </div>
                  </div>
                  <div className="font-mono font-bold text-slate-900">
                    {l.total.toLocaleString("fr-FR")} Ar
                  </div>
                </div>
              ))}
            </div>

            <div className="my-3 space-y-1 text-right font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Total Net :</span>
                <span className="font-bold text-slate-900">{receiptSale.total.toLocaleString("fr-FR")} Ar</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Règlement ({receiptSale.payment_method}) :</span>
                <span>{receiptSale.amount_paid.toLocaleString("fr-FR")} Ar</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Monnaie rendue :</span>
                <span>{receiptSale.change_returned.toLocaleString("fr-FR")} Ar</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400">
              <p>Merci pour votre confiance en nos produits bio malgaches !</p>
              <p className="font-mono mt-0.5">Vendeur: {receiptSale.seller_name}</p>
            </div>

            <div className="mt-4 flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer le Reçu
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
