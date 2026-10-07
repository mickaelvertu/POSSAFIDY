import { useState, FormEvent } from "react";
import { 
  Sale, 
  SaleLine, 
  Store, 
  Article, 
  StoreStock, 
  UserProfile, 
  CreditCustomer,
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
  WalletCards,
  Pencil
} from "lucide-react";

interface SalesViewProps {
  sales: Sale[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  creditCustomers: CreditCustomer[];
  canCreateResellerSale: boolean;
  onCreateSale: (sale: Sale) => Promise<boolean>;
  onUpdateSale: (originalSale: Sale, sale: Sale) => Promise<boolean>;
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
  creditCustomers,
  canCreateResellerSale,
  onCreateSale,
  onUpdateSale,
  onVerifySale,
  onValidateSale,
  onCancelSale
}: SalesViewProps) {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  // New Sale Form
  const eligibleStores = stores.filter(s => s.store_type === "POS" || (canCreateResellerSale && s.store_type === "CENTRAL_WAREHOUSE"));
  const saleArticles = articles.filter(article => article.is_active && article.article_type === "RESALE");
  const [selectedStoreId, setSelectedStoreId] = useState(eligibleStores[0]?.id || stores[0]?.id || "");
  const [customerName, setCustomerName] = useState("Client Comptoir");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerType, setCustomerType] = useState<"PARTICULIER" | "REVENDEUR" | "ENTREPRISE">("PARTICULIER");
  const [creditCustomerId, setCreditCustomerId] = useState("");
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
    line_type?: "PRODUCT" | "SERVICE";
    label?: string;
    reason?: string;
  }>>([]);

  const currentStore = stores.find(s => s.id === selectedStoreId);
  const isResellerSale = customerType === "REVENDEUR";
  const selectedCreditCustomer = creditCustomers.find(customer => customer.id === creditCustomerId && customer.is_active);

  // Helper to get default unit price based on store type (Section 7)
  const getDefaultPriceForArticle = (articleId: string, storeId: string): number => {
    const art = articles.find(a => a.id === articleId);
    if (!art) return 0;
    const store = stores.find(s => s.id === storeId);
    if (store?.store_type === "RESELLER" || (customerType === "REVENDEUR" && store?.store_type === "CENTRAL_WAREHOUSE")) {
      return art.prix_revendeur;
    }
    return art.prix_normal; // POS default
  };

  const handleOpenModal = () => {
    setEditingSale(null);
    const storeId = eligibleStores[0]?.id || stores[0]?.id || "";
    setSelectedStoreId(storeId);
    setCustomerName("Client Comptoir");
    setCustomerPhone("");
    setCustomerType("PARTICULIER");
    setCreditCustomerId("");
    setPaymentMethod("CASH");
    setSaleNotes("");
    setArticleSearch("");
    setMobileSaleStep("PRODUCTS");
    
    if (saleArticles.length === 0) {
      window.alert("Aucun article destiné à la revente n'est disponible dans ce magasin.");
      return;
    }
    setSaleLines([]);
    setAmountPaid(0);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sale: Sale) => {
    if (sale.status !== "DRAFT" || sale.seller_id !== currentUser.uid) return;
    setEditingSale(sale);
    setSelectedStoreId(sale.store_id);
    setCustomerName(sale.customer_name);
    setCustomerPhone(sale.customer_phone || "");
    setCustomerType(sale.customer_type);
    setCreditCustomerId(sale.credit_customer_id || "");
    setPaymentMethod(sale.payment_method);
    setAmountPaid(sale.amount_paid);
    setSaleNotes(sale.notes || "");
    setArticleSearch("");
    setMobileSaleStep("PRODUCTS");
    setSaleLines(sale.lines.map(line => ({
      article_id: line.article_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount: line.discount,
      line_type: line.line_type,
      label: line.line_type === "SERVICE" ? line.article_name : undefined,
      reason: line.price_reason
    })));
    setIsModalOpen(true);
  };

  const handlePrintReceipt = () => {
    const receipt = document.querySelector<HTMLElement>(".thermal-receipt");
    if (!receipt) {
      window.print();
      return;
    }

    receipt.classList.add("thermal-print-sizing");
    const contentHeightMm = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 2;
    const pageStyle = document.createElement("style");
    pageStyle.textContent = `@page thermal-receipt { size: 80mm ${contentHeightMm}mm; margin: 0; }`;
    document.head.appendChild(pageStyle);
    window.addEventListener("afterprint", () => {
      receipt.classList.remove("thermal-print-sizing");
      pageStyle.remove();
    }, { once: true });
    window.print();
  };

  const handleStoreChange = (newStoreId: string) => {
    setSelectedStoreId(newStoreId);
    if (stores.find(store => store.id === newStoreId)?.store_type !== "CENTRAL_WAREHOUSE") {
      setCustomerType("PARTICULIER");
      setCreditCustomerId("");
    }
    // Update unit prices of all lines according to new store type
    setSaleLines(lines => lines.map(line => line.line_type === "SERVICE" ? line : ({
      ...line,
      unit_price: getDefaultPriceForArticle(line.article_id, newStoreId)
    })));
  };

  const handleAddService = () => {
    if (isResellerSale) return;
    setSaleLines(lines => [...lines, {
      article_id: `service-${Date.now()}-${lines.length}`,
      quantity: 1,
      unit_price: 0,
      discount: 0,
      line_type: "SERVICE",
      label: "Consultation",
      reason: ""
    }]);
  };

  const updateServiceLine = (idx: number, patch: { label?: string; reason?: string; unit_price?: number }) => {
    setSaleLines(lines => lines.map((line, index) => index === idx ? { ...line, ...patch } : line));
  };

  const handleAddLine = () => {
    const art = saleArticles.find(article => {
      const available = getArticleStock(stocks, selectedStoreId, article.id);
      const inCart = saleLines
        .filter(line => line.article_id === article.id)
        .reduce((quantity, line) => quantity + line.quantity, 0);
      return available > inCart;
    });
    if (!art) {
      window.alert("Aucun article supplémentaire n'est disponible dans ce magasin.");
      return;
    }
    const p = getDefaultPriceForArticle(art.id, selectedStoreId);
    setSaleLines([...saleLines, { article_id: art.id, quantity: 1, unit_price: p, discount: 0 }]);
  };

  const handleAddArticle = (articleId: string) => {
    const available = getArticleStock(stocks, selectedStoreId, articleId);
    const alreadyInCart = saleLines
      .filter(line => line.article_id === articleId)
      .reduce((quantity, line) => quantity + line.quantity, 0);
    if (alreadyInCart >= available) return;

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
  const stockIssues = [...saleLines.filter(line => line.line_type !== "SERVICE").reduce((quantities, line) => {
    quantities.set(line.article_id, (quantities.get(line.article_id) || 0) + line.quantity);
    return quantities;
  }, new Map<string, number>())].flatMap(([articleId, quantity]) => {
    const available = getArticleStock(stocks, selectedStoreId, articleId);
    if (quantity <= available) return [];
    const article = articles.find(item => item.id === articleId);
    return [{ name: article?.name || "Article", quantity, available }];
  });

  const hasInvalidService = saleLines.some(line => line.line_type === "SERVICE"
    && (!line.label?.trim() || !line.reason?.trim() || !(line.unit_price > 0)));
  const creditDue = Math.max(0, netTotal - amountPaid);
  const creditAvailable = selectedCreditCustomer
    ? Math.max(0, selectedCreditCustomer.credit_limit - selectedCreditCustomer.outstanding_balance
      + (editingSale?.credit_customer_id === selectedCreditCustomer.id
        ? Math.max(0, editingSale.total - editingSale.amount_paid)
        : 0))
    : 0;
  const exceedsCreditLimit = customerType === "REVENDEUR" && creditDue > 0
    && (!selectedCreditCustomer || creditDue > creditAvailable);

  const handleSubmitSale = async (e: FormEvent) => {
    e.preventDefault();
    if (saleLines.length === 0) {
      alert("Veuillez ajouter au moins un article.");
      return;
    }
    if (stockIssues.length > 0) {
      alert(stockIssues.map(issue => `Stock insuffisant pour ${issue.name}. Demandé : ${issue.quantity}. Disponible : ${issue.available}.`).join("\n"));
      return;
    }

    if (hasInvalidService) {
      alert("Chaque prestation doit avoir un libellé, un prix supérieur à 0 et un motif.");
      return;
    }
    if (editingSale && netTotal < amountPaid) {
      alert("Le total modifié ne peut pas être inférieur au montant déjà encaissé.");
      return;
    }
    if (isResellerSale && (
      !canCreateResellerSale ||
      currentStore?.store_type !== "CENTRAL_WAREHOUSE" ||
      saleLines.some(line => line.line_type === "SERVICE")
    )) {
      alert("Une demande revendeur doit être créée par un responsable du dépôt central et ne contenir que des produits de revente.");
      return;
    }
    if (exceedsCreditLimit) {
      alert(selectedCreditCustomer
        ? `Plafond dépassé. Crédit disponible pour ${selectedCreditCustomer.name} : ${creditAvailable.toLocaleString("fr-FR")} Ar.`
        : "Un compte revendeur actif doit être sélectionné pour une vente à crédit.");
      return;
    }

    const saleId = editingSale?.id || `sale-${Date.now()}`;
    const saleNumber = editingSale?.sale_number || generateRef("VTE", sales.length);
    const lines: SaleLine[] = saleLines.map((l, idx) => {
      if (l.line_type === "SERVICE") {
        return {
          id: `saleline-${Date.now()}-${idx}`,
          sale_id: saleId,
          article_id: l.article_id,
          article_code: "PREST",
          article_name: l.label!.trim(),
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
          total: Math.max(0, (l.quantity * l.unit_price) - l.discount),
          line_type: "SERVICE",
          price_reason: l.reason!.trim()
        };
      }
      const art = articles.find(a => a.id === l.article_id);
      return {
        id: `saleline-${Date.now()}-${idx}`,
        sale_id: saleId,
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
      id: saleId,
      sale_number: saleNumber,
      store_id: selectedStoreId,
      customer_name: customerName || "Client Comptoir",
      customer_phone: customerPhone,
      customer_type: customerType,
      credit_customer_id: editingSale?.credit_customer_id || selectedCreditCustomer?.id,
      credit_due_at: selectedCreditCustomer && creditDue > 0
        ? Date.now() + selectedCreditCustomer.payment_term_days * 24 * 60 * 60 * 1000
        : undefined,
      credit_payments: editingSale?.credit_payments ?? (selectedCreditCustomer && amountPaid > 0 ? [{
        id: `credit-payment-${crypto.randomUUID()}`,
        amount: Math.min(amountPaid, netTotal),
        method: paymentMethod,
        paid_at: Date.now(),
        recorded_by: currentUser.uid,
        recorded_by_name: currentUser.displayName || currentUser.email
      }] : undefined),
      status: "DRAFT", // Enters 4-step control cycle
      seller_id: currentUser.uid,
      seller_name: currentUser.displayName || currentUser.email,
      lines,
      subtotal,
      discount: totalDiscount,
      tax: 0,
      total: netTotal,
      payment_method: paymentMethod,
      payment_status: amountPaid >= netTotal ? "PAID" : amountPaid > 0 ? "PARTIAL" : "PENDING",
      amount_paid: amountPaid,
      change_returned: changeReturned,
      notes: saleNotes,
      device_id: "POS-WEB-CLIENT",
      created_at: editingSale?.created_at ?? Date.now()
    };

    const saved = editingSale
      ? await onUpdateSale(editingSale, newSale)
      : await onCreateSale(newSale);
    if (saved) {
      setIsModalOpen(false);
      setEditingSale(null);
    }
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
  const availableSaleArticles = saleArticles.filter(article => {
    const available = getArticleStock(stocks, selectedStoreId, article.id);
    const inCart = saleLines
      .filter(line => line.article_id === article.id)
      .reduce((quantity, line) => quantity + line.quantity, 0);
    return available > inCart;
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
            • <strong>Demande revendeur</strong> : créée uniquement par un responsable du dépôt central, au <strong>prix revendeur</strong>.<br />
            • <strong>Approbation</strong> : un administrateur doit valider la demande avant la sortie du stock.
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
                      {sale.customer_type === "REVENDEUR" && sale.status === "VERIFIED" && (
                        <div className="mt-1 text-[10px] font-bold text-amber-700">En attente d'approbation admin</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* 4-step workflow actions */}
                        {sale.status === "DRAFT" && (
                          sale.seller_id === currentUser.uid && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(sale)}
                              className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-800"
                              title="Modifier le brouillon"
                            >
                              <Pencil className="h-3 w-3" /> Modifier
                            </button>
                          )
                        )}

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
                          sale.customer_type !== "REVENDEUR" || currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN"
                        ) && (
                          <button
                            type="button"
                            onClick={() => onValidateSale(sale.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {sale.customer_type === "REVENDEUR" ? "Approuver & débiter le stock" : "Valider Caisse & Stock"}
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
                    <h3 className="truncate text-base font-black text-slate-900 md:text-lg">{editingSale ? `Modifier le brouillon ${editingSale.sale_number}` : "Nouvelle vente"}</h3>
                    <p className="truncate text-[11px] text-slate-500">{currentStore?.name} · {isResellerSale ? "Demande revendeur" : "Tarif public"}</p>
                    {isResellerSale && <p className="mt-1 text-[11px] font-semibold text-amber-700">La demande restera en brouillon jusqu'à l'approbation d'un administrateur.</p>}
                  </div>
                </div>
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 md:hidden">
                {(["PRODUCTS", "CART", "PAYMENT"] as const).map((step, index) => (
                  <button key={step} type="button" onClick={() => setMobileSaleStep(step)} disabled={step === "CART" && saleLines.length === 0 || step === "PAYMENT" && (saleLines.length === 0 || stockIssues.length > 0)} className={`rounded-lg px-2 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${mobileSaleStep === step ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>
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

                <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5" dir="rtl">
                  <div dir="ltr">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-bold text-slate-900">Catalogue</h4>
                    <div className="flex items-center gap-2">
                      {!isResellerSale && <button type="button" onClick={handleAddService} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">+ Prestation (prix libre)</button>}
                      <span className="text-xs text-slate-500">{availableSaleArticles.length} disponible(s) / {saleArticles.length}</span>
                    </div>
                  </div>
                  {availableSaleArticles.length === 0 && (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                      Aucun article en stock dans ce magasin. Le stock doit être réapprovisionné avant une vente.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredSaleArticles.map(article => {
                      const stock = getArticleStock(stocks, selectedStoreId, article.id);
                      const inCart = saleLines
                        .filter(line => line.article_id === article.id)
                        .reduce((quantity, line) => quantity + line.quantity, 0);
                      const price = getDefaultPriceForArticle(article.id, selectedStoreId);
                      return (
                        <button key={article.id} type="button" onClick={() => handleAddArticle(article.id)} disabled={stock <= inCart} className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30 disabled:cursor-not-allowed disabled:opacity-50">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Package className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-bold text-slate-900">{article.name}</span>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${stock > 5 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>Stock {stock}</span>
                            </span>
                            <span className="mt-1 flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-medium uppercase text-slate-400">{article.code} · {article.unit}</span>
                              <span className="shrink-0 font-mono text-xs font-black text-emerald-700">{price.toLocaleString("fr-FR")} Ar</span>
                            </span>
                          </span>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white transition group-hover:bg-emerald-600"><Plus className="h-4 w-4" /></span>
                        </button>
                      );
                    })}
                  </div>
                  {filteredSaleArticles.length === 0 && <div className="py-12 text-center text-sm text-slate-500">Aucun article trouvé.</div>}
                  </div>
                </div>
                <div className="shrink-0 border-t border-slate-200 bg-white p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:hidden">
                  <button type="button" onClick={() => setMobileSaleStep("CART")} disabled={saleLines.length === 0} className="flex w-full items-center justify-between rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
                    <span>Voir le panier · {saleLines.length}</span><span>{netTotal.toLocaleString("fr-FR")} Ar</span>
                  </button>
                </div>
              </section>

              <aside className={`${mobileSaleStep === "PRODUCTS" ? "hidden md:flex" : "flex"} min-h-0 flex-1 flex-col bg-white ${mobileSaleStep === "PAYMENT" ? "md:w-full md:max-w-2xl" : ""}`}>
                <div className={`${mobileSaleStep === "PAYMENT" ? "hidden" : "block"} min-h-0 flex-1 overflow-y-auto p-4 md:p-5`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div><h4 className="font-black text-slate-900">Panier</h4><p className="text-xs text-slate-500">{saleLines.length} ligne(s)</p></div>
                    <div className="flex items-center gap-2">
                    <button type="button" onClick={handleAddLine} disabled={availableSaleArticles.length === 0} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">+ Article en stock</button>
                    {!isResellerSale && <button type="button" onClick={handleAddService} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">+ Prestation</button>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {saleLines.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Panier vide. Sélectionnez un article disponible dans le catalogue.</p>}
                    {saleLines.map((line, idx) => {
                      const article = articles.find(item => item.id === line.article_id);
                      const lineTotal = Math.max(0, line.quantity * line.unit_price - line.discount);
                      const stock = getArticleStock(stocks, selectedStoreId, line.article_id);
                      if (line.line_type === "SERVICE") {
                        return (
                          <div key={line.article_id} className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Prestation · sans stock</span>
                              <button type="button" onClick={() => handleRemoveLine(idx)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
                            </div>
                            <label className="mt-2 block text-[10px] font-bold text-slate-500">Prestation
                              <input value={line.label || ""} onChange={(e) => updateServiceLine(idx, { label: e.target.value })} placeholder="Ex. Consultation" className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900" />
                            </label>
                            <label className="mt-2 block text-[10px] font-bold text-slate-500">Motif du prix saisi <span className="text-rose-600">*</span>
                              <input value={line.reason || ""} onChange={(e) => updateServiceLine(idx, { reason: e.target.value })} placeholder="Ex. Consultation à domicile, suivi, tarif négocié..." className={`mt-1 w-full rounded-lg border bg-white p-2 text-xs text-slate-900 ${line.reason?.trim() ? "border-slate-200" : "border-rose-300"}`} />
                            </label>
                            <div className="mt-3 flex items-end gap-2">
                              <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                                <button type="button" onClick={() => updateLineQuantity(idx, line.quantity - 1)} className="p-2 text-slate-600"><Minus className="h-4 w-4" /></button>
                                <input type="number" min="1" value={line.quantity} onChange={(e) => updateLineQuantity(idx, Number(e.target.value))} className="w-10 bg-transparent text-center font-mono font-bold text-slate-900 outline-none" />
                                <button type="button" onClick={() => updateLineQuantity(idx, line.quantity + 1)} className="p-2 text-slate-600"><Plus className="h-4 w-4" /></button>
                              </div>
                              <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-500">Prix (Ar)
                                <input type="number" min="0" value={line.unit_price || ""} onChange={(e) => updateServiceLine(idx, { unit_price: Math.max(0, Number(e.target.value)) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-right font-mono text-xs text-slate-900" />
                              </label>
                              <div className="pb-2 text-right font-mono text-xs font-black text-slate-900">{lineTotal.toLocaleString("fr-FR")} Ar</div>
                            </div>
                          </div>
                        );
                      }
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
                    <label className="text-xs font-bold text-slate-600">Type de client
                      <select value={customerType} disabled={Boolean(editingSale)} onChange={(e) => {
                        const type = e.target.value as "PARTICULIER" | "REVENDEUR" | "ENTREPRISE";
                        setCustomerType(type);
                        if (type !== "REVENDEUR") setCreditCustomerId("");
                        setSaleLines(lines => lines.map(line => {
                          if (line.line_type === "SERVICE") return line;
                          const article = articles.find(item => item.id === line.article_id);
                          const store = stores.find(item => item.id === selectedStoreId);
                          return {
                            ...line,
                            unit_price: store?.store_type === "RESELLER" || (type === "REVENDEUR" && store?.store_type === "CENTRAL_WAREHOUSE")
                              ? article?.prix_revendeur || 0
                              : article?.prix_normal || 0
                          };
                        }));
                      }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900"><option value="PARTICULIER">Particulier</option>{canCreateResellerSale && currentStore?.store_type === "CENTRAL_WAREHOUSE" && <option value="REVENDEUR">Revendeur agréé</option>}<option value="ENTREPRISE">Entreprise / Clinique</option></select>
                    </label>
                    {customerType === "REVENDEUR" ? (
                      <label className="text-xs font-bold text-slate-600">Compte revendeur
                        <select value={creditCustomerId} disabled={Boolean(editingSale)} onChange={event => {
                          const customer = creditCustomers.find(item => item.id === event.target.value);
                          setCreditCustomerId(event.target.value);
                          if (customer) {
                            setCustomerName(customer.name);
                            setCustomerPhone(customer.phone);
                          }
                        }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900">
                          <option value="">Sélectionner un revendeur…</option>
                          {creditCustomers.filter(customer => customer.is_active).map(customer => (
                            <option key={customer.id} value={customer.id}>{customer.name} · crédit dispo {Math.max(0, customer.credit_limit - customer.outstanding_balance).toLocaleString("fr-FR")} Ar</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="text-xs font-bold text-slate-600">Client
                        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900" />
                      </label>
                    )}
                    <label className="text-xs font-bold text-slate-600">Téléphone <span className="font-normal text-slate-400">(facultatif)</span>
                      <input type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ex. 034 00 000 00" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900" />
                    </label>
                    <label className="text-xs font-bold text-slate-600">Mode de règlement
                      <select value={paymentMethod} disabled={Boolean(editingSale)} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-semibold text-slate-900 disabled:bg-slate-100"><option value="CASH">Espèces</option><option value="MVOLA">MVola</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHECK">Chèque bancaire</option></select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">Montant encaissé (Ar)
                      <input type="number" min="0" value={amountPaid} disabled={Boolean(editingSale)} onChange={(e) => setAmountPaid(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-right font-mono text-base font-black text-slate-900 disabled:bg-slate-100" />
                    </label>
                  </div>
                  {customerType === "REVENDEUR" && (
                    <div className={`mt-3 rounded-xl border p-3 text-xs ${exceedsCreditLimit ? "border-rose-200 bg-rose-50 text-rose-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>
                      {!selectedCreditCustomer
                        ? "Sélectionnez un compte revendeur actif pour vérifier le plafond et appliquer l'échéance."
                        : creditDue > 0
                          ? `Solde à crédit : ${creditDue.toLocaleString("fr-FR")} Ar · Disponible après vente : ${Math.max(0, creditAvailable - creditDue).toLocaleString("fr-FR")} Ar · Échéance à ${selectedCreditCustomer.payment_term_days} jours.`
                          : `Plafond disponible : ${creditAvailable.toLocaleString("fr-FR")} Ar · Vente réglée immédiatement.`}
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5">
                  {mobileSaleStep === "PRODUCTS" ? (
                    <button type="button" onClick={() => { if (!editingSale) setAmountPaid(netTotal); setMobileSaleStep("PAYMENT"); }} disabled={saleLines.length === 0} className="hidden w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400 md:flex"><span>Suivant · Résumer l'achat</span><span className="font-mono">{netTotal.toLocaleString("fr-FR")} Ar</span></button>
                  ) : mobileSaleStep === "CART" ? (
                    <button type="button" onClick={() => { if (!editingSale) setAmountPaid(netTotal); setMobileSaleStep("PAYMENT"); }} disabled={saleLines.length === 0 || stockIssues.length > 0 || hasInvalidService} className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400 md:hidden"><span>Continuer vers le paiement</span><span className="font-mono">{netTotal.toLocaleString("fr-FR")} Ar</span></button>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setMobileSaleStep("CART")} className="rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50">Retour au panier</button>
                      <button type="submit" disabled={saleLines.length === 0 || stockIssues.length > 0 || hasInvalidService || exceedsCreditLimit} className="flex-1 rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none">{editingSale ? "Enregistrer les modifications" : isResellerSale ? "Soumettre la demande (DRAFT)" : "Enregistrer la vente (DRAFT)"}</button>
                    </div>
                  )}
                  {mobileSaleStep === "PAYMENT" && stockIssues.length > 0 && (
                    <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                      Stock insuffisant : {stockIssues.map(issue => `${issue.name} (${issue.available}/${issue.quantity})`).join(", ")}
                    </p>
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
          <div className="printable-document thermal-receipt bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 text-xs">
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
                    {l.price_reason && <div className="text-[10px] italic text-slate-500">Motif : {l.price_reason}</div>}
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
                onClick={handlePrintReceipt}
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
