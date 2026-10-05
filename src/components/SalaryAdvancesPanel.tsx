import { FormEvent, useMemo, useState } from "react";
import { HandCoins } from "lucide-react";
import { Employee, PaymentMethod, SalaryAdvance } from "../types";

interface SalaryAdvancesPanelProps {
  employees: Employee[];
  advances: SalaryAdvance[];
  currentUserId: string;
  onSaveAdvance: (advance: SalaryAdvance) => Promise<void>;
}

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Espèces" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "MVOLA", label: "MVola" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "CHECK", label: "Chèque" }
];

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const dateValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function SalaryAdvancesPanel({ employees, advances, currentUserId, onSaveAdvance }: SalaryAdvancesPanelProps) {
  const activeEmployees = useMemo(() => employees.filter(employee => employee.is_active), [employees]);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(dateValue(Date.now()));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reason, setReason] = useState("");
  const [filterId, setFilterId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const outstandingFor = (id: string) => advances
    .filter(advance => advance.employee_id === id && advance.status === "OUTSTANDING")
    .reduce((total, advance) => total + advance.amount, 0);

  const balances = activeEmployees
    .map(employee => ({ employee, balance: outstandingFor(employee.id) }))
    .filter(item => item.balance > 0);
  const visible = advances.filter(advance => !filterId || advance.employee_id === filterId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const employee = activeEmployees.find(item => item.id === employeeId);
    const value = Number(amount);
    if (!employee) {
      setError("Sélectionnez un employé actif.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || !advanceDate) {
      setError("Renseignez un montant positif et une date valide.");
      return;
    }
    if (employee.salary !== undefined && outstandingFor(employee.id) + value > employee.salary) {
      setError(`Le cumul des avances en cours dépasserait le salaire mensuel (${money(employee.salary)}).`);
      return;
    }
    const timestamp = Date.now();
    const advance: SalaryAdvance = {
      id: `adv-${crypto.randomUUID()}`,
      employee_id: employee.id,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      amount: value,
      advance_date: new Date(`${advanceDate}T12:00:00`).getTime(),
      payment_method: method,
      reason: reason.trim() || undefined,
      status: "OUTSTANDING",
      created_at: timestamp,
      updated_at: timestamp,
      created_by: currentUserId
    };
    setSaving(true);
    setError("");
    try {
      await onSaveAdvance(advance);
      setAmount("");
      setReason("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer cette avance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl bg-white p-5 text-slate-900 shadow-sm">
      <h3 className="flex items-center gap-2 font-bold"><HandCoins className="h-5 w-5 text-amber-600" />Avances sur salaire</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Employé *
            <select className={inputClass} value={employeeId} onChange={event => setEmployeeId(event.target.value)} required>
              <option value="">Sélectionner un employé actif</option>
              {activeEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Montant (Ar) *
            <input type="number" min="1" step="1" className={inputClass} value={amount} onChange={event => setAmount(event.target.value)} required />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Date *
            <input type="date" className={inputClass} value={advanceDate} onChange={event => setAdvanceDate(event.target.value)} required />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Mode de paiement
            <select className={inputClass} value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}>
              {METHODS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Motif
            <input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} placeholder="Facultatif" />
          </label>
        </div>
        {employeeId && <p className="text-xs text-slate-500">Avances en cours pour cet employé : <strong>{money(outstandingFor(employeeId))}</strong></p>}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={saving || activeEmployees.length === 0} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
          {saving ? "Enregistrement…" : "Enregistrer l'avance"}
        </button>
      </form>

      {balances.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {balances.map(({ employee, balance }) => (
            <span key={employee.id} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {employee.first_name} {employee.last_name} : {money(balance)} à déduire
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600">Historique</span>
          <select className={`${inputClass} max-w-56`} value={filterId} onChange={event => setFilterId(event.target.value)}>
            <option value="">Tous les employés</option>
            {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
          </select>
        </div>
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr>
            <th className="px-3 py-2">Employé</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map(advance => <tr key={advance.id}>
              <td className="px-3 py-2 font-semibold">{advance.employee_name}</td>
              <td className="px-3 py-2">{new Date(advance.advance_date).toLocaleDateString("fr-FR")}</td>
              <td className="px-3 py-2 text-right">{money(advance.amount)}</td>
              <td className="px-3 py-2 text-slate-500">{advance.reason || "—"}</td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 font-semibold ${advance.status === "DEDUCTED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{advance.status === "DEDUCTED" ? "Déduite" : "À déduire"}</span></td>
            </tr>)}
            {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Aucune avance enregistrée.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
