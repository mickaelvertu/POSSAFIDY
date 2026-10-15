import { FormEvent, ReactNode, useMemo, useState } from "react";
import { Banknote, Building2, CheckCircle2, ClipboardCheck, Landmark, Plus, ReceiptText } from "lucide-react";
import { AppUser, CashHandover, CashHandoverDeposit, Expense, Sale, Store } from "../types";
import { calculateCashClosing } from "../services/cashClosingCalculation";

interface CashHandoverViewProps {
  handovers: CashHandover[];
  loadError?: string | null;
  sales: Sale[];
  expenses: Expense[];
  stores: Store[];
  currentUser: AppUser;
  canCreate: boolean;
  canReceive: boolean;
  canDeposit: boolean;
  onCreate: (handover: CashHandover) => Promise<void>;
  onConfirmReceipt: (handover: CashHandover, receivedAmount: number, note: string) => Promise<void>;
  onRecordDeposit: (handover: CashHandover, deposit: CashHandoverDeposit) => Promise<void>;
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const localDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const statusLabels: Record<CashHandover["status"], string> = {
  DECLARED: "À réceptionner",
  RECEIVED: "Reçue",
  DISCREPANCY: "Écart à vérifier",
  PARTIALLY_DEPOSITED: "Dépôt partiel",
  DEPOSITED: "Déposée à la banque"
};

export default function CashHandoverView({
  handovers, loadError, sales, expenses, stores, currentUser, canCreate, canReceive, canDeposit,
  onCreate, onConfirmReceipt, onRecordDeposit
}: CashHandoverViewProps) {
  const posStores = stores.filter(store => store.store_type === "POS" && store.is_active);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [receiptHandover, setReceiptHandover] = useState<CashHandover | null>(null);
  const [depositHandover, setDepositHandover] = useState<CashHandover | null>(null);
  const [storeId, setStoreId] = useState(posStores.length === 1 ? posStores[0].id : "");
  const [businessDate, setBusinessDate] = useState(localDate(Date.now()));
  const [receivedAmount, setReceivedAmount] = useState("");
  const [discrepancyNote, setDiscrepancyNote] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [depositReference, setDepositReference] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const closing = useMemo(() => calculateCashClosing(sales, expenses, storeId, businessDate), [sales, expenses, storeId, businessDate]);
  const expectedCash = closing.salesAmount;
  const declaredAmount = closing.netAmount;

  const resetCreateForm = () => {
    setIsCreateOpen(false);
    setFormError("");
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (loadError) { setFormError(loadError); return; }
    if (declaredAmount < 0) { setFormError("Les dépenses dépassent les ventes espèces du jour. Vérifiez la caisse avant de déclarer la clôture."); return; }
    const store = posStores.find(item => item.id === storeId);
    const amount = Number(declaredAmount);
    if (!store || !businessDate || !Number.isInteger(amount) || amount < 0) {
      setFormError("Choisissez un point de vente, une date et saisissez un montant valide.");
      return;
    }
    if (businessDate > localDate(Date.now())) {
      setFormError("La date de clôture ne peut pas être dans le futur.");
      return;
    }
    if (!currentUser.storeIds.includes(store.id) && currentUser.roleId !== "ADMIN" && currentUser.roleId !== "SUPER_ADMIN") {
      setFormError("Ce point de vente n'est pas attribué à votre compte.");
      return;
    }
    const handoverId = `cash-handover-${encodeURIComponent(store.id)}-${businessDate}`;
    if (handovers.some(item => item.id === handoverId)) {
      setFormError("Une déclaration existe déjà pour ce point de vente et cette journée.");
      return;
    }
    const timestamp = Date.now();
    const handover: CashHandover = {
      id: handoverId,
      handover_number: `REM-${businessDate.replace(/-/g, "")}-${store.code}`,
      store_id: store.id,
      store_name: store.name,
      business_date: businessDate,
      expected_cash_sales: expectedCash,
      cash_sale_count: closing.saleCount,
      declared_amount: amount,
      declared_by: currentUser.uid,
      declared_by_name: currentUser.displayName,
      declared_at: timestamp,
      status: "DECLARED",
      deposited_amount: 0,
      deposits: []
    };
    setBusy(true);
    setFormError("");
    try {
      await onCreate(handover);
      resetCreateForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer la déclaration.");
    } finally {
      setBusy(false);
    }
  };

  const handleReceipt = async (event: FormEvent) => {
    event.preventDefault();
    if (!receiptHandover) return;
    const amount = Number(receivedAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      setFormError("Saisissez le montant réellement reçu.");
      return;
    }
    if (amount !== receiptHandover.declared_amount && !discrepancyNote.trim()) {
      setFormError("Expliquez l'écart avant de confirmer la réception.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await onConfirmReceipt(receiptHandover, amount, discrepancyNote);
      setReceiptHandover(null);
      setReceivedAmount("");
      setDiscrepancyNote("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible de confirmer la réception.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeposit = async (event: FormEvent) => {
    event.preventDefault();
    if (!depositHandover) return;
    const amount = Number(depositAmount);
    const remaining = (depositHandover.received_amount || 0) - depositHandover.deposited_amount;
    if (!Number.isInteger(amount) || amount <= 0 || amount > remaining || !bankName.trim() || !depositReference.trim()) {
      setFormError(`Saisissez un dépôt positif ne dépassant pas le solde de ${money(remaining)}, la banque et la référence.`);
      return;
    }
    const deposit: CashHandoverDeposit = {
      amount,
      bank_name: bankName.trim(),
      reference: depositReference.trim(),
      deposited_by: currentUser.uid,
      deposited_by_name: currentUser.displayName,
      deposited_at: Date.now()
    };
    setBusy(true);
    setFormError("");
    try {
      await onRecordDeposit(depositHandover, deposit);
      setDepositHandover(null);
      setDepositAmount("");
      setBankName("");
      setDepositReference("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer le dépôt bancaire.");
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = (handover: CashHandover) => {
    setFormError("");
    setReceivedAmount(String(handover.declared_amount));
    setDiscrepancyNote("");
    setReceiptHandover(handover);
  };
  const openDeposit = (handover: CashHandover) => {
    setFormError("");
    setDepositAmount(String((handover.received_amount || 0) - handover.deposited_amount));
    setBankName("");
    setDepositReference("");
    setDepositHandover(handover);
  };

  const modal = (title: string, submitLabel: string, onSubmit: (event: FormEvent) => void, children: ReactNode) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {children}
        {formError && <p role="alert" className="text-sm font-medium text-rose-700">{formError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { resetCreateForm(); setReceiptHandover(null); setDepositHandover(null); setFormError(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Enregistrement…" : submitLabel}</button>
        </div>
      </form>
    </div>
  );

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Remises de caisse</h1>
          <p className="mt-1 text-sm text-slate-600">Déclaration POS, confirmation de réception et suivi des dépôts bancaires.</p>
        </div>
        {canCreate && <button type="button" onClick={() => { setFormError(""); setIsCreateOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Déclarer une clôture POS</button>}
      </header>

      <aside className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-bold">Séparation des responsabilités</p>
        <p className="mt-1">Le responsable POS déclare. Une autre personne confirme le montant encaissé. Le dépôt est ensuite enregistré avec sa banque et son bordereau. Les achats et dépenses restent saisis dans leurs modules habituels avec leurs justificatifs.</p>
      </aside>

      {loadError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Impossible de charger les remises de caisse : {loadError}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800"><ReceiptText className="h-4 w-4 text-emerald-700" /> Historique des remises</div>
        {handovers.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Aucune remise de caisse pour les points de vente accessibles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
                <th className="px-4 py-3">Remise / Point de vente</th><th className="px-4 py-3">Déclaration</th><th className="px-4 py-3">Réception</th><th className="px-4 py-3">Banque</th><th className="px-4 py-3">Statut / Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {handovers.map(handover => {
                  const remaining = (handover.received_amount || 0) - handover.deposited_amount;
                  const canConfirm = canReceive && handover.status === "DECLARED" && handover.declared_by !== currentUser.uid;
                  const canAddDeposit = canDeposit && ["RECEIVED", "DISCREPANCY", "PARTIALLY_DEPOSITED"].includes(handover.status) && remaining > 0;
                  return (
                    <tr key={handover.id} className="align-top">
                      <td className="px-4 py-3"><p className="font-bold text-slate-900">{handover.handover_number}</p><p className="mt-1 text-slate-600">{handover.store_name}</p><p className="mt-1 text-slate-500">{new Date(`${handover.business_date}T12:00:00`).toLocaleDateString("fr-FR")}</p></td>
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{money(handover.declared_amount)}</p><p className="mt-1 text-slate-500">Par {handover.declared_by_name}</p><p className="mt-1 text-slate-500">Ventes espèces attendues : {money(handover.expected_cash_sales)} ({handover.cash_sale_count})</p></td>
                      <td className="px-4 py-3">{handover.received_by ? <><p className="font-semibold text-slate-800">{money(handover.received_amount || 0)}</p><p className="mt-1 text-slate-500">Par {handover.received_by_name}</p>{handover.discrepancy_note && <p className="mt-1 max-w-48 text-rose-700">{handover.discrepancy_note}</p>}</> : <span className="text-slate-400">En attente</span>}</td>
                      <td className="px-4 py-3"><p className="font-semibold text-slate-800">{money(handover.deposited_amount)}</p>{handover.deposits.map((deposit, index) => <p key={`${deposit.reference}-${index}`} className="mt-1 text-slate-500">{deposit.bank_name} · {deposit.reference} · {money(deposit.amount)}</p>)}{remaining > 0 && handover.received_by && <p className="mt-1 text-amber-700">Solde : {money(remaining)}</p>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 font-bold ${handover.status === "DISCREPANCY" ? "bg-rose-100 text-rose-800" : handover.status === "DEPOSITED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{statusLabels[handover.status]}</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {canConfirm && <button type="button" onClick={() => openReceipt(handover)} className="inline-flex items-center gap-1 font-semibold text-blue-700"><ClipboardCheck className="h-3.5 w-3.5" /> Confirmer réception</button>}
                          {canAddDeposit && <button type="button" onClick={() => openDeposit(handover)} className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Landmark className="h-3.5 w-3.5" /> Enregistrer dépôt</button>}
                          {!canConfirm && handover.status === "DECLARED" && handover.declared_by === currentUser.uid && <span className="text-slate-500">En attente d'un autre utilisateur</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isCreateOpen && modal("Déclarer la clôture POS", "Envoyer la déclaration", handleCreate, <>
      <label className="block space-y-1 text-xs font-semibold text-slate-700">Point de vente<select required value={storeId} onChange={event => { setStoreId(event.target.value); }} className={inputClass}><option value="">Choisir un point de vente</option>{posStores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className="block space-y-1 text-xs font-semibold text-slate-700">Date de clôture<input required type="date" max={localDate(Date.now())} value={businessDate} onChange={event => { setBusinessDate(event.target.value); }} className={inputClass} /></label>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Ventes espèces validées enregistrées : <strong className="text-slate-900">{money(expectedCash)}</strong></div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Dépenses espèces payées du jour : <strong>{money(closing.expensesAmount)}</strong></div>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">Montant déclaré : ventes − dépenses (Ar)<input required type="number" min="0" step="1" value={declaredAmount} readOnly className={inputClass} /></label>
      </>)}

      {receiptHandover && modal(`Confirmer la réception · ${receiptHandover.handover_number}`, "Confirmer la réception", handleReceipt, <>
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Déclaré par <strong>{receiptHandover.declared_by_name}</strong> : <strong>{money(receiptHandover.declared_amount)}</strong></p>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">Montant réellement reçu (Ar)<input required type="number" min="0" step="1" value={receivedAmount} onChange={event => setReceivedAmount(event.target.value)} className={inputClass} /></label>
        {Number(receivedAmount) !== receiptHandover.declared_amount && <label className="block space-y-1 text-xs font-semibold text-slate-700">Explication obligatoire de l'écart<textarea required value={discrepancyNote} onChange={event => setDiscrepancyNote(event.target.value)} rows={3} className={inputClass} /></label>}
      </>)}

      {depositHandover && modal(`Enregistrer le dépôt · ${depositHandover.handover_number}`, "Enregistrer le dépôt", handleDeposit, <>
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Montant réceptionné : <strong>{money(depositHandover.received_amount || 0)}</strong> · Déjà déposé : <strong>{money(depositHandover.deposited_amount)}</strong></p>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">Montant déposé (Ar)<input required type="number" min="1" step="1" max={(depositHandover.received_amount || 0) - depositHandover.deposited_amount} value={depositAmount} onChange={event => setDepositAmount(event.target.value)} className={inputClass} /></label>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">Banque<input required value={bankName} onChange={event => setBankName(event.target.value)} className={inputClass} /></label>
        <label className="block space-y-1 text-xs font-semibold text-slate-700">Référence du bordereau<input required value={depositReference} onChange={event => setDepositReference(event.target.value)} className={inputClass} /></label>
      </>)}

      <div className="flex items-center gap-2 text-xs text-slate-500"><Building2 className="h-4 w-4" /><Banknote className="h-4 w-4" /><CheckCircle2 className="h-4 w-4" /> Chaque étape est associée à l'utilisateur connecté et horodatée.</div>
    </section>
  );
}
