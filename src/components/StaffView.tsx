import { storeLabel } from "../services/storeLabel";
import { FormEvent, useMemo, useState } from "react";
import { Banknote, Eye, Pencil, Plus, Search, UserCheck, UserX, Users, X } from "lucide-react";
import { AppUser, Employee, EmployeeContractType, Expense, SalaryAdvance, Store } from "../types";

interface StaffViewProps {
  users: AppUser[];
  onLinkAccount: (employee: Employee, userId: string) => Promise<void>;
  onOpenUsers: () => void;
  employees: Employee[];
  expenses: Expense[];
  advances: SalaryAdvance[];
  stores: Store[];
  onOpenPayroll: () => void;
  onSaveEmployee: (employee: Employee, isNew: boolean) => Promise<void>;
}

const CONTRACTS: Array<{ value: EmployeeContractType; label: string }> = [
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "TEMPORARY", label: "Intérim" },
  { value: "DAILY", label: "Journalier" },
  { value: "INTERN", label: "Stagiaire" }
];

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const dateInputValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

interface FormState {
  firstName: string;
  lastName: string;
  position: string;
  storeId: string;
  phone: string;
  email: string;
  hireDate: string;
  contractType: EmployeeContractType;
  salary: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  firstName: "", lastName: "", position: "", storeId: "", phone: "", email: "",
  hireDate: dateInputValue(Date.now()), contractType: "CDI", salary: "", notes: ""
});

