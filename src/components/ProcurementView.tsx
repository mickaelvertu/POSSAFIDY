import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AuditLog,
  Article,
  PaymentMethod,
  Purchase,
  PurchaseLine,
  Store,
  StoreStock,
  Supplier,
  SupplierPayment,
  UserProfile
} from "../types";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Plus,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { canPurchaseArticle } from "../services/purchaseEligibility";
import DataManagementActions from "./DataManagementActions";
import { createSequentialId } from "../services/idService";
import { supplierMonthlyPayments } from "../services/supplierMonthlyPayments";

interface ProcurementViewProps {
  onBack: () => void;
  suppliers: Supplier[];
  purchases: Purchase[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  treasuryFunds?: import("../types").TreasuryFund[];
  treasuryReady?: boolean;
  auditLogs: AuditLog[];
  onUpdatePurchase: (purchase: Purchase, previous: Purchase) => Promise<void>;
  onCreateSupplier: (supplier: Supplier) => Promise<void>;
  onToggleSupplier: (supplier: Supplier) => Promise<void>;
  onDeleteSupplier: (supplier: Supplier) => Promise<void>;
  onCreatePurchase: (purchase: Purchase) => Promise<void>;
  onCancelPurchase: (purchase: Purchase, reason: string) => Promise<void>;
  onDeletePurchase: (purchase: Purchase) => Promise<void>;
  onApprovePurchase: (purchase: Purchase) => Promise<void>;
  onRecordPayment: (purchase: Purchase, payment: SupplierPayment) => Promise<void>;
  onImportData: (data: Supplier[]) => Promise<void>;
  onResetData: () => Promise<void>;
}

interface DraftLine {
  articleId: string;
  articleQuery: string;
  quantity: number;
  unitCost: number;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "CASH", label: "Espèces" },
  { value: "MVOLA", label: "MVola" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "CHECK", label: "Chèque" }
];

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const dateLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString("fr-FR");
const articleOptionLabel = (article: Article) => `${article.code} · ${article.name}`;
const supplierOptionLabel = (supplier: Supplier) => `${supplier.name}${supplier.phone ? ` · ${supplier.phone}` : ""}`;
const receivingStoreOptionLabel = (store: Store) => `${store.code} · ${store.name}`;

function purchaseDeletionReason(purchase: Purchase): string {
  if (purchase.status === "CANCELLED") return "Cet achat est annulé et conservé dans l’historique.";
  const reasons: string[] = [];
  if (purchase.amount_paid !== 0 || purchase.payments.length > 0) reasons.push("un paiement est enregistré");
  if (purchase.status === "RECEIVED" || purchase.received_at) reasons.push("la réception est enregistrée");
  if (!["DRAFT", "APPROVED", "RECEIVED"].includes(purchase.status || "")) reasons.push("le statut de cet achat ne permet pas sa suppression");
  return reasons.length ? "Suppression impossible : " + reasons.join(" et ") + "." : "";
}

