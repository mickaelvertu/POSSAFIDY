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
  FileCheck
} from "lucide-react";

interface SalesViewProps {
  sales: Sale[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateSale: (sale: Sale) => void;
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
  const [selectedStoreId, setSelectedStoreId] = useState(eligibleStores[0]?.id || stores[0]?.id || "");
  const [customerName, setCustomerName] = useState("Client Comptoir");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerType, setCustomerType] = useState<"PARTICULIER" | "REVENDEUR" | "ENTREPRISE">("PARTICULIER");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [saleNotes, setSaleNotes] = useState("");

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
    
    // Default 1 line
    const firstArt = articles.find(a => a.article_type === "RESALE") || articles[0];
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
    const art = articles.find(a => a.article_type === "RESALE") || articles[0];
    const p = getDefaultPriceForArticle(art.id, selectedStoreId);
    setSaleLines([...saleLines, { article_id: art.id, quantity: 1, unit_price: p, discount: 0 }]);
  };

  const handleRemoveLine = (idx: number) => {
    setSaleLines(saleLines.filter((_, i) => i !== idx));
  };

  // Calculations
  const subtotal = saleLines.reduce((acc, l) => acc + (l.quantity * l.unit_price), 0);
  const totalDiscount = saleLines.reduce((acc, l) => acc + l.discount, 0);
  const netTotal = Math.max(0, subtotal - totalDiscount);
  const changeReturned = Math.max(0, amountPaid - netTotal);

  const handleSubmitSale = (e: FormEvent) => {
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

    onCreateSale(newSale);
    setIsModalOpen(false);
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Enregistrer une Vente en Caisse</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSale} className="mt-4 space-y-4 text-xs">
              
              {/* Store & Customer details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Magasin Vendeur :
                  </label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => handleStoreChange(e.target.value)}
                    className="w-full font-semibold bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
                  >
                    {eligibleStores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.store_type})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Grille : {isResellerStore ? "Tarif Revendeur" : "Tarif Normal (Public)"}
                  </span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom du Client :</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nom du client..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type de Client :</label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2"
                  >
                    <option value="PARTICULIER">Particulier</option>
                    <option value="REVENDEUR">Revendeur Agréé</option>
                    <option value="ENTREPRISE">Entreprise / Clinique</option>
                  </select>
                </div>
              </div>

              {/* Articles table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-800">Articles vendus :</label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter un article
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {saleLines.map((line, idx) => {
                    const lineTotal = Math.max(0, (line.quantity * line.unit_price) - line.discount);
                    const stockAvail = getArticleStock(stocks, selectedStoreId, line.article_id);

                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                        <select
                          value={line.article_id}
                          onChange={(e) => {
                            const newArtId = e.target.value;
                            const newLines = [...saleLines];
                            newLines[idx].article_id = newArtId;
                            newLines[idx].unit_price = getDefaultPriceForArticle(newArtId, selectedStoreId);
                            setSaleLines(newLines);
                          }}
                          className="flex-1 bg-white border border-slate-300 rounded-lg p-2"
                        >
                          {articles.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.code}] {a.name} ({a.unit})
                            </option>
                          ))}
                        </select>

                        <div className="w-16">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const newLines = [...saleLines];
                              newLines[idx].quantity = Math.max(1, Number(e.target.value));
                              setSaleLines(newLines);
                            }}
                            className="w-full text-right font-mono font-bold bg-white border border-slate-300 rounded-lg p-2"
                            placeholder="Qté"
                          />
                        </div>

                        <div className="w-24">
                          <input
                            type="number"
                            value={line.unit_price}
                            onChange={(e) => {
                              const newLines = [...saleLines];
                              newLines[idx].unit_price = Number(e.target.value);
                              setSaleLines(newLines);
                            }}
                            className="w-full text-right font-mono bg-white border border-slate-300 rounded-lg p-2"
                            placeholder="PU"
                          />
                        </div>

                        <div className="w-20">
                          <input
                            type="number"
                            value={line.discount}
                            onChange={(e) => {
                              const newLines = [...saleLines];
                              newLines[idx].discount = Number(e.target.value);
                              setSaleLines(newLines);
                            }}
                            className="w-full text-right font-mono text-rose-600 bg-white border border-slate-300 rounded-lg p-2"
                            placeholder="Remise"
                          />
                        </div>

                        <div className="w-24 text-right font-mono font-bold text-slate-900">
                          {lineTotal.toLocaleString("fr-FR")} Ar
                        </div>

                        <span className="text-[10px] text-slate-400 font-mono w-14 text-right">
                          Stock: {stockAvail}
                        </span>

                        {saleLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals & Payment method */}
              <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Payment method */}
                <div className="space-y-2">
                  <label className="font-bold text-slate-700 block">Mode de Règlement :</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full font-semibold bg-white border border-slate-300 rounded-lg p-2"
                  >
                    <option value="CASH">Espèces (Ariary)</option>
                    <option value="MVOLA">MVola (Telma)</option>
                    <option value="AIRTEL_MONEY">Airtel Money</option>
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="BANK_TRANSFER">Virement Bancaire (BMOI / BNI / BFV)</option>
                    <option value="CHECK">Chèque Bancaire</option>
                  </select>

                  <div>
                    <label className="font-bold text-slate-700 block">Montant Encaissé (Ar) :</label>
                    <input
                      type="number"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                      className="w-full font-mono font-bold text-base bg-white border border-slate-300 rounded-lg p-2"
                    />
                  </div>

                  {paymentMethod === "CASH" && (
                    <div className="font-semibold text-slate-700">
                      Monnaie à rendre : <span className="font-mono text-emerald-700 font-bold text-sm">{changeReturned.toLocaleString("fr-FR")} Ar</span>
                    </div>
                  )}
                </div>

                {/* Subtotal & Total display */}
                <div className="flex flex-col justify-between text-right space-y-1">
                  <div>
                    <div className="text-slate-500">Sous-Total Brut : {subtotal.toLocaleString("fr-FR")} Ar</div>
                    <div className="text-rose-600">Remise Totale : -{totalDiscount.toLocaleString("fr-FR")} Ar</div>
                    <div className="text-slate-500">TVA (0% Médicaments/Naturels) : 0 Ar</div>
                  </div>

                  <div className="pt-2 border-t border-slate-300">
                    <span className="text-xs uppercase font-bold text-slate-600 block">Total Net à Payer :</span>
                    <span className="font-mono text-2xl font-black text-emerald-700">
                      {netTotal.toLocaleString("fr-FR")} Ar
                    </span>
                  </div>
                </div>

              </div>

              {/* Actions */}
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
                  className="px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Enregistrer la Vente (DRAFT)
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* TICKET DE CAISSE MODAL */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
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
              <h4 className="font-serif font-black text-base text-blue-900">GILEADA MADAGASCAR</h4>
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

            <div className="mt-4 flex gap-2">
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
