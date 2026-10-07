import { FormEvent, useMemo, useState } from "react";
import { AppUser, CreditCustomer, CreditFollowUp, CreditPayment, PaymentMethod, Sale, UserProfile } from "../types";
import { Banknote, CalendarClock, CircleAlert, HandCoins, Plus, Search, Users } from "lucide-react";

interface CreditManagementViewProps {
  customers: CreditCustomer[];
  sales: Sale[];
  currentUser: UserProfile;
  resellerUsers: AppUser[];
  onSaveCustomer: (customer: CreditCustomer) => Promise<boolean>;
  onRecordPayment: (sale: Sale, payment: CreditPayment) => Promise<boolean>;
  onRecordFollowUp: (sale: Sale, followUp: CreditFollowUp) => Promise<boolean>;
}

const emptyCustomer = (): CreditCustomer => ({
  id: `credit-customer-${crypto.randomUUID()}`,
  name: "",
  phone: "",
  credit_limit: 0,
  payment_term_days: 15,
  outstanding_balance: 0,
  is_active: true,
  created_at: Date.now(),
  updated_at: Date.now()
});

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Espèces" },
  { value: "MVOLA", label: "MVola" },
  { value: "AIRTEL_MONEY", label: "Airtel Money" },
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "BANK_TRANSFER", label: "Virement bancaire" },
  { value: "CHECK", label: "Chèque" }
];

