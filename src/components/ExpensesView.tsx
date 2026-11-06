import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, Clock3, HandCoins, LoaderCircle, Pencil, Plus, ReceiptText, RotateCcw, Search, Trash2 } from "lucide-react";
import { Employee, Expense, ExpenseCategory, PaymentMethod, Store, TreasuryFund, UserProfile } from "../types";
import { STORE_EXPENSE_FUNDS } from "../services/expenseService";

interface ExpensesViewProps {
  expenses: Expense[];
  employees: Employee[];
  stores: Store[];
  currentUser: UserProfile;
  canCreate: boolean;
  canCreateSalaryAdvance: boolean;
  dataReady?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  treasuryFunds?: TreasuryFund[];
  treasuryReady?: boolean;
  onPayExpense?: (expense: Expense, fundId: string) => Promise<void>;
  onCancelExpense?: (expense: Expense, reason: string) => Promise<void>;
  onValidateExpense: (expense: Expense, fundId?: string) => Promise<void>;
  onDeleteExpense: (expense: Expense) => Promise<void>;
  onCreateExpense: (expense: Expense) => Promise<void>;
  onUpdateExpense: (original: Expense, updated: Expense) => Promise<void>;
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
  { value: "SALARY_ADVANCE", label: "Avance sur salaire" },
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
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const panelClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const subPanelClass = "rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm";
const softButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
const employeeLabel = (employee: Employee) => `${employee.last_name} ${employee.first_name} · ${employee.position} · ${employee.code || employee.id}`;

export default function ExpensesView({ expenses, employees, stores, currentUser, canCreate, canCreateSalaryAdvance, dataReady = true, loadError, onRetry, treasuryFunds = [], treasuryReady = false, onPayExpense, onCancelExpense, onCreateExpense, onUpdateExpense, onValidateExpense, onDeleteExpense }: ExpensesViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("RENT");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(dateInputValue(Date.now()));
  const [storeId, setStoreId] = useState(() => {
    const defaultStore = stores.find(store => store.is_active && (["ADMIN", "SUPER_ADMIN"].includes(currentUser.roleId) || currentUser.storeIds.includes(store.id)));
    return defaultStore?.id ?? "";
  });
  const [payee, setPayee] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<Expense["payment_status"]>("PAID");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "VALIDATED" | "CANCELLED">("ALL");
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentExpense, setPaymentExpense] = useState<{ expense: Expense; action: "validate" | "pay" } | null>(null);
  const [fundId, setFundId] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(currentUser.roleId);
  const ownFunds = treasuryFunds.filter(fund => fund.owner_id === currentUser.uid && fund.balance > 0);
  const openPayment = (expense: Expense, action: "validate" | "pay") => {
    setFundId(expense.store_id ? STORE_EXPENSE_FUNDS : ""); setPaymentError(""); setPaymentExpense({ expense, action });
  };
  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentExpense || busyId || (fundId !== STORE_EXPENSE_FUNDS && !treasuryReady)) return;
    const selectedFund = ownFunds.find(fund => fund.id === fundId);
    if (fundId !== STORE_EXPENSE_FUNDS && (!selectedFund || selectedFund.balance < paymentExpense.expense.amount)) {
      setPaymentError("Choisissez un fonds personnel disposant du montant nécessaire."); return;
    }
    setBusyId(paymentExpense.expense.id); setPaymentError("");
    try {
      if (paymentExpense.action === "validate") await onValidateExpense(paymentExpense.expense, fundId);
      else {
        if (!onPayExpense) throw new Error("Le règlement n'est pas disponible dans cet écran.");
        await onPayExpense(paymentExpense.expense, fundId);
      }
      setPaymentExpense(null);
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement."); }
    finally { setBusyId(null); }
  };
  const canValidate = canCreate;
  const canDelete = currentUser.roleId === "SUPER_ADMIN";
  const canUseGlobalExpense = isAdmin;
  const selectableStores = stores.filter(store => store.is_active && (["ADMIN", "SUPER_ADMIN"].includes(currentUser.roleId) || currentUser.storeIds.includes(store.id)));
  const canEditExpense = (expense: Expense) => canCreate && expense.status === "DRAFT"
    && expense.created_by === currentUser.uid
    && (isAdmin || Boolean(expense.store_id && currentUser.storeIds.includes(expense.store_id)))
    && (expense.category !== "SALARY_ADVANCE" || canCreateSalaryAdvance);
  const isSalaryAdvance = category === "SALARY_ADVANCE";
  const selectedEmployee = employees.find(employee => employee.id === employeeId);
  const categoryOptions = CATEGORIES.filter(item => item.value !== "SALARY_ADVANCE" || canCreateSalaryAdvance);
  const openCreateForm = () => {
    const defaultStoreId = selectableStores[0]?.id ?? "";
    setEditingExpense(null);
    setCategory("RENT");
    setDescription("");
    setAmount("");
    setExpenseDate(dateInputValue(Date.now()));
    setStoreId(defaultStoreId);
    setPayee("");
    setEmployeeId("");
    setEmployeeQuery("");
    setPaymentMethod("CASH");
    setPaymentStatus("PAID");
    setReference("");
    setNotes("");
    setFormError("");
    setIsFormOpen(true);
  };
  const openEditForm = (expense: Expense) => {
    if (!canEditExpense(expense)) return;
    setEditingExpense(expense);
    setCategory(expense.category);
    setDescription(expense.description);
    setAmount(String(expense.amount));
    setExpenseDate(dateInputValue(expense.expense_date));
    setStoreId(expense.store_id || "");
    setPayee(expense.payee || "");
    setEmployeeId(expense.employee_id || "");
    const employee = employees.find(item => item.id === expense.employee_id);
    setEmployeeQuery(employee ? employeeLabel(employee) : "");
    setPaymentMethod(expense.payment_method);
    setPaymentStatus(expense.payment_status);
    setReference(expense.reference || "");
    setNotes(expense.notes || "");
    setFormError("");
    setIsFormOpen(true);
  };
  const runAction = async (expense: Expense, action: "validate" | "delete") => {
    if (action === "validate" && isAdmin && expense.payment_status === "PAID") { openPayment(expense, "validate"); return; }
    if (action === "delete" && !window.confirm("Supprimer la dépense " + expense.expense_number + " ?")) return;
    setBusyId(expense.id);
    setActionError("");
    try { await (action === "validate" ? onValidateExpense(expense) : onDeleteExpense(expense)); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Impossible de réaliser cette opération."); }
    finally { setBusyId(null); }
  };
  const visibleExpenses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
    return expenses.filter(expense => {
      const date = new Date(expense.expense_date);
      const matchesMonth = !monthFilter || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === monthFilter;
      const matchesStatus = statusFilter === "ALL" || (expense.status || "VALIDATED") === statusFilter;
      const searchableText = [expense.expense_number, expense.description, expense.payee, expense.employee_name, expense.store_name, expense.reference, categoryLabel(expense.category)]
        .filter(Boolean).join(" ").toLocaleLowerCase("fr-FR");
      return matchesMonth && matchesStatus && (!normalizedSearch || searchableText.includes(normalizedSearch));
    }).sort((left, right) => right.expense_date - left.expense_date || right.created_at - left.created_at);
  }, [expenses, monthFilter, search, statusFilter]);

  const currentMonthExpenses = expenses.filter(expense => {
    if (expense.status === "DRAFT" || expense.status === "CANCELLED") return false;
    const date = new Date(expense.expense_date);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const monthTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pendingTotal = expenses.filter(expense => expense.status !== "DRAFT" && expense.status !== "CANCELLED" && expense.payment_status === "PENDING").reduce((sum, expense) => sum + expense.amount, 0);
  const draftCount = expenses.filter(expense => expense.status === "DRAFT").length;
  const cancelledCount = expenses.filter(expense => expense.status === "CANCELLED").length;
  const hasFilters = Boolean(search || monthFilter || statusFilter !== "ALL");
  const resetFilters = () => { setSearch(""); setMonthFilter(""); setStatusFilter("ALL"); };
  const validationBadge = (expense: Expense) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${expense.status === "CANCELLED" ? "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200" : expense.status === "DRAFT" ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"}`}>
      {expense.status === "DRAFT" ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {expense.status === "CANCELLED" ? "Annulée" : expense.status === "DRAFT" ? "Brouillon" : "Validée"}
    </span>
  );
  const expenseActions = (expense: Expense) => (
    <div className="flex flex-wrap items-center gap-2">
      {canEditExpense(expense) && <button type="button" disabled={busyId !== null} onClick={() => openEditForm(expense)} className={`${softButtonClass} gap-1.5`}><Pencil className="h-3 w-3" /> Modifier</button>}
      {canValidate && (canDelete || canEditExpense(expense)) && expense.status === "DRAFT" && <button type="button" disabled={busyId !== null} onClick={() => runAction(expense, "validate")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{busyId === expense.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Valider</button>}
      {isAdmin && onPayExpense && expense.status === "VALIDATED" && expense.payment_status === "PENDING" && <button type="button" disabled={busyId !== null} onClick={() => openPayment(expense, "pay")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">Régler</button>}
      {isAdmin && onCancelExpense && expense.status !== "CANCELLED" && <button type="button" disabled={busyId !== null} onClick={() => { setCancelTarget(expense); setCancelReason(""); setCancelError(""); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50">Annuler la dépense</button>}
      {canDelete && (expense.status === "DRAFT" || expense.status === "CANCELLED") && <button type="button" aria-label={`Supprimer ${expense.expense_number}`} title="Supprimer la dépense" disabled={busyId !== null} onClick={() => runAction(expense, "delete")} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  );

  const handleCreateExpense = async (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    const selectedStore = stores.find(store => store.id === storeId);
    if (isSalaryAdvance && (!canCreateSalaryAdvance || !selectedEmployee || !selectedEmployee.is_active)) {
      setFormError("Seul un administrateur peut enregistrer une avance pour un employé actif.");
      return;
    }
    if (isSalaryAdvance && !description.trim()) {
      setFormError("Indiquez le motif de l'avance sur salaire.");
      return;
    }
    if ((!selectedStore && !canUseGlobalExpense) || (selectedStore && !isAdmin && !currentUser.storeIds.includes(selectedStore.id))) {
      setFormError("Sélectionnez un magasin qui est attribué à votre compte.");
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !expenseDate) {
      setFormError("Renseignez un montant positif et une date valide.");
      return;
    }

    const timestamp = Date.now();
    const expenseId = editingExpense?.id || `expense-${crypto.randomUUID()}`;
    const expense: Expense = {
      ...editingExpense,
      status: "DRAFT",
      id: expenseId,
      expense_number: editingExpense?.expense_number || `DEP-${new Date(timestamp).getFullYear()}-${String(timestamp).slice(-6)}`,
      category,
      description: description.trim(),
      amount: numericAmount,
      expense_date: new Date(`${expenseDate}T12:00:00`).getTime(),
      store_id: selectedStore?.id,
      store_name: selectedStore?.name,
      payee: isSalaryAdvance ? `${selectedEmployee!.first_name} ${selectedEmployee!.last_name}` : payee.trim() || undefined,
      employee_id: isSalaryAdvance ? selectedEmployee?.id : undefined,
      employee_name: isSalaryAdvance && selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : undefined,
      salary_advance_id: isSalaryAdvance ? `advance-${expenseId}` : undefined,
      payment_method: paymentMethod,
      payment_status: isSalaryAdvance ? "PAID" : paymentStatus,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      created_by: editingExpense?.created_by || currentUser.uid,
      created_by_name: editingExpense?.created_by_name || currentUser.displayName || currentUser.email,
      created_at: editingExpense?.created_at || timestamp
    };

    setIsSaving(true);
    setFormError("");
    try {
      if (editingExpense) await onUpdateExpense(editingExpense, expense);
      else await onCreateExpense(expense);
      setDescription("");
      setAmount("");
      setPayee("");
      setEmployeeId("");
      setReference("");
      setNotes("");
      setPaymentStatus("PAID");
      setExpenseDate(dateInputValue(Date.now()));
      setEditingExpense(null);
      setIsFormOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer cette dépense.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!dataReady) return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-emerald-100 p-3 text-emerald-700"><HandCoins className="h-5 w-5" /></span>
        <h2 className="text-lg font-black text-slate-900">Dépenses & frais</h2>
      </div>
      <div className="mt-6 flex flex-col items-center rounded-2xl bg-slate-50 px-4 py-8 text-center">
        {loadError ? <AlertCircle className="h-7 w-7 text-amber-600" /> : <LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" />}
        <p role={loadError ? "alert" : "status"} className="mt-3 max-w-lg text-sm text-slate-600">{loadError || "Chargement des dépenses depuis le serveur…"}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" /> Réessayer</button>}
      </div>
    </section>
  );

  return (
    <div className="space-y-5 text-slate-900">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-700 p-5 text-white shadow-lg shadow-emerald-900/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15"><HandCoins className="h-5 w-5" /></span>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-50/90 ring-1 ring-white/15">
                <ReceiptText className="h-3.5 w-3.5" />
                Gestion des frais
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Dépenses & frais</h2>
              <p className="mt-1 text-sm text-emerald-50/90">Gardez une vue claire sur vos charges et vos paiements.</p>
            </div>
          </div>
          {canCreate && <button type="button" onClick={openCreateForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 shadow-md shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"><Plus className="h-4 w-4" /> Nouvelle dépense</button>}
        </div>
      </header>

      {actionError && <p role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{actionError}</p>}

      <section aria-label="Vue d’ensemble des dépenses" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 shadow-sm ring-1 ring-emerald-200/60">
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-700">Dépenses du mois</p><span className="rounded-xl bg-emerald-600/10 p-2 text-emerald-700"><CircleDollarSign className="h-4 w-4" /></span></div>
          <p className="mt-3 break-words text-2xl font-black tabular-nums tracking-tight text-emerald-900">{money(monthTotal)}</p>
          <p className="mt-2 text-[11px] text-emerald-700">Validées · {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
        </article>
        <article className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 shadow-sm ring-1 ring-amber-200/60">
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-700">Reste à payer</p><span className="rounded-xl bg-amber-100 p-2 text-amber-700"><Clock3 className="h-4 w-4" /></span></div>
          <p className="mt-3 break-words text-2xl font-black tabular-nums tracking-tight text-amber-900">{money(pendingTotal)}</p>
          <p className="mt-2 text-[11px] text-amber-700">Dépenses validées · toutes périodes</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Brouillons</p><span className="rounded-xl bg-slate-100 p-2 text-slate-600"><Pencil className="h-4 w-4" /></span></div>
          <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-slate-900">{draftCount}</p>
          <p className="mt-2 text-[11px] text-slate-500">En attente de validation</p>
        </article>
        <article className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-50 p-4 shadow-sm ring-1 ring-cyan-200/60">
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-cyan-700">Opérations</p><span className="rounded-xl bg-cyan-100 p-2 text-cyan-700"><ReceiptText className="h-4 w-4" /></span></div>
          <p className="mt-3 text-2xl font-black tabular-nums tracking-tight text-cyan-900">{expenses.length}</p>
          <p className="mt-2 text-[11px] text-cyan-700">Dans votre périmètre d’accès</p>
        </article>
      </section>

      <section className={`overflow-hidden ${panelClass}`}>
        <div className="space-y-4 border-b border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-slate-600" /><h3 className="text-sm font-bold text-slate-900">Historique des dépenses</h3><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">{visibleExpenses.length}</span></div>
            {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-slate-700"><RotateCcw className="h-3 w-3" /> Réinitialiser</button>}
          </div>
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div role="group" aria-label="Filtrer par statut" className="flex w-fit flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {([{ id: "ALL", label: "Toutes", count: expenses.length }, { id: "DRAFT", label: "Brouillons", count: draftCount }, { id: "VALIDATED", label: "Validées", count: expenses.length - draftCount - cancelledCount }, { id: "CANCELLED", label: "Annulées", count: cancelledCount }] as const).map(item => (
                <button key={item.id} type="button" aria-pressed={statusFilter === item.id} onClick={() => setStatusFilter(item.id)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === item.id ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item.label}<span className="ml-1.5 opacity-80">{item.count}</span></button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Rechercher une dépense" value={search} onChange={event => setSearch(event.target.value)} placeholder="Motif, référence, bénéficiaire…" className={`${inputClass} pl-9 sm:w-64`} /></label>
              <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Filtrer par mois" type="month" value={monthFilter} onChange={event => setMonthFilter(event.target.value)} className={`${inputClass} pl-9 sm:w-44`} /></label>
            </div>
          </div>
        </div>

        {visibleExpenses.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-16 text-center"><span className="rounded-2xl bg-emerald-50 p-4 text-emerald-500"><ReceiptText className="h-7 w-7" /></span><p className="mt-4 text-sm font-bold text-slate-800">{hasFilters ? "Aucune dépense ne correspond à vos filtres" : "Votre historique commence ici"}</p><p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">{hasFilters ? "Essayez un autre mois, un autre statut ou un autre mot-clé." : "Retrouvez vos loyers, factures, avances et autres frais au même endroit."}</p>{hasFilters && <button type="button" onClick={resetFilters} className="mt-4 text-xs font-bold text-emerald-700 hover:underline">Afficher toutes les dépenses</button>}</div>
        ) : (
          <>
            <div className="space-y-3 bg-slate-50/80 p-3 sm:p-5">
              <p className="text-xs text-slate-500">Sélectionnez une dépense pour afficher ses détails.</p>
              {visibleExpenses.map(expense => (
                <details key={expense.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 open:border-slate-300 open:bg-slate-50/50">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 sm:p-5 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="break-words text-sm font-bold text-slate-900">{expense.description || categoryLabel(expense.category)}</p>
                      <p className="mt-1 break-words text-[11px] text-slate-500">{expense.expense_number} · {dateLabel(expense.expense_date)}</p>
                      <p className="mt-1 break-words text-[11px] text-slate-500">{categoryLabel(expense.category)} · {expense.store_name || "Tous magasins"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">{validationBadge(expense)}<span className={expense.payment_status === "PAID" ? "text-[11px] font-semibold text-emerald-700" : "text-[11px] font-semibold text-amber-700"}>{expense.status === "CANCELLED" ? "Paiement annulé" : expense.payment_status === "PAID" ? "Payée" : "À payer"}</span></div>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="break-words text-base font-black tabular-nums text-slate-900">{money(expense.amount)}</p>
                      <span className="mt-2 block text-[11px] font-bold text-slate-600"><span className="group-open:hidden">Voir les détails +</span><span className="hidden group-open:inline">Masquer les détails −</span></span>
                    </div>
                  </summary>
                  <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                    <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Détails de la dépense</h4>
                    <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        ["Numéro", expense.expense_number],
                        ["Date de la dépense", dateLabel(expense.expense_date)],
                        ["Catégorie", categoryLabel(expense.category)],
                        ["Montant", money(expense.amount)],
                        ["Magasin", expense.store_name || "Tous magasins / siège"],
                        ["Bénéficiaire / fournisseur", expense.payee || expense.employee_name || "Non renseigné"],
                        ["Employé bénéficiaire", expense.employee_name || "Non renseigné"],
                        ["Mode de paiement", PAYMENT_METHODS.find(method => method.value === expense.payment_method)?.label || expense.payment_method],
                        ["Statut du paiement", expense.status === "CANCELLED" ? "Annulé" : expense.payment_status === "PAID" ? "Payée" : "À payer"],
                        ["N° facture / référence", expense.reference || "Sans référence"],
                        ["Créée par", expense.created_by_name || "Non renseigné"],
                        ...(expense.status === "CANCELLED" ? [["Annulée par", expense.cancelled_by_name || "Non renseigné"], ["Motif de l'annulation", expense.cancellation_reason || ""], ["Date d'annulation", expense.cancelled_at ? new Date(expense.cancelled_at).toLocaleString("fr-FR") : ""], ["Remboursement au fonds d'origine", expense.treasury_reversal_id ? "Effectué" : "Aucun paiement de trésorerie à recréditer"]] : []),
                        ["Payée par", expense.paid_by_name || (expense.payment_status === "PAID" && expense.status !== "DRAFT" ? "Non renseigné (ancien suivi / caisse magasin)" : "À déterminer au règlement")],
                        ["Fonds utilisé", expense.funding_source === "STORE" ? `Fonds du magasin · ${expense.paid_by_name || expense.store_name || ""}` : treasuryFunds.find(fund => fund.id === expense.treasury_fund_id)?.source_reference || (expense.treasury_fund_id ? "Fonds de trésorerie" : "Non renseigné")],
                        ...(expense.paid_at ? [["Date du règlement", new Date(expense.paid_at).toLocaleString("fr-FR")]] : []),
                        ["Date de création", new Date(expense.created_at).toLocaleString("fr-FR")],
                        ...(expense.validated_at ? [["Date de validation", new Date(expense.validated_at).toLocaleString("fr-FR")]] : [])
                      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium text-slate-900">{value}</dd></div>)}
                      <div className="min-w-0 sm:col-span-2 xl:col-span-3"><dt className="text-xs text-slate-500">Motif / description</dt><dd className="mt-1 whitespace-pre-wrap break-words">{expense.description || "Non renseigné"}</dd></div>
                      <div className="min-w-0 sm:col-span-2 xl:col-span-3"><dt className="text-xs text-slate-500">Notes</dt><dd className="mt-1 whitespace-pre-wrap break-words">{expense.notes || "Aucune note"}</dd></div>
                    </dl>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">{validationBadge(expense)}{expenseActions(expense)}</div>
                  </div>
                </details>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500"><span>{visibleExpenses.length} dépense{visibleExpenses.length > 1 ? "s" : ""} affichée{visibleExpenses.length > 1 ? "s" : ""} sur {expenses.length}</span><span>Les brouillons sont exclus des montants du tableau de bord.</span></div>
          </>
        )}
      </section>

      {cancelTarget && onCancelExpense && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><form role="dialog" aria-modal="true" aria-labelledby="expense-cancel-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-slate-900" onSubmit={async event => {
        event.preventDefault(); if (busyId || !cancelReason.trim()) return;
        setBusyId(cancelTarget.id); setCancelError("");
        try { await onCancelExpense(cancelTarget, cancelReason.trim()); setCancelTarget(null); }
        catch (error) { setCancelError(error instanceof Error ? error.message : "Annulation impossible."); }
        finally { setBusyId(null); }
      }}>
        <h3 id="expense-cancel-title" className="font-bold">Annuler {cancelTarget.expense_number}</h3>
        <p className="text-sm">La dépense sera exclue des totaux. Son historique restera consultable.</p>
        {cancelTarget.treasury_movement_id && <label className="flex items-start gap-2 rounded bg-amber-50 p-3 text-sm"><input required type="checkbox" />Je confirme que les {money(cancelTarget.amount)} ont été récupérés. Ils seront recrédités au fonds du payeur d'origine.</label>}
        <label className="block text-sm font-semibold">Motif de l'annulation<textarea required value={cancelReason} onChange={event => setCancelReason(event.target.value)} className={inputClass} /></label>
        {cancelError && <p role="alert" className="text-sm text-rose-700">{cancelError}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busyId !== null} onClick={() => setCancelTarget(null)} className="rounded border px-3 py-2">Fermer</button><button disabled={busyId !== null || !cancelReason.trim()} className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-50">{busyId ? "Annulation…" : "Confirmer l'annulation"}</button></div>
      </form></div>}
      {paymentExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <form onSubmit={submitPayment} role="dialog" aria-modal="true" aria-labelledby="expense-payment-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
            <h3 id="expense-payment-title" className="font-bold">{paymentExpense.action === "validate" ? "Valider et régler la dépense" : "Régler la dépense"}</h3>
            <p>{paymentExpense.expense.expense_number} · <strong>{money(paymentExpense.expense.amount)}</strong></p>
            <p className="text-sm text-slate-600">Charge : {paymentExpense.expense.store_name || "Tous magasins / siège"}. Le déclarant et la source du paiement sont distincts.</p>
            <label className="block text-sm font-semibold">Prise en charge<select required disabled={busyId !== null} className={inputClass} value={fundId} onChange={event => setFundId(event.target.value)}><option value="">Choisir la source du paiement</option>{paymentExpense.expense.store_id && <option value={STORE_EXPENSE_FUNDS}>Fonds du magasin · {paymentExpense.expense.store_name || paymentExpense.expense.store_id}</option>}<optgroup label={`Fonds personnels · ${currentUser.displayName}`}>{ownFunds.map(fund => <option disabled={!treasuryReady} key={fund.id} value={fund.id}>{fund.source_reference} · {money(fund.balance)}</option>)}</optgroup></select></label>
            <p className="text-xs text-slate-500">{fundId === STORE_EXPENSE_FUNDS ? "Le magasin prend en charge le paiement. Aucun fonds personnel ne sera débité. Un paiement en espèces est pris en compte dans la clôture de sa caisse POS." : "Le fonds personnel choisi sera débité une seule fois. Si nécessaire, enregistrez une réception ou recevez un transfert dans la trésorerie."}</p>
            {paymentError && <p role="alert" className="text-sm text-rose-700">{paymentError}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={busyId !== null} onClick={() => setPaymentExpense(null)} className="rounded border px-3 py-2">Annuler</button><button disabled={(fundId !== STORE_EXPENSE_FUNDS && !treasuryReady) || !fundId || busyId !== null} className="rounded bg-emerald-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{busyId ? "Enregistrement…" : "Confirmer le règlement"}</button></div>
          </form>
        </div>
      )}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIsFormOpen(false); }}>
          <form onSubmit={handleCreateExpense} className="my-auto w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-bold text-slate-900">{editingExpense ? "Modifier le brouillon de dépense" : "Nouvelle dépense"}</h3><p className="mt-1 text-xs text-slate-500">La dépense sera enregistrée en brouillon et prise en compte après votre validation.</p></div><button type="button" onClick={() => setIsFormOpen(false)} aria-label="Fermer" className="rounded-md px-2 py-1 text-lg text-slate-500 hover:bg-slate-100">×</button></div>
            {isAdmin && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">Le magasin indique à qui la charge est affectée. À la validation, choisissez une prise en charge par le magasin ou par un fonds personnel. Aucun débit n'est effectué pendant la saisie du brouillon.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-700">Catégorie<select value={category} onChange={event => {
                const next = event.target.value as ExpenseCategory;
                setPayee("");
                setEmployeeId("");
                setEmployeeQuery("");
                setCategory(next);
                if (next === "SALARY_ADVANCE") {
                  setPaymentStatus("PAID");
                }
              }} className={inputClass}>{categoryOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Montant (Ar)<input required type="number" min="1" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">Motif / description{isSalaryAdvance ? " *" : " (facultatif)"}<input required={isSalaryAdvance} value={description} onChange={event => setDescription(event.target.value)} placeholder={isSalaryAdvance ? "Ex. avance pour frais médicaux" : "Facultatif"} className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Date<input required type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Magasin<select required={!canUseGlobalExpense} value={storeId} onChange={event => setStoreId(event.target.value)} className={inputClass}>{canUseGlobalExpense ? <option value="">Tous magasins / siège</option> : <option value="">Sélectionner un magasin</option>}{stores.filter(store => store.is_active && (["ADMIN", "SUPER_ADMIN"].includes(currentUser.roleId) || currentUser.storeIds.includes(store.id))).map(store => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select></label>
              {isSalaryAdvance ? (
                <label className="space-y-1 text-xs font-semibold text-slate-700">Employé bénéficiaire
                  <input required list="expense-employee-options" value={employeeQuery} onFocus={event => event.target.select()} onChange={event => {
                    const query = event.target.value;
                    setEmployeeQuery(query);
                    const employee = employees.find(item => item.is_active && employeeLabel(item) === query);
                    setEmployeeId(employee?.id || "");
                  }} placeholder="Saisir un nom, prénom ou matricule…" autoComplete="off" className={inputClass} aria-describedby="expense-employee-help" />
                  <datalist id="expense-employee-options">
                    {employees.filter(employee => employee.is_active).sort((a, b) => employeeLabel(a).localeCompare(employeeLabel(b), "fr-FR")).map(employee => <option key={employee.id} value={employeeLabel(employee)} />)}
                  </datalist>
                  <span id="expense-employee-help" className="block text-[11px] font-normal text-slate-500">Tapez puis sélectionnez un employé dans les suggestions.</span>
                </label>
              ) : (
                <label className="space-y-1 text-xs font-semibold text-slate-700">Bénéficiaire / fournisseur<input value={payee} onChange={event => setPayee(event.target.value)} placeholder="Nom du bailleur ou prestataire" className={inputClass} /></label>
              )}
              <label className="space-y-1 text-xs font-semibold text-slate-700">Mode de paiement<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)} className={inputClass}>{PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Statut du paiement<select disabled={isSalaryAdvance} value={isSalaryAdvance ? "PAID" : paymentStatus} onChange={event => setPaymentStatus(event.target.value as Expense["payment_status"])} className={inputClass}><option value="PAID">Payée</option><option value="PENDING">À payer</option></select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">N° facture / référence<input value={reference} onChange={event => setReference(event.target.value)} placeholder="Référence du justificatif" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">Notes<textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Détails complémentaires" className={inputClass} /></label>
            </div>
            {formError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Annuler</button><button disabled={isSaving} type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{isSaving ? "Enregistrement..." : editingExpense ? "Enregistrer les modifications" : "Enregistrer le brouillon"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
