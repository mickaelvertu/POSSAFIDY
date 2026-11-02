import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, Building2, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, Clock3, HandCoins, LoaderCircle, Pencil, Plus, ReceiptText, RotateCcw, Search, Trash2 } from "lucide-react";
import { Employee, Expense, ExpenseCategory, PaymentMethod, Store, UserProfile } from "../types";

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
  onValidateExpense: (expense: Expense) => Promise<void>;
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
const employeeLabel = (employee: Employee) => `${employee.last_name} ${employee.first_name} · ${employee.position} · ${employee.code || employee.id}`;

export default function ExpensesView({ expenses, employees, stores, currentUser, canCreate, canCreateSalaryAdvance, dataReady = true, loadError, onRetry, onCreateExpense, onUpdateExpense, onValidateExpense, onDeleteExpense }: ExpensesViewProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("RENT");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(dateInputValue(Date.now()));
  const [storeId, setStoreId] = useState("");
  const [payee, setPayee] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<Expense["payment_status"]>("PAID");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "VALIDATED">("ALL");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const canValidate = canCreate;
  const canDelete = currentUser.roleId === "SUPER_ADMIN";
  const canEditExpense = (expense: Expense) => canCreate && expense.status === "DRAFT"
    && expense.created_by === currentUser.uid
    && (canDelete || Boolean(expense.store_id && currentUser.storeIds.includes(expense.store_id)))
    && (expense.category !== "SALARY_ADVANCE" || canCreateSalaryAdvance);
  const isSalaryAdvance = category === "SALARY_ADVANCE";
  const selectedEmployee = employees.find(employee => employee.id === employeeId);
  const categoryOptions = CATEGORIES.filter(item => item.value !== "SALARY_ADVANCE" || canCreateSalaryAdvance);
  const openCreateForm = () => {
    setEditingExpense(null);
    setCategory("RENT");
    setDescription("");
    setAmount("");
    setExpenseDate(dateInputValue(Date.now()));
    setStoreId("");
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
    if (action === "delete" && !window.confirm("Supprimer la dépense " + expense.expense_number + " ?")) return;
    setBusyId(expense.id);
    setActionError("");
    try { await (action === "validate" ? onValidateExpense(expense) : onDeleteExpense(expense)); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Impossible de réaliser cette opération."); }
    finally { setBusyId(null); }
  };
  const canUseGlobalExpense = currentUser.roleId === "SUPER_ADMIN";

  const visibleExpenses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr-FR");
    return expenses.filter(expense => {
      const date = new Date(expense.expense_date);
      const matchesMonth = !monthFilter || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` === monthFilter;
      const matchesStatus = statusFilter === "ALL" || (statusFilter === "DRAFT" ? expense.status === "DRAFT" : expense.status !== "DRAFT");
      const searchableText = [expense.expense_number, expense.description, expense.payee, expense.employee_name, expense.store_name, expense.reference, categoryLabel(expense.category)]
        .filter(Boolean).join(" ").toLocaleLowerCase("fr-FR");
      return matchesMonth && matchesStatus && (!normalizedSearch || searchableText.includes(normalizedSearch));
    }).sort((left, right) => right.expense_date - left.expense_date || right.created_at - left.created_at);
  }, [expenses, monthFilter, search, statusFilter]);

  const currentMonthExpenses = expenses.filter(expense => {
    if (expense.status === "DRAFT") return false;
    const date = new Date(expense.expense_date);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const monthTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pendingTotal = expenses.filter(expense => expense.status !== "DRAFT" && expense.payment_status === "PENDING").reduce((sum, expense) => sum + expense.amount, 0);
  const draftCount = expenses.filter(expense => expense.status === "DRAFT").length;
  const hasFilters = Boolean(search || monthFilter || statusFilter !== "ALL");
  const resetFilters = () => { setSearch(""); setMonthFilter(""); setStatusFilter("ALL"); };
  const validationBadge = (expense: Expense) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${expense.status === "DRAFT" ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"}`}>
      {expense.status === "DRAFT" ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {expense.status === "DRAFT" ? "Brouillon" : "Validée"}
    </span>
  );
  const expenseActions = (expense: Expense) => (
    <div className="flex flex-wrap items-center gap-2">
      {canEditExpense(expense) && <button type="button" disabled={busyId !== null} onClick={() => openEditForm(expense)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3 w-3" /> Modifier</button>}
      {canValidate && (canDelete || canEditExpense(expense)) && expense.status === "DRAFT" && <button type="button" disabled={busyId !== null} onClick={() => runAction(expense, "validate")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">{busyId === expense.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Valider</button>}
      {canDelete && <button type="button" aria-label={`Supprimer ${expense.expense_number}`} title="Supprimer la dépense" disabled={busyId !== null} onClick={() => runAction(expense, "delete")} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>}
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
    if (!canUseGlobalExpense && (!selectedStore || !currentUser.storeIds.includes(selectedStore.id))) {
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><HandCoins className="h-5 w-5" /></span>
        <h2 className="font-serif text-lg font-bold text-slate-900">Dépenses & frais</h2>
      </div>
      <div className="mt-6 flex flex-col items-center rounded-xl bg-slate-50 px-4 py-8 text-center">
        {loadError ? <AlertCircle className="h-7 w-7 text-amber-600" /> : <LoaderCircle className="h-7 w-7 animate-spin text-emerald-600" />}
        <p role={loadError ? "alert" : "status"} className="mt-3 max-w-lg text-sm text-slate-600">{loadError || "Chargement des dépenses depuis le serveur…"}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" /> Réessayer</button>}
      </div>
    </section>
  );

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><HandCoins className="h-5 w-5" /></span>
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900">Dépenses & frais</h2>
            <p className="mt-1 text-xs text-slate-500">Gardez une vue claire sur vos charges et vos paiements.</p>
          </div>
        </div>
        {canCreate && <button type="button" onClick={openCreateForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"><Plus className="h-4 w-4" /> Nouvelle dépense</button>}
      </header>

      {actionError && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{actionError}</p>}

      <section aria-label="Vue d’ensemble des dépenses" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl bg-emerald-950 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-emerald-100">Dépenses du mois</p><span className="rounded-lg bg-white/10 p-2"><CircleDollarSign className="h-4 w-4 text-emerald-300" /></span></div>
          <p className="mt-4 break-words text-2xl font-black tabular-nums tracking-tight">{money(monthTotal)}</p>
          <p className="mt-2 text-[11px] text-emerald-200">Validées · {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Reste à payer</p><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><Clock3 className="h-4 w-4" /></span></div>
          <p className="mt-4 break-words text-2xl font-black tabular-nums tracking-tight text-amber-700">{money(pendingTotal)}</p>
          <p className="mt-2 text-[11px] text-slate-400">Dépenses validées · toutes périodes</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Brouillons</p><span className="rounded-lg bg-slate-100 p-2 text-slate-500"><Pencil className="h-4 w-4" /></span></div>
          <p className="mt-4 text-2xl font-black tabular-nums tracking-tight">{draftCount}</p>
          <p className="mt-2 text-[11px] text-slate-400">En attente de validation</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Opérations enregistrées</p><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><ReceiptText className="h-4 w-4" /></span></div>
          <p className="mt-4 text-2xl font-black tabular-nums tracking-tight">{expenses.length}</p>
          <p className="mt-2 text-[11px] text-slate-400">Dans votre périmètre d’accès</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-emerald-600" /><h3 className="text-sm font-bold">Historique des dépenses</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{visibleExpenses.length}</span></div>
            {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700"><RotateCcw className="h-3 w-3" /> Réinitialiser les filtres</button>}
          </div>
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div role="group" aria-label="Filtrer par statut" className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
              {([{ id: "ALL", label: "Toutes", count: expenses.length }, { id: "DRAFT", label: "Brouillons", count: draftCount }, { id: "VALIDATED", label: "Validées", count: expenses.length - draftCount }] as const).map(item => (
                <button key={item.id} type="button" aria-pressed={statusFilter === item.id} onClick={() => setStatusFilter(item.id)} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${statusFilter === item.id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{item.label}<span className="ml-1.5 opacity-60">{item.count}</span></button>
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
            <div className="divide-y divide-slate-100 md:hidden">
              {visibleExpenses.map(expense => (
                <article key={expense.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold">{expense.description || categoryLabel(expense.category)}</p><p className="mt-1 text-[10px] font-mono text-slate-400">{expense.expense_number}</p></div>{validationBadge(expense)}</div>
                  <div className="flex items-end justify-between gap-3"><div className="space-y-1 text-xs text-slate-500"><p>{dateLabel(expense.expense_date)} · {categoryLabel(expense.category)}</p><p className="flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0" />{expense.store_name || "Tous magasins"}</p><p>{expense.payee || "Bénéficiaire non renseigné"}</p></div><p className="shrink-0 text-sm font-black tabular-nums">{money(expense.amount)}</p></div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><p className={`text-[11px] font-semibold ${expense.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"}`}>{expense.payment_status === "PAID" ? "Payée" : "À payer"} · {PAYMENT_METHODS.find(method => method.value === expense.payment_method)?.label || expense.payment_method}</p>{expenseActions(expense)}</div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400"><tr>{["Dépense", "Date / Magasin", "Bénéficiaire", "Paiement", "Montant", "Validation / Actions"].map(label => <th key={label} scope="col" className={`px-5 py-3.5 font-bold ${label === "Montant" ? "text-right" : ""}`}>{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleExpenses.map(expense => (
                    <tr key={expense.id} className="transition hover:bg-emerald-50/30">
                      <td className="max-w-72 px-5 py-4"><p className="break-words font-bold text-slate-800">{expense.description || categoryLabel(expense.category)}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{expense.expense_number}</p><span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">{categoryLabel(expense.category)}</span></td>
                      <td className="px-5 py-4"><p className="font-medium text-slate-700">{dateLabel(expense.expense_date)}</p><p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><Building2 className="h-3 w-3 shrink-0" />{expense.store_name || "Tous magasins"}</p></td>
                      <td className="px-5 py-4"><p className="text-slate-700">{expense.payee || "—"}</p><p className="mt-2 text-[10px] text-slate-400">{expense.reference || "Sans référence"}</p></td>
                      <td className="px-5 py-4"><p className="text-slate-600">{PAYMENT_METHODS.find(method => method.value === expense.payment_method)?.label || expense.payment_method}</p><p className={`mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold ${expense.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${expense.payment_status === "PAID" ? "bg-emerald-500" : "bg-amber-500"}`} />{expense.payment_status === "PAID" ? "Payée" : "À payer"}</p></td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-black tabular-nums">{money(expense.amount)}</td>
                      <td className="px-5 py-4">{validationBadge(expense)}<div className="mt-2">{expenseActions(expense)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500"><span>{visibleExpenses.length} dépense{visibleExpenses.length > 1 ? "s" : ""} affichée{visibleExpenses.length > 1 ? "s" : ""} sur {expenses.length}</span><span>Les brouillons sont exclus des montants du tableau de bord.</span></div>
          </>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIsFormOpen(false); }}>
          <form onSubmit={handleCreateExpense} className="my-auto w-full max-w-2xl space-y-4 rounded-xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-bold text-slate-900">{editingExpense ? "Modifier le brouillon de dépense" : "Nouvelle dépense"}</h3><p className="mt-1 text-xs text-slate-500">La dépense sera enregistrée en brouillon et prise en compte après votre validation.</p></div><button type="button" onClick={() => setIsFormOpen(false)} aria-label="Fermer" className="rounded-md px-2 py-1 text-lg text-slate-500 hover:bg-slate-100">×</button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-700">Catégorie<select value={category} onChange={event => { const next = event.target.value as ExpenseCategory; if (category === "SALARY_ADVANCE" && next !== "SALARY_ADVANCE") setPayee(""); setCategory(next); if (next === "SALARY_ADVANCE") setPaymentStatus("PAID"); else { setEmployeeId(""); setEmployeeQuery(""); } }} className={inputClass}>{categoryOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Montant (Ar)<input required type="number" min="1" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700 sm:col-span-2">Motif / description{isSalaryAdvance ? " *" : " (facultatif)"}<input required={isSalaryAdvance} value={description} onChange={event => setDescription(event.target.value)} placeholder={isSalaryAdvance ? "Ex. avance pour frais médicaux" : "Facultatif"} className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Date<input required type="date" value={expenseDate} onChange={event => setExpenseDate(event.target.value)} className={inputClass} /></label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">Magasin<select required={!canUseGlobalExpense} value={storeId} onChange={event => setStoreId(event.target.value)} className={inputClass}>{canUseGlobalExpense ? <option value="">Tous magasins / siège</option> : <option value="">Sélectionner un magasin</option>}{stores.filter(store => store.is_active && (canUseGlobalExpense || currentUser.storeIds.includes(store.id))).map(store => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select></label>
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