export default function ProcurementView({
  onBack,
  suppliers,
  purchases,
  stores,
  articles,
  stocks,
  currentUser,
  treasuryFunds = [],
  treasuryReady = false,
  auditLogs,
  onUpdatePurchase,
  onCreateSupplier,
  onToggleSupplier,
  onDeleteSupplier,
  onCreatePurchase,
  onApprovePurchase,
  onDeletePurchase,
  onCancelPurchase,
  onRecordPayment,
  onImportData,
  onResetData
}: ProcurementViewProps) {
  const [cancellationMode, setCancellationMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [deletionError, setDeletionError] = useState("");
  const deletionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (purchaseToDelete && !deletionDialog.current?.open) deletionDialog.current?.showModal();
    if (!purchaseToDelete && deletionDialog.current?.open) deletionDialog.current.close();
  }, [purchaseToDelete]);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierDetails, setSupplierDetails] = useState<Supplier | null>(null);
  const [supplierPurchaseFilter, setSupplierPurchaseFilter] = useState<"ALL" | "PAID" | "OPEN" | "MONTH">("ALL");
  const [paymentMonth, setPaymentMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState("");
  const monthlyPayments = useMemo(() => supplierMonthlyPayments(purchases, paymentMonth), [purchases, paymentMonth]);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [supplierStatus, setSupplierStatus] = useState("");
  const matchesSearch = (values: unknown[]) => values.join(" ").toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"));
  const filteredPurchases = purchases.filter(p => matchesSearch([p.purchase_number, p.invoice_number, p.supplier_name, p.created_by_name, p.notes, ...p.lines.map(l => l.article_code + " " + l.article_name)]) &&
    (!statusFilter || (p.status || "RECEIVED") === statusFilter) &&
    (!paymentFilter || (paymentFilter === "OVERDUE" ? p.status !== "DRAFT" && p.status !== "CANCELLED" && p.payment_status !== "PAID" && p.expected_payment_at < new Date().setHours(0,0,0,0) : p.payment_status === paymentFilter)) &&
    (!supplierFilter || p.supplier_id === supplierFilter) && (!storeFilter || p.store_id === storeFilter) &&
    (!startDate || p.created_at >= new Date(startDate + "T00:00:00").getTime()) && (!endDate || p.created_at <= new Date(endDate + "T23:59:59.999").getTime()));
  const filteredSuppliers = suppliers.filter(s => matchesSearch([s.id, s.name, s.contact_name, s.phone, s.email, s.address]) && (!supplierStatus || String(s.is_active) === supplierStatus));
  const [activeTab, setActiveTab] = useState<"purchases" | "suppliers">("purchases");
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [purchaseStoreId, setPurchaseStoreId] = useState("");
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ articleId: "", articleQuery: "", quantity: 1, unitCost: 0 }]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [fundId, setFundId] = useState("");
  const [splitFunds, setSplitFunds] = useState(false);
  const [allocations, setAllocations] = useState([{ fund_id: "", amount: 0 }]);
  const availableFunds = treasuryFunds.filter(fund => fund.owner_id === currentUser.uid && fund.balance > 0);
  const allocatedTotal = allocations.reduce((total, item) => total + item.amount, 0);
  const requiresFund = ["ADMIN", "SUPER_ADMIN"].includes(currentUser.roleId);
  const [paymentReference, setPaymentReference] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeSuppliers = suppliers.filter(supplier => supplier.is_active);
  const selectedStore = stores.find(store => store.id === purchaseStoreId);
  const activeArticles = articles.filter(article => selectedStore && canPurchaseArticle(selectedStore, article));
  const receivingStores = stores.filter(store => store.is_active && ["CENTRAL_WAREHOUSE", "MANUFACTURER"].includes(store.store_type));
  const hasPurchasableArticles = articles.some(article => receivingStores.some(store => canPurchaseArticle(store, article)));
  const purchaseTotal = draftLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const pendingPurchases = useMemo(
    () => filteredPurchases.filter(purchase => purchase.status !== "DRAFT" && purchase.status !== "CANCELLED" && purchase.payment_status !== "PAID").sort((a, b) => a.expected_payment_at - b.expected_payment_at),
    [filteredPurchases]
  );
  const overdueTotal = pendingPurchases
    .filter(purchase => purchase.expected_payment_at < new Date().setHours(0, 0, 0, 0))
    .reduce((sum, purchase) => sum + purchase.total - purchase.amount_paid, 0);
  const dueThisMonth = pendingPurchases
    .filter(purchase => {
      const dueDate = new Date(purchase.expected_payment_at);
      const now = new Date();
      return dueDate.getFullYear() === now.getFullYear() && dueDate.getMonth() === now.getMonth();
    })
    .reduce((sum, purchase) => sum + purchase.total - purchase.amount_paid, 0);

  const getStockQuantity = (storeId: string, articleId: string) =>
    stocks.find(stock => stock.store_id === storeId && stock.article_id === articleId)?.quantity || 0;
  const purchaseStatusLabel = (purchase: Purchase) => {
    if (purchase.status === "CANCELLED") return purchase.refund_due_amount ? "Annulé - remboursement à récupérer" : "Annulé";
    if (purchase.status === "DRAFT") return "Brouillon";
    if (purchase.status === "APPROVED") return "Approuvé · livraison en attente";
    if (purchase.status === "RECEIVED" || !purchase.status) return "Réceptionné";
    return purchase.status;
  };

  const startNewPurchase = () => {
    setEditingPurchase(null);
    setFormError("");
    setPurchaseSupplierId("");
    setSupplierQuery("");
    setPurchaseStoreId("");
    setWarehouseQuery("");
    setInvoiceNumber("");
    setExpectedPaymentDate("");
    setPurchaseNotes("");
    setDraftLines([{ articleId: "", articleQuery: "", quantity: 1, unitCost: 0 }]);
    setIsPurchaseModalOpen(true);
  };

  const handleCreateSupplier = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplierName.trim()) {
      setFormError("Le nom du fournisseur est obligatoire.");
      return;
    }
    setIsSaving(true);
    setFormError("");
    try {
      const timestamp = Date.now();
      const supplier: Supplier = {
        id: editingSupplier?.id || await createSequentialId("FOU", suppliers.map(supplier => supplier.id)),
        name: supplierName.trim(),
        contact_name: supplierContact.trim() || undefined,
        phone: supplierPhone.trim() || undefined,
        email: supplierEmail.trim() || undefined,
        address: supplierAddress.trim() || undefined,
        is_active: editingSupplier?.is_active ?? true,
        created_at: editingSupplier?.created_at ?? timestamp,
        updated_at: timestamp
      };
      await (editingSupplier ? onToggleSupplier(supplier) : onCreateSupplier(supplier));
      setEditingSupplier(null);
      setSupplierName("");
      setSupplierContact("");
      setSupplierPhone("");
      setSupplierEmail("");
      setSupplierAddress("");
      setIsSupplierModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer le fournisseur.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePurchaseDraft = async (event: FormEvent) => {
    event.preventDefault();
    const supplier = activeSuppliers.find(item => item.id === purchaseSupplierId);
    const receivingStore = receivingStores.find(item => item.id === purchaseStoreId);
    if (!supplier || !receivingStore || !invoiceNumber.trim() || !expectedPaymentDate || draftLines.length === 0) {
      setFormError("Fournisseur, magasin destinataire, référence, échéance et au moins un article sont obligatoires.");
      return;
    }
    if (draftLines.some(line => !activeArticles.some(article => article.id === line.articleId) || line.quantity <= 0 || line.unitCost < 0)) {
      setFormError("Vérifiez les articles, quantités et prix d'achat.");
      return;
    }
    const timestamp = Date.now();
    const lines: PurchaseLine[] = draftLines.map((line, index) => {
      const article = articles.find(item => item.id === line.articleId)!;
      return {
        id: `purchase-line-${index}-${crypto.randomUUID()}`,
        article_id: article.id,
        article_code: article.code,
        article_name: article.name,
        unit: article.unit,
        quantity: Number(line.quantity),
        unit_cost: Number(line.unitCost),
        total: Number(line.quantity) * Number(line.unitCost)
      };
    });
    const sequence = purchases.reduce((max, purchase) => {
      const match = purchase.purchase_number.match(/ACH-\d{4}-(\d+)/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const purchase: Purchase = {
      id: `purchase-${crypto.randomUUID()}`,
      purchase_number: `ACH-${new Date(timestamp).getFullYear()}-${String(sequence).padStart(4, "0")}`,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      store_id: purchaseStoreId,
      status: "DRAFT",
      created_by: currentUser.uid,
      created_by_name: currentUser.displayName || currentUser.email,
      invoice_number: invoiceNumber.trim(),
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
      amount_paid: 0,
      payment_status: "UNPAID",
      expected_payment_at: new Date(`${expectedPaymentDate}T12:00:00`).getTime(),
      payments: [],
      notes: purchaseNotes.trim() || undefined,
      created_at: timestamp,
      updated_at: timestamp
    };

    setIsSaving(true);
    setFormError("");
    try {
      if (editingPurchase) await onUpdatePurchase({ ...editingPurchase, supplier_id: purchase.supplier_id, supplier_name: purchase.supplier_name, store_id: purchase.store_id, invoice_number: purchase.invoice_number, expected_payment_at: purchase.expected_payment_at, notes: purchase.notes, lines: purchase.lines, total: purchase.total, updated_at: timestamp }, editingPurchase);
      else await onCreatePurchase(purchase);
      setIsPurchaseModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer le brouillon d'achat.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (!payingPurchase || ["DRAFT", "CANCELLED"].includes(payingPurchase.status || "") || paymentAmount <= 0 || paymentAmount > payingPurchase.total - payingPurchase.amount_paid) {
      setFormError("Le montant doit être supérieur à zéro et ne pas dépasser le solde dû.");
      return;
    }
    setIsSaving(true);
    setFormError("");
    try {
      if (requiresFund && (!treasuryReady || (!splitFunds && !fundId))) throw new Error("Choisissez un fonds disponible dans votre trésorerie.");
      if (requiresFund && splitFunds) {
        if (allocatedTotal !== paymentAmount || allocations.some(item => !Number.isSafeInteger(item.amount) || item.amount <= 0 || !availableFunds.some(fund => fund.id === item.fund_id && fund.balance >= item.amount)) || new Set(allocations.map(item => item.fund_id)).size !== allocations.length) throw new Error("Vérifiez les fonds, leurs soldes et le total de la répartition.");
      }
      await onRecordPayment(payingPurchase, {
        ...(requiresFund ? (splitFunds ? { fund_allocations: allocations } : { treasury_fund_id: fundId }) : {}),
        id: `payment-${crypto.randomUUID()}`,
        amount: Number(paymentAmount),
        paid_at: Date.now(),
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
        paid_by: currentUser.uid,
        paid_by_name: currentUser.displayName
      });
      setPayingPurchase(null);
      setPaymentReference("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement.");
    } finally {
      setIsSaving(false);
    }
  };

  const openPaymentForm = (purchase: Purchase) => {
    if (purchase.status === "CANCELLED") return;
    setFormError("");
    setPayingPurchase(purchase);
    setPaymentAmount(purchase.total - purchase.amount_paid);
    setPaymentMethod("BANK_TRANSFER");
    setFundId("");
    setSplitFunds(false);
    setAllocations([{ fund_id: "", amount: 0 }]);
    setPaymentReference("");
  };

  const updateDraftLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  return (
    <div className="treasury-shell space-y-6 text-slate-900">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-4 w-4" />Retour à l’accueil</button>
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-emerald-700" />
            <h2 className="font-serif text-lg font-bold text-slate-900">Achats & fournisseurs</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Réceptions en stock, factures fournisseurs et échéances de paiement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DataManagementActions
            data={suppliers}
            label="fournisseurs"
            isAdmin={currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN"}
            onImport={onImportData}
            onReset={onResetData}
          />
          <button type="button" onClick={() => { setEditingSupplier(null); setSupplierName(""); setSupplierContact(""); setSupplierPhone(""); setSupplierEmail(""); setSupplierAddress(""); setFormError(""); setIsSupplierModalOpen(true); }} className="ui-btn h-auto min-h-10 items-center gap-2 rounded-xl border-slate-200 bg-white px-4 py-2.5 shadow-none text-xs font-bold text-slate-700 hover:bg-slate-50">
            <UserRound className="h-4 w-4" /> Nouveau fournisseur
          </button>
          <button type="button" onClick={startNewPurchase} disabled={activeSuppliers.length === 0 || !hasPurchasableArticles || receivingStores.length === 0} className="ui-btn h-auto min-h-10 items-center gap-2 rounded-xl border-emerald-600 bg-emerald-600 px-4 py-2.5 shadow-none text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Nouveau brouillon d'achat
          </button>
        </div>
      </header>
      {(receivingStores.length === 0 || !hasPurchasableArticles || activeSuppliers.length === 0) && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Pour saisir un achat, ajoutez un fournisseur actif et au moins un article actif compatible : matière première vers un dépôt central ou magasin fabricant, produit de revente vers un dépôt central. Le magasin destinataire doit être actif.
        </p>
      )}

      <div className="rounded-2xl bg-emerald-950 p-4 text-xs leading-6 text-emerald-100"><p className="font-bold text-emerald-300">Du brouillon d’achat à la réception</p><p>Préparez l’achat, puis approuvez-le pour créer la livraison. Le responsable réceptionne dans « Transferts » ; une seconde personne autorisée confirme l’entrée. Suivez les échéances et les règlements fournisseurs.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Fournisseurs actifs</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{activeSuppliers.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800">À payer ce mois</p>
          <p className="mt-1 text-xl font-bold text-amber-950">{money(dueThisMonth)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold text-rose-800">En retard</p>
          <p className="mt-1 text-xl font-bold text-rose-950">{money(overdueTotal)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <button type="button" onClick={() => setActiveTab("purchases")} aria-pressed={activeTab === "purchases"} className={`ui-btn ui-btn-sm h-auto min-h-10 rounded-lg border-0 px-4 py-2 text-xs font-bold shadow-none ${activeTab === "purchases" ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <ClipboardList className="mr-1 inline h-4 w-4" /> Achats & paiements ({purchases.length})
        </button>
        <button type="button" onClick={() => setActiveTab("suppliers")} aria-pressed={activeTab === "suppliers"} className={`ui-btn ui-btn-sm h-auto min-h-10 rounded-lg border-0 px-4 py-2 text-xs font-bold shadow-none ${activeTab === "suppliers" ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <UserRound className="mr-1 inline h-4 w-4" /> Fournisseurs ({suppliers.length})
        </button>
      </div>

<div className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
<label>Rechercher<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, fournisseur, article, auteur…" className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500" /></label>
{activeTab === "purchases" ? <>
<label>État<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500"><option value="">Tous</option><option value="DRAFT">Brouillon</option><option value="APPROVED">Livraison en attente</option><option value="CANCELLED">Annulé</option><option value="RECEIVED">Réceptionné</option></select></label>
<label>Paiement<select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500"><option value="">Tous</option><option value="UNPAID">Non payé</option><option value="PARTIAL">Partiel</option><option value="PAID">Payé</option><option value="OVERDUE">En retard</option></select></label>
<label>Fournisseur<select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500"><option value="">Tous</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
<label>Magasin<select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500"><option value="">Tous</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
<label>Créé depuis<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500" /></label>
<label>Jusqu’au<input type="date" min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500" /></label>
</> : <label>Statut<select value={supplierStatus} onChange={e => setSupplierStatus(e.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 focus:ring-2 focus:ring-emerald-500"><option value="">Tous</option><option value="true">Actif</option><option value="false">Inactif</option></select></label>}
<button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setPaymentFilter(""); setSupplierFilter(""); setStoreFilter(""); setStartDate(""); setEndDate(""); setSupplierStatus(""); }} className="ui-btn h-auto min-h-10 rounded-xl border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-none hover:bg-slate-50">Réinitialiser</button>
<span>{activeTab === "purchases" ? filteredPurchases.length : filteredSuppliers.length} résultat(s)</span></div>
      {activeTab === "purchases" ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <CalendarDays className="h-4 w-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">Calendrier des paiements à venir (achats approuvés)</h3>
          </div>
          {pendingPurchases.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">Aucune échéance en attente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">Échéance</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Facture</th><th className="px-4 py-2 text-right">Solde à payer</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2 text-right">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingPurchases.map(purchase => {
                    const overdue = purchase.expected_payment_at < new Date().setHours(0, 0, 0, 0);
                    return <tr key={`due-${purchase.id}`} onClick={() => setViewingPurchase(purchase)} className="cursor-pointer hover:bg-slate-50 focus-within:bg-emerald-50">
                      <td className={`px-4 py-3 font-semibold ${overdue ? "text-rose-700" : "text-slate-700"}`}>{dateLabel(purchase.expected_payment_at)}{overdue && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px]">En retard</span>}</td>
                      <td className="px-4 py-3 text-slate-800">{purchase.supplier_name}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{purchase.invoice_number}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{money(purchase.status === "CANCELLED" ? 0 : purchase.total - purchase.amount_paid)}</td>
                      <td className="px-4 py-3 text-slate-600">{purchase.payment_status === "PARTIAL" ? "Partiellement réglé" : "À régler"}</td>
                      <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><button type="button" aria-label={`Afficher les détails de l’achat ${purchase.purchase_number}`} onClick={event => { event.stopPropagation(); setViewingPurchase(purchase); }} className="rounded px-2 py-1 font-semibold text-emerald-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-emerald-700">Détails</button><button type="button" onClick={event => { event.stopPropagation(); openPaymentForm(purchase); }} className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 font-bold text-emerald-800 hover:bg-emerald-50"><CreditCard className="h-3.5 w-3.5" /> Régler</button></div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full rounded-lg border bg-white p-4 text-xs">
            <label className="font-bold">Paiements du mois <input aria-label="Mois des paiements fournisseurs" type="month" required value={paymentMonth} onChange={event => setPaymentMonth(event.target.value)} className="ml-2 rounded border p-2" /></label>
            <p className="mt-2 text-slate-500">Somme des règlements effectués pendant le mois sélectionné, selon leur date de paiement, pour les magasins accessibles.</p>
            {supplierError && <p role="alert" className="mt-2 text-red-700">{supplierError}</p>}
          </div>
          {filteredSuppliers.length === 0 && <p className="col-span-full rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Aucun fournisseur enregistré.</p>}
          {filteredSuppliers.map(supplier => (
            <article key={supplier.id} className={`rounded-2xl border bg-white p-5 ${supplier.is_active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="text-sm font-bold text-slate-900">{supplier.name}</h3><p className="mt-1 text-xs text-slate-500">{supplier.contact_name || "Contact non renseigné"}</p></div>
                <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{supplier.is_active ? "Actif" : "Inactif"}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-600"><p>{supplier.phone || "Téléphone non renseigné"}</p><p>{supplier.email || "Email non renseigné"}</p><p>{supplier.address || "Adresse non renseignée"}</p></div>
              <button type="button" onClick={() => { setSupplierDetails(supplier); setSupplierPurchaseFilter("MONTH"); }} className="mt-3 w-full rounded-lg bg-emerald-50 p-3 text-left text-xs text-emerald-900 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-700"><p>Montant payé · {paymentMonth || "Choisir un mois"}</p><strong className="mt-1 block text-lg">{money(monthlyPayments.get(supplier.id)?.total ?? 0)}</strong><p>{monthlyPayments.get(supplier.id)?.count ?? 0} règlement(s) · Voir les achats</p></button>
              <button type="button" onClick={() => { setSupplierDetails(supplier); setSupplierPurchaseFilter("ALL"); }} className="mt-3 block text-xs font-bold text-emerald-800 hover:underline">Voir les achats réglés et en cours</button>
              <button type="button" className="mr-4 mt-3 text-xs font-bold text-emerald-800" onClick={() => { setEditingSupplier(supplier); setSupplierName(supplier.name); setSupplierContact(supplier.contact_name || ""); setSupplierPhone(supplier.phone || ""); setSupplierEmail(supplier.email || ""); setSupplierAddress(supplier.address || ""); setFormError(""); setIsSupplierModalOpen(true); }}>Modifier</button>
              <button type="button" onClick={() => void onToggleSupplier({ ...supplier, is_active: !supplier.is_active, updated_at: Date.now() }).catch(error => window.alert(error instanceof Error ? error.message : "Modification impossible."))} className="mt-4 text-xs font-bold text-emerald-800 hover:underline">{supplier.is_active ? "Désactiver" : "Réactiver"}</button>
              <button type="button" disabled={deletingSupplierId !== null} className="ml-4 mt-4 text-xs font-bold text-rose-700 hover:underline disabled:opacity-50" onClick={async () => {
                if (!window.confirm(`Supprimer le fournisseur « ${supplier.name} » de la liste ? Ses achats et paiements seront conservés dans l'historique.`)) return;
                setDeletingSupplierId(supplier.id);
                setSupplierError("");
                try { await onDeleteSupplier(supplier); }
                catch (error) { setSupplierError(error instanceof Error ? error.message : "Suppression impossible."); }
                finally { setDeletingSupplierId(null); }
              }}>{deletingSupplierId === supplier.id ? "Suppression…" : "Supprimer"}</button>
            </article>
          ))}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">Suivi des achats · brouillon → approbation → réception</h3></div>
        {filteredPurchases.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-500">Aucun achat enregistré.</p> : (
          <div className="overflow-x-auto">
            <table className="ui-table w-full min-w-[1120px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">Créé le</th><th className="px-4 py-2">Référence</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Magasin destinataire</th><th className="px-4 py-2">Lignes</th><th className="px-4 py-2">Échéance</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">État</th><th className="px-4 py-2">Paiement</th><th className="px-4 py-2">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...filteredPurchases].sort((a, b) => b.created_at - a.created_at).map(purchase => <tr
                  key={purchase.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Afficher les détails de l'achat ${purchase.purchase_number}`}
                  onClick={() => setViewingPurchase(purchase)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setViewingPurchase(purchase);
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-50 focus:bg-emerald-50 focus:outline-none"
                >
                  <td className="px-4 py-3 text-slate-600">{dateLabel(purchase.created_at)}</td><td className="px-4 py-3 tabular-nums font-bold text-emerald-800">{purchase.purchase_number}<span className="block font-normal text-slate-400">Facture {purchase.invoice_number}</span></td><td className="px-4 py-3 font-semibold text-slate-800">{purchase.supplier_name}</td><td className="px-4 py-3 text-slate-600">{stores.find(store => store.id === purchase.store_id)?.name || "Magasin supprimé"}</td><td className="px-4 py-3 text-slate-600">{purchase.lines.length} article(s)</td><td className="px-4 py-3 text-slate-600">{dateLabel(purchase.expected_payment_at)}</td><td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">{money(purchase.total)}</td><td className="px-4 py-3 font-semibold text-slate-700">{purchaseStatusLabel(purchase)}</td><td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${purchase.payment_status === "PAID" ? "bg-emerald-50 text-emerald-700" : purchase.payment_status === "PARTIAL" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{purchase.payment_status === "PAID" ? "Payé" : purchase.payment_status === "PARTIAL" ? `Partiel · reste ${money(purchase.total - purchase.amount_paid)}` : "Non payé"}</span></td><td className="px-4 py-3">{purchase.status === "DRAFT" && <button type="button" onClick={event => { event.stopPropagation(); void onApprovePurchase(purchase).catch(error => window.alert(error instanceof Error ? error.message : "Impossible d'approuver l'achat.")); }} className="whitespace-nowrap rounded bg-emerald-600 px-2 py-1.5 font-bold text-white hover:bg-emerald-700">Approuver & envoyer</button>}{purchase.status === "APPROVED" && <span className="text-[10px] font-semibold text-amber-700">À réceptionner dans Transferts</span>}{currentUser.role === "SUPER_ADMIN" && <>
                    <button type="button" className="ui-btn ui-btn-sm ui-btn-error ml-2" disabled={deletingPurchaseId !== null || !!purchaseDeletionReason(purchase)} aria-describedby={purchaseDeletionReason(purchase) ? "delete-reason-" + purchase.id : undefined} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setCancellationMode(false); setDeletionError(""); setPurchaseToDelete(purchase); }}>{deletingPurchaseId === purchase.id ? "Suppression..." : "Supprimer"}</button>
                    {purchaseDeletionReason(purchase) && <p id={"delete-reason-" + purchase.id} className="mt-2 max-w-56 text-xs text-base-content">{purchaseDeletionReason(purchase)}</p>}
                    {purchase.status !== "CANCELLED" && <button type="button" className="ui-btn ui-btn-sm ml-2" onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setCancellationMode(true); setCancellationReason(""); setDeletionError(""); setPurchaseToDelete(purchase); }}>Annuler l'achat</button>}
                  </>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4 text-xs">
<h3 className="font-bold">Historique des activités</h3>
<label>Filtrer par auteur, action ou référence<input value={activitySearch} onChange={e => setActivitySearch(e.target.value)} className="ml-2 rounded border p-2" /></label>
<p className="text-slate-500">Historique disponible dans la session. Les filtres de la liste s'appliquent aux achats et fournisseurs concernés.</p>
<div className="max-h-72 overflow-auto">
{auditLogs.filter(log => (activeTab === "purchases" ? log.entity_type === "PURCHASE" && filteredPurchases.some(p => p.id === log.entity_id) : log.entity_type === "SUPPLIER" && filteredSuppliers.some(s => s.id === log.entity_id)) && [log.user_name, log.action, log.entity_id, log.new_value?.purchase_number, log.new_value?.name].join(" ").toLowerCase().includes(activitySearch.toLowerCase())).sort((a,b) => b.created_at-a.created_at).map(log => <div key={log.id} className="border-b py-2"><strong>{log.new_value?.purchase_number || log.new_value?.name || log.entity_id}</strong> · {log.user_name} · {new Date(log.created_at).toLocaleString("fr-FR")}<p>{({ SUPPLIER_CREATED: "Fournisseur créé", SUPPLIER_UPDATED: "Fournisseur modifié", PURCHASE_DRAFT_CREATED: "Brouillon créé", PURCHASE_DRAFT_UPDATED: "Brouillon modifié", PURCHASE_APPROVED: "Achat approuvé", PURCHASE_CANCELLED: "Achat annulé", SUPPLIER_PAYMENT_RECORDED: "Paiement enregistré" } as Record<string, string>)[log.action] || log.action}</p></div>)}
</div></section>
      {supplierDetails && !viewingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="supplier-purchases-title" className="my-auto w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h3 id="supplier-purchases-title" className="font-bold">Achats de {supplierDetails.name}</h3><p className="mt-1 text-xs text-slate-500">Sélectionnez un achat pour consulter ses articles, règlements et son historique.</p></div>
              <button type="button" aria-label="Fermer les achats du fournisseur" onClick={() => setSupplierDetails(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="my-4 flex flex-wrap gap-2">
              {([{ value: "ALL", label: "Tous les achats" }, { value: "PAID", label: "Réglés" }, { value: "OPEN", label: "En cours" }, { value: "MONTH", label: `Règlements de ${paymentMonth}` }] as const).map(filter => <button key={filter.value} type="button" aria-pressed={supplierPurchaseFilter === filter.value} onClick={() => setSupplierPurchaseFilter(filter.value)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${supplierPurchaseFilter === filter.value ? "bg-emerald-600 text-white" : "bg-white text-slate-700"}`}>{filter.label}</button>)}
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {(() => {
                const rows = purchases.filter(purchase => purchase.supplier_id === supplierDetails.id && (
                  supplierPurchaseFilter === "ALL" ||
                  (supplierPurchaseFilter === "PAID" && purchase.payment_status === "PAID") ||
                  (supplierPurchaseFilter === "OPEN" && purchase.status !== "CANCELLED" && purchase.payment_status !== "PAID") ||
                  (supplierPurchaseFilter === "MONTH" && supplierMonthlyPayments([purchase], paymentMonth).has(supplierDetails.id))
                )).sort((a, b) => b.created_at - a.created_at);
                return rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Aucun achat pour ce filtre.</p> : rows.map(purchase => <button key={purchase.id} type="button" onClick={() => setViewingPurchase(purchase)} className="block w-full rounded-lg border p-3 text-left text-xs hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-700">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{purchase.purchase_number} · Facture {purchase.invoice_number}</strong><span>{purchaseStatusLabel(purchase)} · {purchase.payment_status === "PAID" ? "Réglé" : purchase.payment_status === "PARTIAL" ? "Partiellement réglé" : "Non réglé"}</span></div>
                  <p className="mt-2 text-slate-600">Créé le {dateLabel(purchase.created_at)} · Échéance {dateLabel(purchase.expected_payment_at)}</p>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1"><span>Total : <strong>{money(purchase.total)}</strong></span><span>Payé : <strong>{money(purchase.amount_paid)}</strong></span><span>Reste dû : <strong>{money(purchase.total - purchase.amount_paid)}</strong></span>{supplierPurchaseFilter === "MONTH" && <span>Payé ce mois : <strong>{money(supplierMonthlyPayments([purchase], paymentMonth).get(supplierDetails.id)?.total ?? 0)}</strong></span>}</div>
                  <span className="mt-2 block font-bold text-emerald-800">Afficher les détails →</span>
                </button>);
              })()}
            </div>
          </div>
        </div>
      )}

      {viewingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-black">Détail de l’achat {viewingPurchase.purchase_number}</h3>
                <p className="mt-1 text-xs text-slate-500">Facture {viewingPurchase.invoice_number} · {viewingPurchase.supplier_name}</p>
              </div>
              <button type="button" onClick={() => setViewingPurchase(null)} aria-label="Fermer" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">État de l'achat</p><p className="mt-1 font-semibold">{purchaseStatusLabel(viewingPurchase)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Magasin destinataire</p><p className="mt-1 font-semibold">{stores.find(store => store.id === viewingPurchase.store_id)?.name || "Magasin supprimé"}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Échéance</p><p className="mt-1 font-semibold">{dateLabel(viewingPurchase.expected_payment_at)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">{viewingPurchase.received_at ? "Réceptionné le" : "Créé le"}</p><p className="mt-1 font-semibold">{dateLabel(viewingPurchase.received_at || viewingPurchase.created_at)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Responsable réception</p><p className="mt-1 font-semibold">{viewingPurchase.received_by_name || "En attente de réception"}</p></div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="ui-table w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Article</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2 text-right">Prix unitaire</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{viewingPurchase.lines.map(line => <tr key={line.id}>
                  <td className="px-3 py-2"><span className="font-semibold text-slate-800">{line.article_name}</span><span className="ml-2 tabular-nums text-slate-400">{line.article_code}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity} {line.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(line.unit_cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{money(line.total)}</td>
                </tr>)}</tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50"><tr><td colSpan={3} className="px-3 py-2 text-right font-bold">Total facture</td><td className="px-3 py-2 text-right tabular-nums font-bold">{money(viewingPurchase.total)}</td></tr></tfoot>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800">Règlements</h4>
                {viewingPurchase.payments.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucun règlement enregistré.</p> : <ul className="mt-2 space-y-2">                {viewingPurchase.payments.map(payment => <li key={payment.id} className="flex justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-xs"><span className="text-slate-600">{dateLabel(payment.paid_at)} · {PAYMENT_METHODS.find(method => method.value === payment.method)?.label || payment.method}{payment.fund_allocations?.map(allocation => <span key={allocation.fund_id} className="block text-xs">{treasuryFunds.find(fund => fund.id === allocation.fund_id)?.source_reference || allocation.fund_id} : {money(allocation.amount)}</span>)}{payment.reference && <span className="block text-[10px] text-slate-400">Réf. {payment.reference}</span>}{payment.paid_by_name && <span className="block text-[10px] text-slate-500">Enregistré par {payment.paid_by_name}</span>}</span><strong className="tabular-nums text-slate-900">{money(payment.amount)}</strong></li>)}</ul>}
              </div>
              <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-600">Statut</span><strong>{viewingPurchase.payment_status === "PAID" ? "Payé" : viewingPurchase.payment_status === "PARTIAL" ? "Partiellement payé" : "À payer"}</strong></div>
                <div className="flex justify-between"><span className="text-slate-600">Déjà réglé</span><strong className="tabular-nums">{money(viewingPurchase.amount_paid)}</strong></div>
                <div className="flex justify-between border-t border-emerald-200 pt-2"><span className="font-bold">Reste dû</span><strong className="tabular-nums">{money(viewingPurchase.status === "CANCELLED" ? 0 : viewingPurchase.total - viewingPurchase.amount_paid)}</strong></div>
              </div>
            </div>
            <div className="mt-4 space-y-2 rounded-lg border p-3 text-xs">
<h4 className="font-bold">Traçabilité et activité</h4>
<p>Créé le {new Date(viewingPurchase.created_at).toLocaleString("fr-FR")} par {viewingPurchase.created_by_name || viewingPurchase.created_by || "Non renseigné"}</p>
{viewingPurchase.approved_at && <p>Approuvé le {new Date(viewingPurchase.approved_at).toLocaleString("fr-FR")} par {viewingPurchase.approved_by_name || viewingPurchase.approved_by}</p>}
{viewingPurchase.transfer_id && <p>Livraison liée : {viewingPurchase.transfer_id}</p>}
<p>Dernière mise à jour : {new Date(viewingPurchase.updated_at).toLocaleString("fr-FR")}</p>
{auditLogs.filter(log => log.entity_type === "PURCHASE" && log.entity_id === viewingPurchase.id).sort((a,b) => b.created_at-a.created_at).map(log => <details key={log.id}><summary>{new Date(log.created_at).toLocaleString("fr-FR")} · {log.user_name} · {log.action}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify({ avant: log.old_value, apres: log.new_value }, null, 2)}</pre></details>)}
{viewingPurchase.status === "DRAFT" && <button type="button" className="rounded bg-emerald-600 p-2 font-bold text-white" onClick={() => {
const p = viewingPurchase; setEditingPurchase(p); setPurchaseSupplierId(p.supplier_id); setSupplierQuery(supplierOptionLabel(suppliers.find(s => s.id === p.supplier_id) || { name: p.supplier_name } as Supplier)); setPurchaseStoreId(p.store_id); const store = stores.find(s => s.id === p.store_id); setWarehouseQuery(store ? receivingStoreOptionLabel(store) : ""); setInvoiceNumber(p.invoice_number); const d = new Date(p.expected_payment_at); setExpectedPaymentDate(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")); setPurchaseNotes(p.notes || ""); setDraftLines(p.lines.map(l => ({ articleId: l.article_id, articleQuery: l.article_code + " \u00b7 " + l.article_name, quantity: l.quantity, unitCost: l.unit_cost }))); setFormError(""); setViewingPurchase(null); setIsPurchaseModalOpen(true);
}}>Modifier le brouillon</button>}
</div>
            {viewingPurchase.status === "CANCELLED" && <div className="mt-4 space-y-2 rounded border border-slate-200 p-3 text-sm"><p>Achat annulé : {viewingPurchase.cancellation_reason}</p><p>Annulé par {viewingPurchase.cancelled_by_name} le {dateLabel(viewingPurchase.cancelled_at || viewingPurchase.updated_at)}.</p>{!!viewingPurchase.refund_due_amount && <p className="font-bold">Montant à récupérer auprès du fournisseur : {money(viewingPurchase.refund_due_amount)}. Aucun remboursement de trésorerie enregistré.</p>}</div>}
            {viewingPurchase.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Note : {viewingPurchase.notes}</p>}
            <div className="mt-4 flex justify-end border-t border-slate-200 pt-3"><button type="button" onClick={() => setViewingPurchase(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Fermer</button></div>
          </div>
        </div>
      )}

      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><h3 className="text-lg font-black">{editingSupplier ? "Modifier le fournisseur" : "Nouveau fournisseur"}</h3><button type="button" onClick={() => setIsSupplierModalOpen(false)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{formError}</p>}
              <label className="block font-bold text-slate-700">Nom du fournisseur<input required value={supplierName} onChange={event => setSupplierName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
              <label className="block font-bold text-slate-700">Personne de contact<input value={supplierContact} onChange={event => setSupplierContact(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block font-bold text-slate-700">Téléphone (facultatif)<input value={supplierPhone} onChange={event => setSupplierPhone(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label><label className="block font-bold text-slate-700">Email (facultatif)<input type="email" value={supplierEmail} onChange={event => setSupplierEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label></div>
              <label className="block font-bold text-slate-700">Adresse<input value={supplierAddress} onChange={event => setSupplierAddress(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setIsSupplierModalOpen(false)} className="ui-btn h-auto min-h-10 rounded-xl border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-none hover:bg-slate-50">Annuler</button><button disabled={isSaving} className="ui-btn h-auto min-h-10 rounded-xl border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50">{isSaving ? "Enregistrement..." : editingSupplier ? "Enregistrer les modifications" : "Créer le fournisseur"}</button></div>
            </form>
          </div>
        </div>
      )}

      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <div className="my-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-lg font-black">Brouillon d'achat de matières premières et produits de revente</h3><p className="mt-1 text-xs text-slate-500">Revente : dépôt uniquement. Le responsable réceptionne dans « Transferts » après approbation ; une seconde personne autorisée confirme l’entrée.</p></div><button type="button" onClick={() => setIsPurchaseModalOpen(false)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleSavePurchaseDraft} className="space-y-4 text-xs">
              {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{formError}</p>}
              <datalist id="purchase-suppliers">{activeSuppliers.map(supplier => <option key={supplier.id} value={supplierOptionLabel(supplier)} />)}</datalist>
              <datalist id="purchase-articles">{activeArticles.map(article => <option key={article.id} value={articleOptionLabel(article)} />)}</datalist>
              <datalist id="purchase-receiving-stores">{receivingStores.map(store => <option key={store.id} value={receivingStoreOptionLabel(store)} />)}</datalist>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="font-bold text-slate-700">Fournisseur<input required list="purchase-suppliers" value={supplierQuery} onChange={event => { const value = event.target.value; setSupplierQuery(value); setPurchaseSupplierId(activeSuppliers.find(supplier => supplierOptionLabel(supplier) === value)?.id || ""); }} placeholder="Fournisseur..." className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900 placeholder:text-slate-400" /></label>
                <label className="font-bold text-slate-700">Magasin destinataire<input required list="purchase-receiving-stores" value={warehouseQuery} onChange={event => { const value = event.target.value; setWarehouseQuery(value); const nextStore = receivingStores.find(store => receivingStoreOptionLabel(store) === value); setPurchaseStoreId(nextStore?.id || ""); setDraftLines(lines => lines.map(line => { const article = articles.find(item => item.id === line.articleId); return nextStore && article && canPurchaseArticle(nextStore, article) ? line : { ...line, articleId: "", articleQuery: "", unitCost: 0 }; })); }} placeholder="Dépôt ou fabricant..." className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900 placeholder:text-slate-400" /></label>
                <label className="font-bold text-slate-700">N° facture / bon<input required value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
                <label className="font-bold text-slate-700">Échéance de paiement<input required type="date" value={expectedPaymentDate} onChange={event => setExpectedPaymentDate(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="ui-table w-full min-w-[620px] text-left"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Matière première</th><th className="px-3 py-2">Stock actuel</th><th className="px-3 py-2">Quantité commandée</th><th className="px-3 py-2">Prix unitaire</th><th className="px-3 py-2 text-right">Total</th><th className="px-2 py-2" /></tr></thead><tbody className="divide-y divide-slate-100">{draftLines.map((line, index) => {
                  const article = articles.find(item => item.id === line.articleId);
                  return <tr key={index}><td className="px-3 py-2"><input list="purchase-articles" value={line.articleQuery} onChange={event => { const value = event.target.value; const selected = activeArticles.find(item => articleOptionLabel(item) === value); updateDraftLine(index, { articleQuery: value, articleId: selected?.id || "", unitCost: selected?.prix_achat ?? line.unitCost }); }} placeholder="Matière première ou produit de revente..." className="w-full rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400" /></td><td className="px-3 py-2 text-center tabular-nums text-slate-600">{getStockQuantity(purchaseStoreId, line.articleId)}</td><td className="px-3 py-2"><input min="1" type="number" value={line.quantity} onChange={event => updateDraftLine(index, { quantity: Number(event.target.value) })} className="w-24 rounded border border-slate-300 bg-white p-2 text-right text-slate-900" /></td><td className="px-3 py-2"><input min="0" type="number" value={line.unitCost} onChange={event => updateDraftLine(index, { unitCost: Number(event.target.value) })} className="w-32 rounded border border-slate-300 bg-white p-2 text-right text-slate-900" /></td><td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">{money(line.quantity * line.unitCost)}</td><td className="px-2 py-2"><button type="button" disabled={draftLines.length === 1} onClick={() => setDraftLines(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Retirer la ligne" className="px-2 font-bold text-rose-700 disabled:opacity-30">×</button></td></tr>;
                })}</tbody></table>
              </div>
              <button type="button" disabled={draftLines.length >= 100} onClick={() => setDraftLines(current => [...current, { articleId: "", articleQuery: "", quantity: 1, unitCost: 0 }])} className="font-bold text-emerald-800 hover:underline disabled:opacity-50">+ Ajouter une ligne</button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="font-bold text-slate-700">Notes<input value={purchaseNotes} onChange={event => setPurchaseNotes(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label><div className="flex items-end justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="font-bold text-slate-700">Total achat</span><strong className="tabular-nums text-base text-slate-900">{money(purchaseTotal)}</strong></div></div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setIsPurchaseModalOpen(false)} className="ui-btn h-auto min-h-10 rounded-xl border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-none hover:bg-slate-50">Annuler</button><button disabled={isSaving} className="ui-btn h-auto min-h-10 rounded-xl border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50">{isSaving ? "Enregistrement..." : "Enregistrer le brouillon"}</button></div>
            </form>
          </div>
        </div>
      )}

      <dialog ref={deletionDialog} className="ui-modal" aria-labelledby="delete-purchase-title" onCancel={event => { event.preventDefault(); if (!deletingPurchaseId) setPurchaseToDelete(null); }}>
        <div className="ui-modal-box rounded-2xl bg-white text-sm text-slate-900">
          <h3 id="delete-purchase-title" className="text-lg font-bold">{cancellationMode ? "Annuler" : "Supprimer"} l'achat {purchaseToDelete?.purchase_number} ?</h3>
          {cancellationMode ? <div className="space-y-3 py-4"><p>Statut : {purchaseToDelete && purchaseStatusLabel(purchaseToDelete)}. Déjà payé : {money(purchaseToDelete?.amount_paid || 0)}.</p><p>L'achat et sa livraison seront annulés et conservés dans l'historique. Les quantités acceptées seront retirées du stock si elles sont encore disponibles.</p>{!!purchaseToDelete?.amount_paid && <p>Les {money(purchaseToDelete.amount_paid)} payés resteront à récupérer auprès du fournisseur. Aucun fonds ne sera recrédité automatiquement.</p>}<label className="block">Motif obligatoire<input className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500" value={cancellationReason} disabled={!!deletingPurchaseId} onChange={event => setCancellationReason(event.target.value)} /></label></div> : <p className="py-4">L'achat et sa livraison non réceptionnée seront supprimés définitivement.</p>}
          {deletionError && <p role="alert" className="text-rose-700">{deletionError}</p>}
          <form method="dialog" className="ui-modal-action flex-wrap" onSubmit={event => { event.preventDefault(); if (!deletingPurchaseId) setPurchaseToDelete(null); }}>
            <button autoFocus className="ui-btn" disabled={!!deletingPurchaseId}>Annuler</button>
            <button type="button" className="ui-btn border-rose-600 bg-rose-600 text-white hover:bg-rose-700" disabled={!!deletingPurchaseId || !purchaseToDelete || (cancellationMode && !cancellationReason.trim())} onClick={async () => {
              if (!purchaseToDelete || deletingPurchaseId) return;
              const purchase = purchaseToDelete;
              setDeletingPurchaseId(purchase.id); setDeletionError("");
              try { if (cancellationMode) await onCancelPurchase(purchase, cancellationReason); else await onDeletePurchase(purchase); if (viewingPurchase?.id === purchase.id) setViewingPurchase(null); setPurchaseToDelete(null); }
              catch (error) { setDeletionError(error instanceof Error ? error.message : "Impossible de supprimer l'achat."); }
              finally { setDeletingPurchaseId(null); }
            }}>{deletingPurchaseId ? (cancellationMode ? "Annulation..." : "Suppression...") : (cancellationMode ? "Confirmer l’annulation" : "Confirmer la suppression")}</button>
          </form>
        </div>
      </dialog>

      {payingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-lg font-black">Enregistrer un paiement</h3><p className="mt-1 text-xs text-slate-500">{payingPurchase.supplier_name} · Facture {payingPurchase.invoice_number}</p></div><button type="button" onClick={() => setPayingPurchase(null)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{formError}</p>}
              <p className="rounded-lg bg-slate-50 p-3 text-slate-700">Solde dû: <strong>{money(payingPurchase.total - payingPurchase.amount_paid)}</strong></p>
              {requiresFund && <fieldset disabled={isSaving || !treasuryReady} className="space-y-3">
                <legend className="font-bold">Financement du paiement</legend>
                <button type="button" className="ui-btn ui-btn-sm" aria-pressed={splitFunds} onClick={() => setSplitFunds(value => !value)}>{splitFunds ? "Utiliser un seul fonds" : "Payer avec plusieurs fonds"}</button>
                {!splitFunds ? <label className="block">Fonds<select required className="ui-select ui-select-sm w-full rounded-xl border-slate-300 bg-white text-slate-900" value={fundId} onChange={event => setFundId(event.target.value)}><option value="">Choisir un fonds</option>{availableFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.source_reference} - {money(fund.balance)}</option>)}</select></label> : <>
                  <p>Choisissez jusqu'à trois fonds, dont au maximum deux remises POS / DEP.</p>
                  {allocations.map((allocation, index) => <div key={index} className="space-y-2 rounded border border-slate-200 p-2">
                    <label className="block">Fonds {index + 1}<select required className="ui-select ui-select-sm w-full rounded-xl border-slate-300 bg-white text-slate-900" value={allocation.fund_id} onChange={event => setAllocations(rows => rows.map((row, i) => i === index ? { ...row, fund_id: event.target.value } : row))}><option value="">Choisir un fonds</option>{availableFunds.filter(fund => fund.id === allocation.fund_id || !allocations.some(row => row.fund_id === fund.id)).map(fund => <option key={fund.id} value={fund.id}>{fund.source_reference} - {money(fund.balance)}</option>)}</select></label>
                    <label className="block">Montant pris sur ce fonds (Ar)<input className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500" required type="number" min="1" step="1" max={availableFunds.find(fund => fund.id === allocation.fund_id)?.balance || 0} value={allocation.amount || ""} onChange={event => setAllocations(rows => rows.map((row, i) => i === index ? { ...row, amount: Number(event.target.value) } : row))} /></label>
                    {allocations.length > 1 && <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAllocations(rows => rows.filter((_, i) => i !== index))}>Retirer ce fonds</button>}
                  </div>)}
                  <button type="button" className="ui-btn ui-btn-sm" disabled={allocations.length >= 3} onClick={() => setAllocations(rows => [...rows, { fund_id: "", amount: 0 }])}>Ajouter un fonds</button>
                  <p role="status">Total réparti : <strong>{money(allocatedTotal)}</strong> / {money(paymentAmount)}. Reste à répartir : {money(paymentAmount - allocatedTotal)}.</p>
                </>}
              </fieldset>}
              <label className="block font-bold text-slate-700">Montant versé<input required min="1" step="1" max={payingPurchase.total - payingPurchase.amount_paid} type="number" value={paymentAmount} onChange={event => setPaymentAmount(Number(event.target.value))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 tabular-nums text-slate-900" /></label>
              <label className="block font-bold text-slate-700">Mode de paiement<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 text-slate-900">{PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label className="block font-bold text-slate-700">Référence (optionnel)<input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-normal text-slate-900" /></label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setPayingPurchase(null)} className="ui-btn h-auto min-h-10 rounded-xl border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-none hover:bg-slate-50">Annuler</button><button disabled={isSaving} className="ui-btn h-auto min-h-10 rounded-xl border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-4 w-4" />{isSaving ? "Enregistrement..." : "Confirmer le paiement"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