export default function CreditManagementView({
  customers,
  sales,
  currentUser,
  resellerUsers,
  onSaveCustomer,
  onRecordPayment,
  onRecordFollowUp
}: CreditManagementViewProps) {
  const [search, setSearch] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<CreditCustomer | null>(null);
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [followUpSale, setFollowUpSale] = useState<Sale | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [saving, setSaving] = useState(false);

  const money = (value: number) => `${value.toLocaleString("fr-FR")} Ar`;
  const outstandingSales = useMemo(
    () => sales.filter(sale => sale.credit_customer_id && sale.status !== "CANCELLED" && sale.payment_status !== "PAID"),
    [sales]
  );
  const visibleSales = outstandingSales
    .filter(sale => {
      const customer = customers.find(item => item.id === sale.credit_customer_id);
      return `${customer?.name || sale.customer_name} ${sale.sale_number}`.toLowerCase().includes(search.trim().toLowerCase());
    })
    .sort((left, right) => (left.credit_due_at || Number.MAX_SAFE_INTEGER) - (right.credit_due_at || Number.MAX_SAFE_INTEGER));
  const totalDue = customers.reduce((sum, customer) => sum + customer.outstanding_balance, 0);
  const overdue = outstandingSales.filter(sale =>
    sale.status === "VALIDATED" && (sale.credit_due_at || 0) < Date.now()
  );
  const openEditor = (customer?: CreditCustomer) => setEditingCustomer(customer ? { ...customer } : emptyCustomer());

  const submitCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCustomer || saving) return;
    setSaving(true);
    const saved = await onSaveCustomer({
      ...editingCustomer,
      linked_user_id: editingCustomer.linked_user_id || undefined,
      name: editingCustomer.name.trim(),
      phone: editingCustomer.phone.trim(),
      updated_at: Date.now()
    });
    setSaving(false);
    if (saved) setEditingCustomer(null);
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentSale || saving || amount <= 0) return;
    setSaving(true);
    const saved = await onRecordPayment(paymentSale, {
      id: `credit-payment-${crypto.randomUUID()}`,
      amount,
      method,
      reference: reference.trim() || undefined,
      paid_at: Date.now(),
      recorded_by: currentUser.uid,
      recorded_by_name: currentUser.displayName || currentUser.email
    });
    setSaving(false);
    if (saved) {
      setPaymentSale(null);
      setAmount(0);
      setReference("");
    }
  };

  const submitFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!followUpSale || saving || !followUpNote.trim()) return;
    setSaving(true);
    const saved = await onRecordFollowUp(followUpSale, {
      id: `credit-followup-${crypto.randomUUID()}`,
      note: followUpNote.trim(),
      followed_up_at: Date.now(),
      followed_up_by: currentUser.uid,
      followed_up_by_name: currentUser.displayName || currentUser.email
    });
    setSaving(false);
    if (saved) {
      setFollowUpSale(null);
      setFollowUpNote("");
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold">Crédits revendeurs</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Gérez les plafonds, suivez les échéances et consignez les relances effectuées.</p>
        </div>
        <button type="button" onClick={() => openEditor()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800">
          <Plus className="h-4 w-4" /> Ajouter un revendeur
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Encours total géré</p><p className="mt-1 text-xl font-black text-slate-900">{money(totalDue)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Revendeurs actifs</p><p className="mt-1 text-xl font-black text-slate-900">{customers.filter(item => item.is_active).length}</p></div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="flex items-center gap-1 text-xs font-semibold text-rose-700"><CircleAlert className="h-3.5 w-3.5" /> Factures en retard</p><p className="mt-1 text-xl font-black text-rose-800">{overdue.length}</p></div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-teal-700" /><h3 className="font-bold">Échéances et relances</h3></div>
          <label className="relative block w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher revendeur ou facture…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Revendeur / facture</th><th className="px-4 py-3">Échéance</th><th className="px-4 py-3 text-right">Reste à payer</th><th className="px-4 py-3">Règlements</th><th className="px-4 py-3">Dernière relance</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleSales.map(sale => {
                const customer = customers.find(item => item.id === sale.credit_customer_id);
                const balance = Math.max(0, sale.total - sale.amount_paid);
                const isOverdue = sale.status === "VALIDATED" && (sale.credit_due_at || 0) < Date.now();
                const lastFollowUp = sale.credit_followups?.at(-1);
                const canAct = sale.status === "VALIDATED";
                return (
                  <tr key={sale.id} className={isOverdue ? "bg-rose-50/60" : ""}>
                    <td className="px-4 py-3"><strong className="block">{customer?.name || sale.customer_name}</strong><span className="text-xs text-slate-500">{sale.sale_number} · {sale.status === "VALIDATED" ? "Livrée" : "Vente en cours"}</span></td>
                    <td className="px-4 py-3">{sale.credit_due_at ? <span className={isOverdue ? "font-bold text-rose-700" : "text-slate-700"}>{new Date(sale.credit_due_at).toLocaleDateString("fr-FR")}{isOverdue && " · En retard"}</span> : <span className="text-slate-400">Non définie</span>}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{money(balance)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{sale.credit_payments?.length
                      ? sale.credit_payments.map(payment => `${money(payment.amount)} · ${payment.method} · ${new Date(payment.paid_at).toLocaleDateString("fr-FR")}`).join(" / ")
                      : "Aucun règlement"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {lastFollowUp ? `${new Date(lastFollowUp.followed_up_at).toLocaleDateString("fr-FR")} · ${lastFollowUp.followed_up_by_name}` : "Aucune relance"}
                      {sale.credit_followups && sale.credit_followups.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer font-semibold text-teal-700">Historique ({sale.credit_followups.length})</summary>
                          <ul className="mt-1 space-y-1">
                            {sale.credit_followups.map(item => (
                              <li key={item.id}>{new Date(item.followed_up_at).toLocaleDateString("fr-FR")} · {item.followed_up_by_name} : {item.note}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3"><div className="flex gap-2">
                      {canAct && <button type="button" onClick={() => { setPaymentSale(sale); setAmount(balance); setMethod("CASH"); }} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800">Encaisser</button>}
                      {canAct && <button type="button" onClick={() => { setFollowUpSale(sale); setFollowUpNote(""); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Consigner relance</button>}
                    </div></td>
                  </tr>
                );
              })}
              {visibleSales.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Aucune échéance ne correspond à la recherche.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-teal-700" /><h3 className="font-bold">Comptes revendeurs et plafonds</h3></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map(customer => {
            const available = Math.max(0, customer.credit_limit - customer.outstanding_balance);
            return (
              <article key={customer.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><h4 className="font-bold">{customer.name}</h4><p className="text-xs text-slate-500">{customer.phone || "Pas de téléphone"} · {customer.payment_term_days} jours</p></div>
                  <button type="button" onClick={() => openEditor(customer)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">Gérer</button>
                </div>
                <div className="mt-3 flex justify-between text-xs"><span className="text-slate-500">Plafond</span><strong>{money(customer.credit_limit)}</strong></div>
                <div className="mt-1 flex justify-between text-xs"><span className="text-slate-500">Encours / disponible</span><strong>{money(customer.outstanding_balance)} / {money(available)}</strong></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${customer.credit_limit ? Math.min(100, customer.outstanding_balance / customer.credit_limit * 100) : 0}%` }} /></div>
              </article>
            );
          })}
          {customers.length === 0 && <p className="text-sm text-slate-500">Ajoutez les revendeurs qui peuvent acheter à crédit.</p>}
        </div>
      </section>

      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitCustomer} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <h3 className="text-base font-bold">{customers.some(item => item.id === editingCustomer.id) ? "Gérer le compte revendeur" : "Nouveau compte revendeur"}</h3>
            <label className="block text-xs font-bold">Nom du revendeur<input required value={editingCustomer.name} onChange={event => setEditingCustomer({ ...editingCustomer, name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <label className="block text-xs font-bold">Téléphone<input value={editingCustomer.phone} onChange={event => setEditingCustomer({ ...editingCustomer, phone: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <label className="block text-xs font-bold">Compte portail revendeur
              <select value={editingCustomer.linked_user_id || ""} onChange={event => setEditingCustomer({ ...editingCustomer, linked_user_id: event.target.value || undefined })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                <option value="">Aucun lien</option>
                {resellerUsers.map(reseller => <option key={reseller.uid} value={reseller.uid}>{reseller.businessName || `${reseller.firstName} ${reseller.lastName}`} · {reseller.email}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold">Plafond crédit (Ar)<input required min={0} type="number" value={editingCustomer.credit_limit} onChange={event => setEditingCustomer({ ...editingCustomer, credit_limit: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
              <label className="block text-xs font-bold">Délai (jours)<input required min={1} type="number" value={editingCustomer.payment_term_days} onChange={event => setEditingCustomer({ ...editingCustomer, payment_term_days: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            </div>
            {customers.some(item => item.id === editingCustomer.id) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingCustomer.is_active} onChange={event => setEditingCustomer({ ...editingCustomer, is_active: event.target.checked })} />Compte actif</label>}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setEditingCustomer(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Annuler</button><button disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
          </form>
        </div>
      )}

      {paymentSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitPayment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <h3 className="font-bold">Encaisser une facture</h3><p className="text-sm text-slate-600">{paymentSale.sale_number} · Solde {money(paymentSale.total - paymentSale.amount_paid)}</p>
            <label className="block text-xs font-bold">Montant (Ar)<input required min={1} max={paymentSale.total - paymentSale.amount_paid} type="number" value={amount} onChange={event => setAmount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <label className="block text-xs font-bold">Mode de paiement<select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm">{paymentMethods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-bold">Référence (facultatif)<input value={reference} onChange={event => setReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setPaymentSale(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Annuler</button><button disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Banknote className="h-4 w-4" />Enregistrer le paiement</button></div>
          </form>
        </div>
      )}

      {followUpSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitFollowUp} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
            <h3 className="font-bold">Consigner une relance</h3><p className="text-sm text-slate-600">{followUpSale.customer_name} · {followUpSale.sale_number}</p>
            <label className="block text-xs font-bold">Résultat / note<textarea required rows={3} value={followUpNote} onChange={event => setFollowUpNote(event.target.value)} placeholder="Appel effectué, promesse de règlement…" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => setFollowUpSale(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Annuler</button><button disabled={saving || !followUpNote.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Enregistrer la relance</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
