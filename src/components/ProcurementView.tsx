import { FormEvent, useMemo, useState } from "react";
import {
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
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Plus,
  Truck,
  UserRound,
  X
} from "lucide-react";
import DataManagementActions from "./DataManagementActions";
import { createSequentialId } from "../services/idService";

interface ProcurementViewProps {
  suppliers: Supplier[];
  purchases: Purchase[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateSupplier: (supplier: Supplier) => Promise<void>;
  onToggleSupplier: (supplier: Supplier) => Promise<void>;
  onReceivePurchase: (purchase: Purchase) => Promise<void>;
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
const warehouseOptionLabel = (store: Store) => `${store.code} · ${store.name}`;

export default function ProcurementView({
  suppliers,
  purchases,
  stores,
  articles,
  stocks,
  currentUser,
  onCreateSupplier,
  onToggleSupplier,
  onReceivePurchase,
  onRecordPayment,
  onImportData,
  onResetData
}: ProcurementViewProps) {
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
  const [paymentReference, setPaymentReference] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeSuppliers = suppliers.filter(supplier => supplier.is_active);
  const activeArticles = articles.filter(article => article.is_active && article.article_type === "RAW_MATERIAL");
  const centralWarehouses = stores.filter(store => store.is_active && store.store_type === "CENTRAL_WAREHOUSE");
  const purchaseTotal = draftLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const pendingPurchases = useMemo(
    () => purchases.filter(purchase => purchase.payment_status !== "PAID").sort((a, b) => a.expected_payment_at - b.expected_payment_at),
    [purchases]
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

  const startNewPurchase = () => {
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
      await onCreateSupplier({
        id: await createSequentialId("FOU", suppliers.map(supplier => supplier.id)),
        name: supplierName.trim(),
        contact_name: supplierContact.trim() || undefined,
        phone: supplierPhone.trim() || undefined,
        email: supplierEmail.trim() || undefined,
        address: supplierAddress.trim() || undefined,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp
      });
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

  const handleReceivePurchase = async (event: FormEvent) => {
    event.preventDefault();
    const supplier = activeSuppliers.find(item => item.id === purchaseSupplierId);
    const receivingStore = centralWarehouses.find(item => item.id === purchaseStoreId);
    if (!supplier || !receivingStore || !invoiceNumber.trim() || !expectedPaymentDate || draftLines.length === 0) {
      setFormError("Fournisseur, magasin, référence, échéance et au moins un article sont obligatoires.");
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
      invoice_number: invoiceNumber.trim(),
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
      amount_paid: 0,
      payment_status: "UNPAID",
      expected_payment_at: new Date(`${expectedPaymentDate}T12:00:00`).getTime(),
      payments: [],
      notes: purchaseNotes.trim() || undefined,
      received_by: currentUser.uid,
      received_by_name: currentUser.displayName || currentUser.email,
      received_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    };

    setIsSaving(true);
    setFormError("");
    try {
      await onReceivePurchase(purchase);
      setIsPurchaseModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer la réception.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!payingPurchase || paymentAmount <= 0 || paymentAmount > payingPurchase.total - payingPurchase.amount_paid) {
      setFormError("Le montant doit être supérieur à zéro et ne pas dépasser le solde dû.");
      return;
    }
    setIsSaving(true);
    setFormError("");
    try {
      await onRecordPayment(payingPurchase, {
        id: `payment-${crypto.randomUUID()}`,
        amount: Number(paymentAmount),
        paid_at: Date.now(),
        method: paymentMethod,
        reference: paymentReference.trim() || undefined
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
    setFormError("");
    setPayingPurchase(purchase);
    setPaymentAmount(purchase.total - purchase.amount_paid);
    setPaymentMethod("BANK_TRANSFER");
    setPaymentReference("");
  };

  const updateDraftLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">Achats & fournisseurs</h2>
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
          <button type="button" onClick={() => { setFormError(""); setIsSupplierModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <UserRound className="h-4 w-4" /> Nouveau fournisseur
          </button>
          <button type="button" onClick={startNewPurchase} disabled={activeSuppliers.length === 0 || activeArticles.length === 0 || centralWarehouses.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Achat / réception
          </button>
        </div>
      </header>
      {(centralWarehouses.length === 0 || activeArticles.length === 0 || activeSuppliers.length === 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Pour saisir un achat, ajoutez au moins un fournisseur actif, une matière première active et un dépôt central actif.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Fournisseurs actifs</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{activeSuppliers.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800">À payer ce mois</p>
          <p className="mt-1 text-xl font-bold text-amber-950">{money(dueThisMonth)}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-semibold text-rose-800">En retard</p>
          <p className="mt-1 text-xl font-bold text-rose-950">{money(overdueTotal)}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button type="button" onClick={() => setActiveTab("purchases")} className={`px-4 py-2 text-xs font-bold ${activeTab === "purchases" ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-800"}`}>
          <ClipboardList className="mr-1 inline h-4 w-4" /> Achats & paiements ({purchases.length})
        </button>
        <button type="button" onClick={() => setActiveTab("suppliers")} className={`px-4 py-2 text-xs font-bold ${activeTab === "suppliers" ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-800"}`}>
          <UserRound className="mr-1 inline h-4 w-4" /> Fournisseurs ({suppliers.length})
        </button>
      </div>

      {activeTab === "purchases" ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <CalendarDays className="h-4 w-4 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-900">Calendrier des paiements à venir</h3>
          </div>
          {pendingPurchases.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">Aucune échéance en attente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">Échéance</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Facture</th><th className="px-4 py-2 text-right">Solde à payer</th><th className="px-4 py-2">Statut</th><th className="px-4 py-2 text-right">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingPurchases.map(purchase => {
                    const overdue = purchase.expected_payment_at < new Date().setHours(0, 0, 0, 0);
                    return <tr key={`due-${purchase.id}`}>
                      <td className={`px-4 py-3 font-semibold ${overdue ? "text-rose-700" : "text-slate-700"}`}>{dateLabel(purchase.expected_payment_at)}{overdue && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px]">En retard</span>}</td>
                      <td className="px-4 py-3 text-slate-800">{purchase.supplier_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{purchase.invoice_number}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{money(purchase.total - purchase.amount_paid)}</td>
                      <td className="px-4 py-3 text-slate-600">{purchase.payment_status === "PARTIAL" ? "Partiellement réglé" : "À régler"}</td>
                      <td className="px-4 py-3 text-right"><button type="button" onClick={() => openPaymentForm(purchase)} className="inline-flex items-center gap-1 rounded border border-teal-200 px-2 py-1 font-bold text-teal-800 hover:bg-teal-50"><CreditCard className="h-3.5 w-3.5" /> Régler</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.length === 0 && <p className="col-span-full rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Aucun fournisseur enregistré.</p>}
          {suppliers.map(supplier => (
            <article key={supplier.id} className={`rounded-lg border bg-white p-4 ${supplier.is_active ? "border-slate-200" : "border-slate-200 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div><h3 className="text-sm font-bold text-slate-900">{supplier.name}</h3><p className="mt-1 text-xs text-slate-500">{supplier.contact_name || "Contact non renseigné"}</p></div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${supplier.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{supplier.is_active ? "Actif" : "Inactif"}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-600"><p>{supplier.phone || "Téléphone non renseigné"}</p><p>{supplier.email || "Email non renseigné"}</p><p>{supplier.address || "Adresse non renseignée"}</p></div>
              <button type="button" onClick={() => void onToggleSupplier({ ...supplier, is_active: !supplier.is_active, updated_at: Date.now() }).catch(error => window.alert(error instanceof Error ? error.message : "Modification impossible."))} className="mt-4 text-xs font-bold text-teal-800 hover:underline">{supplier.is_active ? "Désactiver" : "Réactiver"}</button>
            </article>
          ))}
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">Historique des achats réceptionnés</h3></div>
        {purchases.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-500">Aucun achat enregistré.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">Date réception</th><th className="px-4 py-2">Référence</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2">Lignes</th><th className="px-4 py-2">Échéance</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2">Paiement</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...purchases].sort((a, b) => b.received_at - a.received_at).map(purchase => <tr
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
                  className="cursor-pointer hover:bg-teal-50 focus:bg-teal-50 focus:outline-none"
                >
                  <td className="px-4 py-3 text-slate-600">{dateLabel(purchase.received_at)}</td><td className="px-4 py-3 font-mono font-bold text-teal-800">{purchase.purchase_number}<span className="block font-normal text-slate-400">Facture {purchase.invoice_number}</span></td><td className="px-4 py-3 font-semibold text-slate-800">{purchase.supplier_name}</td><td className="px-4 py-3 text-slate-600">{purchase.lines.length} article(s)</td><td className="px-4 py-3 text-slate-600">{dateLabel(purchase.expected_payment_at)}</td><td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{money(purchase.total)}</td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-[10px] font-bold ${purchase.payment_status === "PAID" ? "bg-emerald-100 text-emerald-800" : purchase.payment_status === "PARTIAL" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>{purchase.payment_status === "PAID" ? "Payé" : purchase.payment_status === "PARTIAL" ? `Partiel · reste ${money(purchase.total - purchase.amount_paid)}` : "Non payé"}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {viewingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold">Détail de l’achat {viewingPurchase.purchase_number}</h3>
                <p className="mt-1 text-xs text-slate-500">Facture {viewingPurchase.invoice_number} · {viewingPurchase.supplier_name}</p>
              </div>
              <button type="button" onClick={() => setViewingPurchase(null)} aria-label="Fermer" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Réception</p><p className="mt-1 font-semibold">{dateLabel(viewingPurchase.received_at)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Dépôt central</p><p className="mt-1 font-semibold">{stores.find(store => store.id === viewingPurchase.store_id)?.name || "Dépôt supprimé"}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Échéance</p><p className="mt-1 font-semibold">{dateLabel(viewingPurchase.expected_payment_at)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Réceptionné par</p><p className="mt-1 font-semibold">{viewingPurchase.received_by_name}</p></div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Matière première</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2 text-right">Prix unitaire</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{viewingPurchase.lines.map(line => <tr key={line.id}>
                  <td className="px-3 py-2"><span className="font-semibold text-slate-800">{line.article_name}</span><span className="ml-2 font-mono text-slate-400">{line.article_code}</span></td>
                  <td className="px-3 py-2 text-right font-mono">{line.quantity} {line.unit}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(line.unit_cost)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{money(line.total)}</td>
                </tr>)}</tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50"><tr><td colSpan={3} className="px-3 py-2 text-right font-bold">Total facture</td><td className="px-3 py-2 text-right font-mono font-bold">{money(viewingPurchase.total)}</td></tr></tfoot>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800">Règlements</h4>
                {viewingPurchase.payments.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucun règlement enregistré.</p> : <ul className="mt-2 space-y-2">{viewingPurchase.payments.map(payment => <li key={payment.id} className="flex justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-xs"><span className="text-slate-600">{dateLabel(payment.paid_at)} · {PAYMENT_METHODS.find(method => method.value === payment.method)?.label || payment.method}{payment.reference && <span className="block text-[10px] text-slate-400">Réf. {payment.reference}</span>}</span><strong className="font-mono text-slate-900">{money(payment.amount)}</strong></li>)}</ul>}
              </div>
              <div className="space-y-2 rounded-lg bg-teal-50 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-600">Statut</span><strong>{viewingPurchase.payment_status === "PAID" ? "Payé" : viewingPurchase.payment_status === "PARTIAL" ? "Partiellement payé" : "À payer"}</strong></div>
                <div className="flex justify-between"><span className="text-slate-600">Déjà réglé</span><strong className="font-mono">{money(viewingPurchase.amount_paid)}</strong></div>
                <div className="flex justify-between border-t border-teal-200 pt-2"><span className="font-bold">Reste dû</span><strong className="font-mono">{money(viewingPurchase.total - viewingPurchase.amount_paid)}</strong></div>
              </div>
            </div>
            {viewingPurchase.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Note : {viewingPurchase.notes}</p>}
            <div className="mt-4 flex justify-end border-t border-slate-200 pt-3"><button type="button" onClick={() => setViewingPurchase(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Fermer</button></div>
          </div>
        </div>
      )}

      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><h3 className="text-base font-bold">Nouveau fournisseur</h3><button type="button" onClick={() => setIsSupplierModalOpen(false)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              {formError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{formError}</p>}
              <label className="block font-bold text-slate-700">Nom du fournisseur<input required value={supplierName} onChange={event => setSupplierName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
              <label className="block font-bold text-slate-700">Personne de contact<input value={supplierContact} onChange={event => setSupplierContact(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block font-bold text-slate-700">Téléphone (facultatif)<input value={supplierPhone} onChange={event => setSupplierPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label><label className="block font-bold text-slate-700">Email (facultatif)<input type="email" value={supplierEmail} onChange={event => setSupplierEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label></div>
              <label className="block font-bold text-slate-700">Adresse<input value={supplierAddress} onChange={event => setSupplierAddress(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setIsSupplierModalOpen(false)} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Annuler</button><button disabled={isSaving} className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">{isSaving ? "Enregistrement..." : "Créer le fournisseur"}</button></div>
            </form>
          </div>
        </div>
      )}

      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-auto w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-base font-bold">Achat de matières premières</h3><p className="mt-1 text-xs text-slate-500">La réception crédite uniquement le dépôt central sélectionné.</p></div><button type="button" onClick={() => setIsPurchaseModalOpen(false)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleReceivePurchase} className="space-y-4 text-xs">
              {formError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{formError}</p>}
              <datalist id="purchase-suppliers">{activeSuppliers.map(supplier => <option key={supplier.id} value={supplierOptionLabel(supplier)} />)}</datalist>
              <datalist id="purchase-raw-materials">{activeArticles.map(article => <option key={article.id} value={articleOptionLabel(article)} />)}</datalist>
              <datalist id="purchase-central-warehouses">{centralWarehouses.map(store => <option key={store.id} value={warehouseOptionLabel(store)} />)}</datalist>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="font-bold text-slate-700">Fournisseur<input required list="purchase-suppliers" value={supplierQuery} onChange={event => { const value = event.target.value; setSupplierQuery(value); setPurchaseSupplierId(activeSuppliers.find(supplier => supplierOptionLabel(supplier) === value)?.id || ""); }} placeholder="Fournisseur..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900 placeholder:text-slate-400" /></label>
                <label className="font-bold text-slate-700">Dépôt central de réception<input required list="purchase-central-warehouses" value={warehouseQuery} onChange={event => { const value = event.target.value; setWarehouseQuery(value); setPurchaseStoreId(centralWarehouses.find(store => warehouseOptionLabel(store) === value)?.id || ""); }} placeholder="Dépôt central..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900 placeholder:text-slate-400" /></label>
                <label className="font-bold text-slate-700">N° facture / bon<input required value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
                <label className="font-bold text-slate-700">Échéance de paiement<input required type="date" value={expectedPaymentDate} onChange={event => setExpectedPaymentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[620px] text-left"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Matière première</th><th className="px-3 py-2">Stock au dépôt</th><th className="px-3 py-2">Quantité reçue</th><th className="px-3 py-2">Prix unitaire</th><th className="px-3 py-2 text-right">Total</th><th className="px-2 py-2" /></tr></thead><tbody className="divide-y divide-slate-100">{draftLines.map((line, index) => {
                  const article = articles.find(item => item.id === line.articleId);
                  return <tr key={index}><td className="px-3 py-2"><input list="purchase-raw-materials" value={line.articleQuery} onChange={event => { const value = event.target.value; const selected = activeArticles.find(item => articleOptionLabel(item) === value); updateDraftLine(index, { articleQuery: value, articleId: selected?.id || "", unitCost: selected?.prix_achat ?? line.unitCost }); }} placeholder="Matière première..." className="w-full rounded border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-400" /></td><td className="px-3 py-2 text-center font-mono text-slate-600">{getStockQuantity(purchaseStoreId, line.articleId)}</td><td className="px-3 py-2"><input min="1" type="number" value={line.quantity} onChange={event => updateDraftLine(index, { quantity: Number(event.target.value) })} className="w-24 rounded border border-slate-300 bg-white p-2 text-right text-slate-900" /></td><td className="px-3 py-2"><input min="0" type="number" value={line.unitCost} onChange={event => updateDraftLine(index, { unitCost: Number(event.target.value) })} className="w-32 rounded border border-slate-300 bg-white p-2 text-right text-slate-900" /></td><td className="px-3 py-2 text-right font-mono font-bold text-slate-900">{money(line.quantity * line.unitCost)}</td><td className="px-2 py-2"><button type="button" disabled={draftLines.length === 1} onClick={() => setDraftLines(current => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Retirer la ligne" className="px-2 font-bold text-rose-700 disabled:opacity-30">×</button></td></tr>;
                })}</tbody></table>
              </div>
              <button type="button" disabled={draftLines.length >= 100} onClick={() => setDraftLines(current => [...current, { articleId: "", articleQuery: "", quantity: 1, unitCost: 0 }])} className="font-bold text-teal-800 hover:underline disabled:opacity-50">+ Ajouter une ligne</button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="font-bold text-slate-700">Notes<input value={purchaseNotes} onChange={event => setPurchaseNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label><div className="flex items-end justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="font-bold text-slate-700">Total achat</span><strong className="font-mono text-base text-slate-900">{money(purchaseTotal)}</strong></div></div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setIsPurchaseModalOpen(false)} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Annuler</button><button disabled={isSaving} className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">{isSaving ? "Réception..." : "Enregistrer et réceptionner"}</button></div>
            </form>
          </div>
        </div>
      )}

      {payingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3"><div><h3 className="text-base font-bold">Enregistrer un paiement</h3><p className="mt-1 text-xs text-slate-500">{payingPurchase.supplier_name} · Facture {payingPurchase.invoice_number}</p></div><button type="button" onClick={() => setPayingPurchase(null)} aria-label="Fermer"><X className="h-5 w-5 text-slate-500" /></button></div>
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              {formError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-700">{formError}</p>}
              <p className="rounded-lg bg-slate-50 p-3 text-slate-700">Solde dû: <strong>{money(payingPurchase.total - payingPurchase.amount_paid)}</strong></p>
              <label className="block font-bold text-slate-700">Montant versé<input required min="1" max={payingPurchase.total - payingPurchase.amount_paid} type="number" value={paymentAmount} onChange={event => setPaymentAmount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-slate-900" /></label>
              <label className="block font-bold text-slate-700">Mode de paiement<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900">{PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label className="block font-bold text-slate-700">Référence (optionnel)<input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal text-slate-900" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setPayingPurchase(null)} className="rounded-lg px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">Annuler</button><button disabled={isSaving} className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50"><CheckCircle2 className="mr-1 inline h-4 w-4" />{isSaving ? "Enregistrement..." : "Confirmer le paiement"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}