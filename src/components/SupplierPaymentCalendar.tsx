import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarDateKey, calendarDays, scheduledSupplierPurchases, supplierCalendarTotals, type CalendarPaymentEntry } from '../services/supplierPaymentCalendar';

const money = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;

export default function SupplierPaymentCalendar<T extends CalendarPaymentEntry>({ purchases, onPurchase, reseller = false }: { purchases: T[]; onPurchase: (purchase: T) => void; reseller?: boolean }) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [supplier, setSupplier] = useState('');
  const scheduled = useMemo(() => scheduledSupplierPurchases(purchases, true), [purchases]);
  const days = calendarDays(anchor, view);
  const filtered = scheduled.filter(p => !supplier || p.supplier_id === supplier);
  const grouped = new Map<string, T[]>();
  for (const purchase of filtered) {
    const key = calendarDateKey(new Date(purchase.expected_payment_at));
    grouped.set(key, [...(grouped.get(key) ?? []), purchase]);
  }
  const today = calendarDateKey(new Date());
  const periodPurchases = days.filter(day => view === 'week' || day.getMonth() === anchor.getMonth()).flatMap(day => grouped.get(calendarDateKey(day)) ?? []);
  const periodTotals = supplierCalendarTotals(periodPurchases);
  const move = (direction: number) => setAnchor(current => view === 'month'
    ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
    : new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7));
  const label = view === 'month' ? anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : `${days[0].toLocaleDateString('fr-FR')} – ${days[6].toLocaleDateString('fr-FR')}`;

  return <section id={reseller ? 'reseller-payment-calendar' : 'supplier-payment-calendar'} aria-labelledby={reseller ? 'reseller-calendar-title' : 'payment-calendar-title'} className="rounded-2xl border border-base-300 bg-base-100 p-4 text-base-content sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h3 id={reseller ? 'reseller-calendar-title' : 'payment-calendar-title'} className="text-base font-bold">Calendrier des paiements</h3><p className="mt-1 text-xs">{reseller ? 'Échéances des crédits revendeurs et des dettes manuelles, après déduction des encaissements.' : 'Échéances des achats approuvés et réceptionnés, après déduction des paiements.'}</p></div>
      <div className="flex gap-2">{(['month', 'week'] as const).map(mode => <button key={mode} type="button" className="ui-btn ui-btn-sm" aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'month' ? 'Mois' : 'Semaine'}</button>)}</div>
    </div>
    <div className="my-4 flex flex-wrap items-center gap-2">
      <button type="button" className="ui-btn ui-btn-sm" aria-label="Période précédente" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button>
      <p aria-live="polite" className="min-w-40 text-center text-sm font-semibold">{label}</p>
      <button type="button" className="ui-btn ui-btn-sm" aria-label="Période suivante" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => setAnchor(new Date())}>Aujourd’hui</button>
      <label className="flex flex-wrap items-center gap-2 text-xs sm:ml-auto">{reseller ? 'Revendeur' : 'Fournisseur'}<select className="ui-select max-w-full" value={supplier} onChange={event => setSupplier(event.target.value)}><option value="">{reseller ? 'Tous les revendeurs' : 'Tous les fournisseurs'}</option>{Array.from(new Map<string, string>(scheduled.map(p => [p.supplier_id, p.supplier_name] as const))).sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm"><p>Payé : <strong className="tabular-nums">{money(periodTotals.paid)}</strong></p><p>Non payé : <strong className="tabular-nums">{money(periodTotals.unpaid)}</strong></p><p>Total de la période : <strong className="tabular-nums">{money(periodTotals.total)}</strong></p></div>
    {periodPurchases.length === 0 && <p role="status" className="mb-3 text-sm">Aucun paiement à prévoir sur cette période.</p>}
    <div className="overflow-x-auto" tabIndex={0} aria-label="Calendrier des échéances, défilement horizontal sur petit écran">
      <div className="grid min-w-[770px] grid-cols-7 border-l border-t border-base-300">
        {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(day => <div key={day} className="border-b border-r border-base-300 bg-base-200 p-2 text-xs font-semibold">{day}</div>)}
        {days.map(day => {
          const key = calendarDateKey(day);
          const entries = grouped.get(key) ?? [];
          const totals = supplierCalendarTotals(entries);
          return <div key={key} className={`flex min-h-28 flex-col border-b border-r border-base-300 p-2 ${view === 'month' && day.getMonth() !== anchor.getMonth() ? 'bg-base-200' : ''}`}>
            <time dateTime={key} aria-current={key === today ? 'date' : undefined} className={`text-xs ${key === today ? 'font-bold underline underline-offset-4' : ''}`}>{day.getDate()} {day.toLocaleDateString('fr-FR', { month: 'short' })}</time>
            <div className="mt-2 space-y-2">{entries.map(p => <button key={p.id} type="button" onClick={() => onPurchase(p)} className="block w-full break-words rounded-lg border border-base-300 bg-base-100 p-2 text-left text-xs hover:bg-base-200">
              <span className="block font-bold">{p.supplier_name}</span><span className="mt-1 block tabular-nums">{p.total <= p.amount_paid ? 'Payé' : `Dû : ${money(Math.max(0, p.total - p.amount_paid))}`}</span><span className="mt-1 block">{p.purchase_number}</span>{key < today && p.total > p.amount_paid && <span className="mt-1 block font-semibold">En retard</span>}
            </button>)}</div>
            <dl className="mt-auto space-y-1 border-t border-base-300 pt-2 text-xs tabular-nums" aria-label={`Totaux du ${day.toLocaleDateString('fr-FR')}`}>
              <div className="flex flex-wrap justify-between gap-x-1"><dt>Payé</dt><dd>{money(totals.paid)}</dd></div>
              <div className="flex flex-wrap justify-between gap-x-1"><dt>Non payé</dt><dd>{money(totals.unpaid)}</dd></div>
              <div className="flex flex-wrap justify-between gap-x-1 font-bold"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
            </dl>
          </div>;
        })}
      </div>
    </div>
    <p className="mt-3 text-xs">{reseller ? 'Totaux par date d’échéance : montants encaissés et restes à payer des crédits du jour. Les crédits soldés sont inclus ; les ventes annulées ou non validées sont exclues. Sélectionnez une échéance pour consulter son détail.' : 'Totaux par date d’échéance : montants déjà payés et restes à payer des achats du jour. Les achats soldés sont inclus ; les brouillons et achats annulés sont exclus. Sélectionnez un achat pour consulter ses règlements.'}</p>
  </section>;
}