export default function StaffView({ users, onLinkAccount, onOpenUsers, employees, expenses, advances, stores, onOpenPayroll, onSaveEmployee }: StaffViewProps) {
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [confirmLink, setConfirmLink] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const [importing, setImporting] = useState(false);

  const exportStaff = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(employees, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "personnel.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importStaff = async (file: File) => {
    setImporting(true);
    let count = 0;
    try {
      const rows: unknown = JSON.parse(await file.text());
      if (!Array.isArray(rows) || !rows.length) throw new Error("Fichier vide ou invalide.");
      const ids = new Set<string>();
      const validated: Employee[] = rows.map((row, index) => {
        if (!row || typeof row !== "object" || ![row.id, row.first_name, row.last_name, row.position].every(value => typeof value === "string" && value.trim()) || ids.has(row.id)) throw new Error(`Ligne ${index + 1} : identité invalide ou en double.`);
        ids.add(row.id);
        if (typeof row.is_active !== "boolean" || !Number.isFinite(row.created_at) || (row.salary !== undefined && (typeof row.salary !== "number" || !Number.isFinite(row.salary) || row.salary < 0)) || (row.hire_date !== undefined && !Number.isFinite(row.hire_date))) throw new Error(`Ligne ${index + 1} : salaire ou date invalide.`);
        if (row.contract_type !== undefined && !CONTRACTS.some(contract => contract.value === row.contract_type)) throw new Error(`Ligne ${index + 1} : contrat invalide.`);
        for (const key of ["code", "phone", "email", "notes", "store_id"]) if (row[key] !== undefined && typeof row[key] !== "string") throw new Error(`Ligne ${index + 1} : champ ${key} invalide.`);
        if (row.store_id && !stores.some(store => store.id === row.store_id)) throw new Error(`Ligne ${index + 1} : magasin inconnu.`);
        const existing = employees.find(employee => employee.id === row.id);
        return { ...existing, id: row.id, first_name: row.first_name.trim(), last_name: row.last_name.trim(), position: row.position.trim(), code: row.code, phone: row.phone, email: row.email, notes: row.notes, store_id: row.store_id, salary: row.salary, hire_date: row.hire_date, contract_type: row.contract_type, is_active: existing?.application_status === "PENDING" ? existing.is_active : row.is_active, created_at: existing?.created_at ?? row.created_at, updated_at: Date.now() };
      });
      for (const row of validated) {
        await onSaveEmployee(row, !employees.some(employee => employee.id === row.id));
        count++;
      }
      setTransferMessage(`${count} fiche(s) importée(s).`);
    } catch (error) {
      setTransferMessage(`${count} fiche(s) importée(s). ${error instanceof Error ? error.message : "Import impossible."}`);
    } finally { setImporting(false); }
  };

  const storeName = (id?: string) => stores.find(store => store.id === id)?.name || "Non affecté";
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter(employee =>
      (!employee.linked_archive_id || showInactive) &&
      (showInactive || employee.is_active || employee.application_status === "PENDING") &&
      (!storeFilter || employee.store_id === storeFilter) &&
      (!term || `${employee.first_name} ${employee.last_name} ${employee.position} ${employee.code} ${employee.phone || ""}`.toLowerCase().includes(term))
    );
  }, [employees, search, storeFilter, showInactive]);

  const active = employees.filter(employee => employee.is_active);
  const payroll = active.reduce((total, employee) => total + (employee.salary || 0), 0);
  const profileEmployee = employees.find(employee => employee.id === profileEmployeeId);
  const profileExpenses = expenses.filter(expense => expense.employee_id === profileEmployeeId)
    .sort((left, right) => right.expense_date - left.expense_date);
  const profileAdvances = advances.filter(advance => advance.employee_id === profileEmployeeId)
    .sort((left, right) => right.advance_date - left.advance_date);
  const profileExpenseTotal = profileExpenses
    .filter(expense => expense.status !== "DRAFT")
    .reduce((total, expense) => total + expense.amount, 0);
  const outstandingAdvanceTotal = profileAdvances
    .filter(advance => advance.status === "OUTSTANDING")
    .reduce((total, advance) => total + advance.amount, 0);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setIsFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      firstName: employee.first_name,
      lastName: employee.last_name,
      position: employee.position,
      storeId: employee.store_id || "",
      phone: employee.phone || "",
      email: employee.email || "",
      hireDate: dateInputValue(employee.hire_date || Date.now()),
      contractType: employee.contract_type || "CDI",
      salary: employee.salary !== undefined ? String(employee.salary) : "",
      notes: employee.notes || ""
    });
    setError("");
    setIsFormOpen(true);
  };

  const persist = async (employee: Employee, isNew: boolean) => {
    setIsSaving(true);
    setError("");
    try {
      await onSaveEmployee(employee, isNew);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const salary = form.salary.trim() === "" ? undefined : Number(form.salary);
    if (!form.firstName.trim() || !form.lastName.trim() || !form.position.trim()) {
      setError("Le nom, le prénom et le poste sont obligatoires.");
      return;
    }
    if (salary !== undefined && (!Number.isFinite(salary) || salary < 0)) {
      setError("Le salaire doit être un nombre positif.");
      return;
    }
    const hireDate = new Date(`${form.hireDate}T00:00:00`).getTime();
    if (!Number.isFinite(hireDate)) {
      setError("La date d'embauche est invalide.");
      return;
    }
    const now = Date.now();
    const employee: Employee = {
      ...editing,
      id: editing?.id || `emp-${crypto.randomUUID()}`,
      code: editing?.code || `EMP-${String(employees.length + 1).padStart(4, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      position: form.position.trim(),
      store_id: form.storeId || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      hire_date: hireDate,
      contract_type: form.contractType,
      salary,
      notes: form.notes.trim() || undefined,
      is_active: editing?.is_active ?? true,
      created_at: editing?.created_at || now,
      updated_at: now
    };
    if (await persist(employee, !editing)) setIsFormOpen(false);
  };

  const toggleActive = (employee: Employee) => {
    if (employee.linked_archive_id) { setTransferMessage("Fiche archivée : utilisez la fiche principale pour cet employé."); return; }
    void persist({
      ...employee,
      is_active: !employee.is_active,
      application_status: !employee.is_active && employee.application_status === "PENDING" ? "APPROVED" : employee.application_status,
      updated_at: Date.now()
    }, false);
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-white"><Users className="h-5 w-5 text-emerald-400" />Gestion du personnel</h2>
          <p className="mt-1 text-sm text-slate-400">Fiches des employés, affectations et contrats.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" />Nouvel employé
        </button>
        <button type="button" onClick={onOpenPayroll} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-slate-900 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-slate-800">
          <Banknote className="h-4 w-4" />Fiches de paie
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-white">
        <button type="button" onClick={exportStaff} className="rounded-lg bg-slate-800 px-4 py-2">Exporter JSON</button>
        <label className="rounded-lg bg-slate-800 px-4 py-2">{importing ? "Import en cours…" : "Importer JSON"}<input type="file" accept=".json,application/json" disabled={importing || isSaving} className="ml-3 max-w-48" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importStaff(file); }} /></label>
        <span className="text-slate-400">Import du fichier exporté : les fiches existantes sont mises à jour par identifiant.</span>
      </div>
      {transferMessage && <p role="status" className="text-sm text-white">{transferMessage}</p>}
      <section className="space-y-3 rounded-xl bg-white p-4">
        <h3 className="font-semibold text-slate-900">Lier un employé à un compte de connexion</h3>
        <p className="text-sm text-slate-600">Sélectionnez la fiche à conserver et le compte. Les autres fiches liées à ce compte seront archivées et désactivées. Leur historique restera accessible au compte, sans transfert ni suppression. Le rôle, les magasins et la validation se gèrent dans Utilisateurs.</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Employé à lier" className={inputClass + " sm:w-auto"} value={linkEmployeeId} disabled={linkBusy} onChange={event => { setLinkEmployeeId(event.target.value); setConfirmLink(false); }}>
            <option value="">Choisir un employé</option>
            {employees.filter(employee => !employee.user_id && !employee.linked_archive_id).map(employee => <option key={employee.id} value={employee.id}>{employee.last_name} {employee.first_name}</option>)}
          </select>
          <select aria-label="Compte de connexion" className={inputClass + " sm:w-auto"} value={linkUserId} disabled={linkBusy} onChange={event => { setLinkUserId(event.target.value); setConfirmLink(false); }}>
            <option value="">Choisir un compte</option>
            {users.map(user => <option key={user.uid} value={user.uid}>{user.firstName} {user.lastName} - {user.email} ({user.accountStatus || (user.isActive ? "ACTIVE" : "DISABLED")})</option>)}
          </select>
          <button type="button" disabled={linkBusy || !linkEmployeeId || !linkUserId || !confirmLink} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
            const employee = employees.find(item => item.id === linkEmployeeId);
            if (!employee) return;
            setLinkBusy(true); setLinkMessage("");
            try { await onLinkAccount(employee, linkUserId); setLinkMessage("Compte lié. Vérifiez sa validation, son rôle et ses magasins dans Utilisateurs."); setLinkEmployeeId(""); setLinkUserId(""); setConfirmLink(false); }
            catch (error) { setLinkMessage(error instanceof Error ? error.message : "Association impossible."); }
            finally { setLinkBusy(false); }
          }}>{linkBusy ? "Association..." : "Lier au compte"}</button>
          <button type="button" onClick={onOpenUsers} className="rounded-lg border px-4 py-2 text-sm text-slate-900">Gérer les utilisateurs</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmLink} disabled={linkBusy} onChange={event => setConfirmLink(event.target.checked)} />Je confirme que ce compte et la fiche sélectionnée concernent la même personne et autorise l’archivage des anciennes fiches liées.</label>
        {linkMessage && <p role="status" className="text-sm text-slate-700">{linkMessage}</p>}
      </section>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm"><dt className="text-xs text-slate-500">Employés actifs</dt><dd className="mt-1 text-2xl font-black text-slate-900">{active.length}</dd></div>
        <div className="rounded-xl bg-white p-4 shadow-sm"><dt className="text-xs text-slate-500">Inactifs</dt><dd className="mt-1 text-2xl font-black text-slate-900">{employees.length - active.length}</dd></div>
        <div className="rounded-xl bg-white p-4 shadow-sm"><dt className="text-xs text-slate-500">Masse salariale mensuelle</dt><dd className="mt-1 text-2xl font-black text-slate-900">{money(payroll)}</dd></div>
      </dl>

      {profileEmployee && (
        <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Fiche de {profileEmployee.first_name} {profileEmployee.last_name}</h3>
              <p className="mt-1 text-xs text-slate-500">{profileEmployee.position} · {storeName(profileEmployee.store_id)}</p>
            </div>
            <button type="button" onClick={() => setProfileEmployeeId(null)} aria-label="Fermer la fiche" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">Dépenses associées validées</dt><dd className="mt-1 font-bold text-slate-900">{money(profileExpenseTotal)}</dd></div>
            <div className="rounded-lg bg-amber-50 p-3"><dt className="text-xs text-amber-800">Avances restant à déduire en paie</dt><dd className="mt-1 font-bold text-amber-950">{money(outstandingAdvanceTotal)}</dd></div>
          </dl>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Dépenses enregistrées à son nom</h4>
            {profileExpenses.length ? (
              <ul className="divide-y divide-slate-100">
                {profileExpenses.map(expense => (
                  <li key={expense.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{expense.description || "Dépense"}{expense.category === "SALARY_ADVANCE" ? " · Avance sur salaire" : ""}</span><span className="text-slate-500">{new Date(expense.expense_date).toLocaleDateString("fr-FR")} · {expense.status === "DRAFT" ? "Brouillon" : "Validée"}</span></span>
                    <span className="shrink-0 font-semibold text-slate-900">{money(expense.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500">Aucune dépense enregistrée à son nom.</p>}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Historique des avances sur salaire</h4>
            {profileAdvances.length ? (
              <ul className="divide-y divide-slate-100">
                {profileAdvances.map(advance => (
                  <li key={advance.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{advance.reason || "Avance sur salaire"}</span><span className="text-slate-500">{new Date(advance.advance_date).toLocaleDateString("fr-FR")} · {advance.status === "OUTSTANDING" ? "À déduire" : "Déduite"}{advance.expense_id ? " · enregistrée dans les dépenses" : ""}</span></span>
                    <span className="shrink-0 font-semibold text-slate-900">{money(advance.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500">Aucune avance sur salaire.</p>}
          </div>
        </section>
      )}

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">{editing ? `Modifier ${editing.first_name} ${editing.last_name}` : "Nouvel employé"}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-semibold text-slate-600">Nom *<input className={inputClass} value={form.lastName} onChange={event => setField("lastName", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Prénom *<input className={inputClass} value={form.firstName} onChange={event => setField("firstName", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Poste *<input className={inputClass} value={form.position} onChange={event => setField("position", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Magasin d'affectation
              <select className={inputClass} value={form.storeId} onChange={event => setField("storeId", event.target.value)}>
                <option value="">Non affecté</option>
                {stores.map(store => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Téléphone<input className={inputClass} value={form.phone} onChange={event => setField("phone", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Email<input type="email" className={inputClass} value={form.email} onChange={event => setField("email", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Date d'embauche<input type="date" className={inputClass} value={form.hireDate} onChange={event => setField("hireDate", event.target.value)} /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Contrat
              <select className={inputClass} value={form.contractType} onChange={event => setField("contractType", event.target.value as EmployeeContractType)}>
                {CONTRACTS.map(contract => <option key={contract.value} value={contract.value}>{contract.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Salaire mensuel (Ar)<input type="number" min="0" className={inputClass} value={form.salary} onChange={event => setField("salary", event.target.value)} /></label>
          </div>
          <label className="block space-y-1 text-xs font-semibold text-slate-600">Notes<textarea rows={2} className={inputClass} value={form.notes} onChange={event => setField("notes", event.target.value)} /></label>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={isSaving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isSaving ? "Enregistrement…" : "Enregistrer"}</button>
            <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuler</button>
          </div>
        </form>
      )}

      {!isFormOpen && error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className={`${inputClass} pl-9`} placeholder="Rechercher un employé, un poste, un code…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <select className={`${inputClass} sm:w-52`} value={storeFilter} onChange={event => setStoreFilter(event.target.value)}>
            <option value="">Tous les magasins</option>
            {stores.map(store => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} />Afficher aussi les inactifs
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">Employé</th><th className="px-3 py-2">Poste</th><th className="px-3 py-2">Magasin</th>
                <th className="px-3 py-2">Contact</th><th className="px-3 py-2">Contrat</th><th className="px-3 py-2 text-right">Salaire</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(employee => (
                <tr key={employee.id} className={employee.is_active ? "" : "opacity-50"}>
                  <td className="px-3 py-2"><div className="font-semibold text-slate-900">{employee.last_name} {employee.first_name}</div><div className="text-slate-500">{employee.code || "Profil créé par le personnel"}{employee.hire_date ? ` · depuis le ${new Date(employee.hire_date).toLocaleDateString("fr-FR")}` : ""}</div>{employee.application_status === "PENDING" && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">En attente de validation</span>}</td>
                  <td className="px-3 py-2">{employee.position}</td>
                  <td className="px-3 py-2">{storeName(employee.store_id)}</td>
                  <td className="px-3 py-2">{employee.phone || "—"}<div className="text-slate-500">{employee.email}</div></td>
                  <td className="px-3 py-2">{CONTRACTS.find(contract => contract.value === employee.contract_type)?.label || "—"}</td>
                  <td className="px-3 py-2 text-right">{employee.salary !== undefined ? money(employee.salary) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => openEdit(employee)} title="Modifier" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setProfileEmployeeId(employee.id)} title="Voir la fiche dépenses et avances" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                      <button type="button" onClick={() => toggleActive(employee)} disabled={isSaving} title={employee.is_active ? "Désactiver" : "Réactiver"} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                        {employee.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Aucun employé.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
