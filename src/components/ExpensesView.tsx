import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, CircleDollarSign, ClipboardList, HandCoins, Plus, Search } from "lucide-react";
import { Expense, ExpenseCategory, PaymentMethod, Store, UserProfile } from "../types";

interface ExpensesViewProps {
  expenses: Expense[];
  stores: Store[];
  currentUser: UserProfile;
  canCreate: boolean;
  onCreateExpense: (expense: Expense) => Promise<void>;
}

const CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "RENT", label: "Loyer" },
  { value: "ELECTRICITY", label: "Électricité" },
  { value: "FUEL", label: "Carburant" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "MAINTENANCE", label: "Entretien" },
  { value: "SUPPLIES", label: "Fournitures" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "FOOD", label: "Nourriture" },
  { value: "OTHER", label: "Autres frais" }
];

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Espèces" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "MVOLA", label: "MVola" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "CHECK", label: "Chèque" }
];

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const dateInputValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const dateLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString("fr-FR");
const categoryLabel = (category: ExpenseCategory) => CATEGORIES.find(item => item.value === category)?.label || "Autres frais";
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function ExpensesView({ expenses, stores, currentUser, canCreate, onCreateExpense }: ExpensesViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("RENT");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(dateInputValue(Date.now()));
  const [storeId, setStoreId] = useState("");
  const [payee, setPayee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<Expense["payment_status"]>("PAID");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visibleExpenses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
    return expenses.filter(expense => {
      const date = new Date(expense.expense_date);
      const matchesMonth = !monthFilter || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === monthFilter;
      const searchableText = [expense.expense_number, expense.description, expense.payee, expense.store_name, expense.reference, categoryLabel(expense.category)]
        .filter(Boolean).join(" ").toLocaleLowerCase("fr-FR");
      return matchesMonth && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [expenses, monthFilter, search]);

  const currentMonthExpenses = expenses.filter(expense => {
    const date = new Date(expense.expense_date);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const monthTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pendingTotal = expenses.filter(expense => expense.payment_status === "PENDING").reduce((sum, expense) => sum + expense.amount, 0);

  const handleCreateExpense = async (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    const selectedStore = stores.find(store => store.id === storeId);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !expenseDate) {
      setFormError("Renseignez un motif, un montant positif et une date valide.");
      return;
    }

    const timestamp = Date.now();
    const expense: Expense = {
      id: `expense-${crypto.randomUUID()}`,
      expense_number: `DEP-${new Date(timestamp).getFullYear()}-${String(timestamp).slice(-6)}`,
      category,
      description: description.trim(),
      amount: numericAmount,
      expense_date: new Date(`${expenseDate}T12:00:00`).getTime(),
      store_id: selectedStore?.id,
      store_name: selectedStore?.name,
      payee: payee.trim() || undefined,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      created_by: currentUser.uid,
      created_by_name: currentUser.displayName || currentUser.email,
      created_at: timestamp
    };

    setIsSaving(true);
    setFormError("");
    try {
      await onCreateExpense(expense);
      setDescription("");
      setAmount("");
      setPayee("");
      setReference("");
      setNotes("");
      setPaymentStatus("PAID");
      setExpenseDate(dateInputValue(Date.now()));
      setIsFormOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer cette dépense.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-bold">Dépenses & frais</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Suivi des charges, paiements et dépenses par magasin.</p>
        </div>
        {canCreate && <button type="button" onClick={() => { setFormError(""); setIsFormOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="h-4 w-4" /> Enregistrer une dépense</button>}
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Dépenses du mois</p><p className="mt-1 text-xl font-bold text-slate-900">{money(monthTotal)}</p></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Reste à payer</p><p className="mt-1 text-xl font-bold text-amber-950">{money(pendingTotal)}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Opérations enregistrées</p><p className="mt-1 text-xl font-bold text-slate-900">{expenses.length}</p></div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold"><ClipboardList className="h-4 w-4 text-slate-500" /> Historique des dépenses</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une dépense" className={`${inputClass} pl-9 sm:w-56`} /></label>
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Filtrer par mois" type="month" value={monthFilter} onChange={event => setMonthFilter(event.target.value)} className={`${inputClass} pl-9 sm:w-44`} /></label>
          </div>
        </div>

        {visibleExpenses.length === 0 ? (
          <div className="px-4 py-12 text-center"><CircleDollarSign className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Aucune dépense trouvée</p><p className="mt-1 text-xs text-slate-500">Les loyers, factures, carburants et autres frais apparaîtront ici.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3 font-bold">Dépense</th><th className="px-4 py-3 font-bold">Date / Magasin</th><th className="px-4 py-3 font-bold">Bénéficiaire</th><th className="px-4 py-3 font-bold">Paiement</th><th className="px-4 py-3 text-right font-bold">Montant</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleExpenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{expense.description}</p><p className="mt-1 text-[10px] text-slate-500">{categoryLabel(expense.category)} · {expense.expense_number}</p></td>
                    <td className="px-4 py-3 text-slate-700">{dateLabel(expense.expense_date)}<p className="mt-1 text-[10px] text-slate-500">{expense.store_name || "Tous magasins"}</p></td>
                    <td className="px-4 py-3 text-slate-700">{expense.payee || "—"}<p className="mt-1 text-[10px] text-slate-500">{expense.reference || "Sans référence"}</p></td>
                    <td className="px-4 py-3 text-slate-700">{PAYMENT_METHODS.find(method => method.value === expense.payment_method)?.label || expense.payment_method}<p className={`mt-1 text-[10px] font-semibold ${expense.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"}`}>{expense.payment_status === "PAID" ? "Payée" : "À payer"}</p></td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{money(expense.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIsFormOpen(false); }}>
          <form onSubmit={handleCreateExpense} className="my-auto w-full max-w-2xl space-y-4 rounded-xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-bold text-slate-900">Nouvelle dépense</h3><p className="mt-1 text-xs text-slate-500">Saisissez les détails de la charge à suivre.</p></div><button type="button" onClick={() => setIsFormOpen(false)} aria-label="Fermer" className="rounded-md px-2 py-1 text-lg text-slate-500 hover:bg-slate-100">×</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-700">Catégorie<select value={category} onChange={event => setCategory(event.target.value as ExpenseCategory)} className={inputClass}>{CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Montant (Ar)<input required type="number" min="1" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">Motif / description<input required value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex. Loyer du magasin pour septembre" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Date<input required type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Magasin<select value={storeId} onChange={event => setStoreId(event.target.value)} className={inputClass}><option value="">Tous magasins / siège</option>{stores.filter(store => store.is_active).map(store => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Bénéficiaire / fournisseur<input value={payee} onChange={event => setPayee(event.target.value)} placeholder="Nom du bailleur ou prestataire" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Mode de paiement<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)} className={inputClass}>{PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Statut<select value={paymentStatus} onChange={event => setPaymentStatus(event.target.value as Expense["payment_status"])} className={inputClass}><option value="PAID">Payée</option><option value="PENDING">À payer</option></select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">N° facture / référence<input value={reference} onChange={event => setReference(event.target.value)} placeholder="Référence du justificatif" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">Notes<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Détails complémentaires" className={inputClass} /></label>
            </div>
            {formError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Annuler</button><button disabled={isSaving} type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isSaving ? "Enregistrement..." : "Enregistrer la dépense"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}