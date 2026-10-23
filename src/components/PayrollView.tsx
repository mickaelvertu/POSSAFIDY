import { FormEvent, useMemo, useState } from "react";
import { Check, Pencil, Printer, ReceiptText } from "lucide-react";
import { Employee, InventoryCount, PaymentMethod, Payslip, SalaryAdvance } from "../types";
import SalaryAdvancesPanel from "./SalaryAdvancesPanel";

interface PayrollViewProps {
  employees: Employee[];
  payslips: Payslip[];
  advances: SalaryAdvance[];
  inventoryCounts?: InventoryCount[];
  currentUserId: string;
  onSavePayslip: (payslip: Payslip, isNew: boolean, settledAdvances: SalaryAdvance[], settledCounts?: InventoryCount[]) => Promise<void>;
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
const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const dateValue = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const periodLabel = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function PayrollView({ employees, payslips, advances, inventoryCounts = [], currentUserId, onSavePayslip, onSaveAdvance }: PayrollViewProps) {
  const activeEmployees = useMemo(() => employees.filter(employee => employee.is_active), [employees]);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(currentPeriod);
  const [baseSalary, setBaseSalary] = useState("");
  const [bonuses, setBonuses] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<Payslip["payment_status"]>("PENDING");
  const [paymentDate, setPaymentDate] = useState(dateValue(Date.now()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState<Payslip | null>(null);

  const [deductAdvances, setDeductAdvances] = useState(true);

  const selectedEmployee = employees.find(employee => employee.id === employeeId);
  const outstandingAdvances = editing
    ? []
    : advances.filter(advance => advance.employee_id === employeeId && advance.status === "OUTSTANDING");
  const outstandingTotal = outstandingAdvances.reduce((total, advance) => total + advance.amount, 0);
  const formAdvances = (editing
    ? advances.filter(advance => advance.employee_id === employeeId && editing.advance_ids?.includes(advance.id))
    : outstandingAdvances).slice().sort((left, right) => right.advance_date - left.advance_date);
  const missingAdvanceCount = editing ? (editing.advance_ids || []).filter(id => !formAdvances.some(advance => advance.id === id)).length : 0;
  const advancesAmount = editing ? editing.advances_deducted || 0 : deductAdvances ? outstandingTotal : 0;
  const [deductInventory, setDeductInventory] = useState(true);
  const pendingInventory = editing || !selectedEmployee?.user_id
    ? []
    : inventoryCounts.filter(count => count.status === "VALIDATED" && !count.charge_settlement && (count.total_charged_amount || 0) > 0 && count.created_by === selectedEmployee.user_id);
  const pendingInventoryTotal = pendingInventory.reduce((total, count) => total + (count.total_charged_amount || 0), 0);
  const inventoryAmount = editing ? editing.inventory_charges_deducted || 0 : deductInventory ? pendingInventoryTotal : 0;

  const resetForm = () => {
    setEditing(null);
    setEmployeeId("");
    setPeriod(currentPeriod());
    setBaseSalary("");
    setBonuses("0");
    setDeductions("0");
    setPaymentStatus("PENDING");
    setPaymentDate(dateValue(Date.now()));
    setPaymentMethod("CASH");
    setDeductAdvances(true);
    setFormError("");
  };

  const beginEdit = (payslip: Payslip) => {
    setEditing(payslip);
    setEmployeeId(payslip.employee_id);
    setPeriod(payslip.period);
    setBaseSalary(String(payslip.base_salary));
    setBonuses(String(payslip.bonuses));
    setDeductions(String(payslip.deductions));
    setPaymentStatus(payslip.payment_status);
    setPaymentDate(dateValue(payslip.payment_date || Date.now()));
    setPaymentMethod(payslip.payment_method || "CASH");
    setFormError("");
    document.getElementById("payroll-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEmployeeChange = (id: string) => {
    setEmployeeId(id);
    const employee = activeEmployees.find(item => item.id === id);
    if (employee && !editing) setBaseSalary(String(employee.salary || 0));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const salary = Number(baseSalary);
    const bonusAmount = Number(bonuses);
    const deductionAmount = Number(deductions);
    if (!selectedEmployee || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      setFormError("Sélectionnez un employé actif et une période valide.");
      return;
    }
    if (![salary, bonusAmount, deductionAmount].every(value => Number.isFinite(value) && value >= 0)) {
      setFormError("Le salaire, les primes et les retenues doivent être des montants positifs ou nuls.");
      return;
    }
    if (deductionAmount + advancesAmount + inventoryAmount > salary + bonusAmount) {
      setFormError("Les retenues, avances et retenues d'inventaire ne peuvent pas dépasser le salaire brut.");
      return;
    }
    if (paymentStatus === "PAID" && !paymentDate) {
      setFormError("Indiquez la date de paiement.");
      return;
    }
    const id = editing?.id || `pay-${selectedEmployee.id}-${period}`;
    const duplicate = payslips.find(item => item.employee_id === selectedEmployee.id && item.period === period && item.id !== editing?.id);
    if (duplicate) {
      setFormError("Une fiche de paie existe déjà pour cet employé et cette période.");
      return;
    }
    const timestamp = Date.now();
    const payslip: Payslip = {
      id,
      employee_id: selectedEmployee.id,
      employee_name: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      employee_code: selectedEmployee.code,
      employee_position: selectedEmployee.position,
      period,
      base_salary: salary,
      bonuses: bonusAmount,
      deductions: deductionAmount,
      advances_deducted: advancesAmount,
      advance_ids: editing ? editing.advance_ids : deductAdvances ? outstandingAdvances.map(advance => advance.id) : [],
      net_salary: salary + bonusAmount - deductionAmount - advancesAmount - inventoryAmount,
      inventory_charges_deducted: editing ? editing.inventory_charges_deducted : inventoryAmount || undefined,
      inventory_count_ids: editing ? editing.inventory_count_ids : inventoryAmount > 0 ? pendingInventory.map(count => count.id) : undefined,
      payment_status: paymentStatus,
      payment_date: paymentStatus === "PAID" ? new Date(`${paymentDate}T12:00:00`).getTime() : undefined,
      payment_method: paymentStatus === "PAID" ? paymentMethod : undefined,
      created_at: editing?.created_at || timestamp,
      updated_at: timestamp,
      created_by: editing?.created_by || currentUserId
    };
    setSaving(true);
    setFormError("");
    try {
      const settled = !editing && deductAdvances
        ? outstandingAdvances.map(advance => ({ ...advance, status: "DEDUCTED" as const, payslip_id: id, updated_at: timestamp }))
        : [];
      await onSavePayslip(payslip, !editing, settled, !editing && deductInventory ? pendingInventory : []);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Impossible d'enregistrer cette fiche de paie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5 text-slate-900">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .payslip-print, .payslip-print * { visibility: visible !important; }
          .payslip-print { position: absolute !important; inset: 0 !important; width: 100% !important; background: white !important; padding: 32px !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <header className="flex items-center gap-3">
        <ReceiptText className="h-6 w-6 text-emerald-600" />
        <div>
          <h2 className="text-xl font-black text-white">Fiches de paie</h2>
          <p className="mt-1 text-sm text-slate-400">Calcul du net, suivi des paiements et impression mensuelle.</p>
        </div>
      </header>

      <form id="payroll-form" onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
        <h3 className="font-bold">{editing ? "Modifier la fiche de paie" : "Nouvelle fiche de paie"}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Employé *
            <select className={inputClass} value={employeeId} onChange={event => handleEmployeeChange(event.target.value)} required disabled={Boolean(editing)}>
              <option value="">Sélectionner un employé actif</option>
              {(editing && selectedEmployee && !activeEmployees.some(employee => employee.id === editing.employee_id)
                ? [...activeEmployees, selectedEmployee]
                : activeEmployees).map(employee => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Mois de paie *
            <input type="month" className={inputClass} value={period} onChange={event => setPeriod(event.target.value)} required disabled={Boolean(editing)} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Salaire de base (Ar) *
            <input type="number" min="0" step="1" className={inputClass} value={baseSalary} onChange={event => setBaseSalary(event.target.value)} required />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Primes / indemnités (Ar)
            <input type="number" min="0" step="1" className={inputClass} value={bonuses} onChange={event => setBonuses(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Retenues (Ar)
            <input type="number" min="0" step="1" className={inputClass} value={deductions} onChange={event => setDeductions(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Statut du paiement
            <select className={inputClass} value={paymentStatus} onChange={event => setPaymentStatus(event.target.value as Payslip["payment_status"])}>
              <option value="PENDING">À payer</option>
              <option value="PAID">Payé</option>
            </select>
          </label>
          {paymentStatus === "PAID" && <>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Date de paiement *
              <input type="date" className={inputClass} value={paymentDate} onChange={event => setPaymentDate(event.target.value)} required />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">Mode de paiement
              <select className={inputClass} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}>
                {METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select>
            </label>
          </>}
        </div>
        {!editing && outstandingTotal > 0 && (
          <label className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" checked={deductAdvances} onChange={event => setDeductAdvances(event.target.checked)} />
            Déduire les avances en cours ({outstandingAdvances.length}) : <strong>{money(outstandingTotal)}</strong>
          </label>
        )}
        {editing && advancesAmount > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Avances déjà déduites : <strong>{money(advancesAmount)}</strong></p>}
        {employeeId && (
          <section aria-label="Détail des avances de la paie" className="overflow-hidden rounded-lg border border-amber-200">
            <div className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {editing ? "Avances associées à cette fiche" : "Avances en cours de cet employé"} ({formAdvances.length})
            </div>
            {formAdvances.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600"><tr>
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2">Référence</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2 text-right">Montant</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {formAdvances.map(advance => <tr key={advance.id}>
                      <td className="whitespace-nowrap px-3 py-2">{new Date(advance.advance_date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-3 py-2">{advance.reason || "Non renseigné"}</td>
                      <td className="px-3 py-2">{METHODS.find(method => method.value === advance.payment_method)?.label || advance.payment_method}</td>
                      <td className="max-w-56 break-words px-3 py-2">{advance.expense_id ? `Dépense : ${advance.expense_id}` : advance.id}</td>
                      <td className="px-3 py-2">{advance.status === "DEDUCTED" ? "Déjà déduite" : "En cours"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{money(advance.amount)}</td>
                    </tr>)}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold"><tr><td colSpan={5} className="px-3 py-2">Total des avances affichées</td><td className="whitespace-nowrap px-3 py-2 text-right">{money(formAdvances.reduce((total, advance) => total + advance.amount, 0))}</td></tr></tfoot>
                </table>
              </div>
            ) : <p className="p-3 text-sm text-slate-500">{editing ? "Aucun détail d’avance disponible pour cette fiche." : "Aucune avance en cours pour cet employé."}</p>}
            {!editing && formAdvances.length > 0 && <p className="px-3 py-2 text-xs text-slate-600">{deductAdvances ? "Ces avances seront déduites à l’enregistrement de la fiche." : "Déduction désactivée : ces avances ne seront pas déduites."}</p>}
            {missingAdvanceCount > 0 && <p className="px-3 py-2 text-xs text-amber-800">{missingAdvanceCount} avance(s) historique(s) indisponible(s), notamment si la dépense source a été supprimée. Le montant enregistré sur la fiche reste inchangé.</p>}
          </section>
        )}
        {!editing && pendingInventoryTotal > 0 && (
          <label className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-900">
            <input type="checkbox" checked={deductInventory} onChange={event => setDeductInventory(event.target.checked)} />
            Déduire les retenues d'inventaire ({pendingInventory.length}) : <strong>{money(pendingInventoryTotal)}</strong>
          </label>
        )}
        {editing && inventoryAmount > 0 && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">Retenues d'inventaire déjà déduites : <strong>{money(inventoryAmount)}</strong></p>}
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <span className="text-slate-600">Net à payer </span>
          <strong>{money((Number(baseSalary) || 0) + (Number(bonuses) || 0) - (Number(deductions) || 0) - advancesAmount - inventoryAmount)}</strong>
          <p className="mt-1 text-xs text-slate-500">Calcul : salaire de base + primes − retenues − avances. Les retenues sont saisies manuellement.</p>
        </div>
        {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving || activeEmployees.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Check className="h-4 w-4" />{saving ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Créer la fiche"}
          </button>
          {editing && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>}
          {activeEmployees.length === 0 && <span className="self-center text-xs text-slate-500">Aucun employé actif disponible.</span>}
        </div>
      </form>

      <div className="no-print">
        <SalaryAdvancesPanel employees={employees} advances={advances} currentUserId={currentUserId} onSaveAdvance={onSaveAdvance} />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-bold">Historique des fiches</h3>
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr>
            <th className="px-3 py-2">Employé</th><th className="px-3 py-2">Période</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Net à payer</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {payslips.map(payslip => <tr key={payslip.id}>
              <td className="px-3 py-2"><strong>{payslip.employee_name}</strong><div className="text-slate-500">{payslip.employee_position}</div></td>
              <td className="px-3 py-2 capitalize">{periodLabel(payslip.period)}</td>
              <td className="px-3 py-2 text-right">{money(payslip.base_salary)}</td>
              <td className="px-3 py-2 text-right font-bold">{money(payslip.net_salary)}</td>
              <td className="px-3 py-2"><span className={`rounded-full px-2 py-1 font-semibold ${payslip.payment_status === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{payslip.payment_status === "PAID" ? "Payé" : "À payer"}</span></td>
              <td className="px-3 py-2"><div className="flex justify-end gap-1">
                <button type="button" onClick={() => beginEdit(payslip)} title="Modifier" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPrinting(payslip)} title="Imprimer" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Printer className="h-4 w-4" /></button>
              </div></td>
            </tr>)}
            {payslips.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Aucune fiche de paie enregistrée.</td></tr>}
          </tbody>
        </table>
      </div>

      {printing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4">
          <article className="payslip-print relative my-auto w-full max-w-2xl rounded-xl bg-white p-8 text-slate-900 shadow-2xl">
            <div className="no-print mb-6 flex justify-end gap-2">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"><Printer className="h-4 w-4" />Imprimer</button>
              <button type="button" onClick={() => setPrinting(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Fermer</button>
            </div>
            <header className="border-b-2 border-slate-900 pb-5 text-center">
              <h1 className="text-2xl font-black uppercase tracking-wide">Fiche de paie</h1>
              <p className="mt-2 text-lg capitalize">{periodLabel(printing.period)}</p>
            </header>
            <div className="grid grid-cols-2 gap-4 border-b border-slate-200 py-5 text-sm">
              <div><div className="text-slate-500">Employé</div><strong>{printing.employee_name}</strong></div>
              <div><div className="text-slate-500">Poste</div><strong>{printing.employee_position}</strong></div>
              <div><div className="text-slate-500">Matricule</div><strong>{printing.employee_code || "—"}</strong></div>
              <div><div className="text-slate-500">Période</div><strong className="capitalize">{periodLabel(printing.period)}</strong></div>
            </div>
            <table className="my-5 w-full text-sm">
              <tbody>
                <tr><td className="border-b border-slate-200 py-3">Salaire de base</td><td className="border-b border-slate-200 py-3 text-right">{money(printing.base_salary)}</td></tr>
                <tr><td className="border-b border-slate-200 py-3">Primes et indemnités</td><td className="border-b border-slate-200 py-3 text-right">{money(printing.bonuses)}</td></tr>
                <tr><td className="border-b border-slate-200 py-3">Retenues</td><td className="border-b border-slate-200 py-3 text-right">− {money(printing.deductions)}</td></tr>
                {(printing.advances_deducted || 0) > 0 && <tr><td className="border-b border-slate-200 py-3">Avances sur salaire</td><td className="border-b border-slate-200 py-3 text-right">− {money(printing.advances_deducted || 0)}</td></tr>}
                {(printing.inventory_charges_deducted || 0) > 0 && <tr><td className="border-b border-slate-200 py-3">Retenues d'inventaire</td><td className="border-b border-slate-200 py-3 text-right">− {money(printing.inventory_charges_deducted || 0)}</td></tr>}
                <tr className="text-base font-black"><td className="py-4">NET À PAYER</td><td className="py-4 text-right">{money(printing.net_salary)}</td></tr>
              </tbody>
            </table>
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <strong>Statut : </strong>{printing.payment_status === "PAID" ? "Payé" : "À payer"}
              {printing.payment_status === "PAID" && printing.payment_date && <>
                <div className="mt-1"><strong>Date : </strong>{new Date(printing.payment_date).toLocaleDateString("fr-FR")}</div>
                <div className="mt-1"><strong>Mode : </strong>{METHODS.find(method => method.value === printing.payment_method)?.label || "—"}</div>
              </>}
            </div>
            <div className="mt-14 grid grid-cols-2 gap-10 text-center text-xs">
              <div className="border-t border-slate-400 pt-2">Signature de l'employeur</div>
              <div className="border-t border-slate-400 pt-2">Signature de l'employé</div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
