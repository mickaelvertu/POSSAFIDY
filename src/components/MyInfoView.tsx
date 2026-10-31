import { useEffect, useState } from "react";
import { Employee, InventoryCount, Payslip, SalaryAdvance, UserProfile } from "../types";
import { loadMyEmployees } from "../services/employeeService";
import { loadMyPayslips, loadMySalaryAdvances } from "../services/payrollService";
import { loadMyInventoryCharges } from "../services/inventoryCountService";

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const day = (timestamp: number) => new Date(timestamp).toLocaleDateString("fr-FR");

type Tab = "advances" | "payslips" | "charges";

export default function MyInfoView({ user }: { user: UserProfile }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [charges, setCharges] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("advances");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const myEmployees = await loadMyEmployees(user.uid);
        const ids = myEmployees.map(employee => employee.id);
        const [myAdvances, myPayslips, myCharges] = await Promise.all([
          loadMySalaryAdvances(ids),
          loadMyPayslips(ids),
          loadMyInventoryCharges(user.uid, ids)
        ]);
        if (!mounted) return;
        setEmployees(myEmployees);
        setAdvances(myAdvances);
        setPayslips(myPayslips);
        setCharges(myCharges.filter(count => (count.total_charged_amount || 0) > 0 && count.status === "VALIDATED"));
      } catch (loadError) {
        console.error("My info load failed:", loadError);
        if (mounted) setError("Impossible de charger vos informations pour le moment.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user.uid]);

  if (loading) return <p className="text-xs text-slate-500">Chargement de vos informations…</p>;
  if (error) return <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>;

  const pendingAdvances = advances.filter(advance => advance.status === "OUTSTANDING").reduce((sum, advance) => sum + advance.amount, 0);
  const pendingCharges = charges.filter(count => !count.charge_settlement).reduce((sum, count) => sum + (count.total_charged_amount || 0), 0);
  const lastPayslip = payslips[0];

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "advances", label: `Avances (${advances.length})` },
    { id: "payslips", label: `Fiches de paie (${payslips.length})` },
    { id: "charges", label: `Retenues d'inventaire (${charges.length})` }
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
      <h2 className="text-lg font-bold text-slate-900">Mes informations</h2>
      {employees.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Aucune fiche employé n'est liée à votre compte. Contactez un administrateur.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg bg-amber-50 p-3"><p className="text-slate-500">Avances en cours</p><p className="text-base font-black text-amber-700">{money(pendingAdvances)}</p></div>
            <div className="rounded-lg bg-rose-50 p-3"><p className="text-slate-500">Retenues d'inventaire en attente</p><p className="text-base font-black text-rose-700">{money(pendingCharges)}</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-slate-500">Dernier net{lastPayslip ? ` (${lastPayslip.period})` : ""}</p><p className="text-base font-black text-emerald-700">{lastPayslip ? money(lastPayslip.net_salary) : "—"}</p></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map(item => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-full border px-3 py-1 text-xs font-bold ${tab === item.id ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            {tab === "advances" && (advances.length === 0 ? <p className="text-xs text-slate-500">Aucune avance.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Date</th><th>Motif</th><th className="text-right">Montant</th><th className="text-right">Statut</th></tr></thead>
                <tbody>{advances.map(advance => (
                  <tr key={advance.id} className="border-b border-slate-100">
                    <td className="py-1.5">{day(advance.advance_date)}</td><td>{advance.reason || "—"}</td>
                    <td className="text-right font-mono">{money(advance.amount)}</td>
                    <td className="text-right">{advance.status === "DEDUCTED" ? "Déduite" : "En cours"}</td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
            {tab === "payslips" && (payslips.length === 0 ? <p className="text-xs text-slate-500">Aucune fiche de paie.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Période</th><th className="text-right">Base</th><th className="text-right">Primes</th><th className="text-right">Retenues</th><th className="text-right">Avances</th><th className="text-right">Net</th><th className="text-right">Statut</th></tr></thead>
                <tbody>{payslips.map(payslip => (
                  <tr key={payslip.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-semibold">{payslip.period}</td>
                    <td className="text-right font-mono">{money(payslip.base_salary)}</td>
                    <td className="text-right font-mono">{money(payslip.bonuses)}</td>
                    <td className="text-right font-mono">{money(payslip.deductions + (payslip.inventory_charges_deducted || 0))}</td>
                    <td className="text-right font-mono">{money(payslip.advances_deducted || 0)}</td>
                    <td className="text-right font-mono font-bold">{money(payslip.net_salary)}</td>
                    <td className="text-right">{payslip.payment_status === "PAID" ? "Payée" : "En attente"}</td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
            {tab === "charges" && (charges.length === 0 ? <p className="text-xs text-slate-500">Aucune retenue d'inventaire.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Comptage</th><th>Magasin</th><th>Date</th><th className="text-right">Montant</th><th className="text-right">Statut</th></tr></thead>
                <tbody>{charges.map(count => (
                  <tr key={count.id} className="border-b border-slate-100">
                    <td className="py-1.5 font-mono">{count.count_number}</td><td>{count.store_name}</td>
                    <td>{day(count.reviewed_at ?? count.updated_at)}</td>
                    <td className="text-right font-mono">{money(count.total_charged_amount || 0)}</td>
                    <td className="text-right">{count.charge_settlement ? `Déduite (${count.charge_settlement.reference})` : "En attente"}</td>
                  </tr>
                ))}</tbody>
              </table>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
