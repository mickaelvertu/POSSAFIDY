import { useMemo, useState } from 'react';
import type { Store } from '../types';
import { buildUserAudit, UserAuditData } from '../services/userAuditReport';
import { downloadReportCsv, ReportColumn } from '../services/reportColumns';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Download,
  Filter,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Store as StoreIcon,
  Users,
  Wallet,
} from 'lucide-react';

type Props = UserAuditData & { stores: Store[] };
const money = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;
const date = (timestamp: number) => new Date(timestamp).toLocaleDateString('fr-FR');
const kinds = ['Vente', 'Avance', 'Bulletin de paie', 'Retenue inventaire'];
const statusOptions = ['DRAFT', 'CHECKING', 'VERIFIED', 'VALIDATED', 'CANCELLED', 'REFUNDED', 'OUTSTANDING', 'DEDUCTED', 'PENDING', 'PAID'];
const controlClass = 'mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-emerald-500/30';

interface Row {
  id: string;
  user: string;
  date: string;
  kind: string;
  reference: string;
  store: string;
  status: string;
  amount: number;
  detail: string;
}

const columns: ReportColumn<Row>[] = ['user', 'date', 'kind', 'reference', 'store', 'status', 'amount', 'detail'].map((key, index) => ({
  key,
  label: ['Utilisateur', 'Date / période', 'Opération', 'Référence', 'Magasin', 'Statut', 'Montant (Ar)', 'Détail'][index],
  value: row => row[key as keyof Row],
}));

export default function UserAuditReport(props: Props) {
  const [userId, setUserId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const fiches = useMemo(
    () => buildUserAudit(props, { userId, storeId, start, end }),
    [props, userId, storeId, start, end],
  );
  const storeName = (id: string) => props.stores.find(store => store.id === id)?.name || id;

  const rowsFor = (fiche: typeof fiches[number]): Row[] => {
    const common = { user: fiche.user.displayName };
    return [
      ...fiche.sales.map(sale => ({
        ...common,
        id: `sale-${sale.id}`,
        date: date(sale.created_at),
        kind: 'Vente',
        reference: sale.sale_number,
        store: storeName(sale.store_id),
        status: sale.status,
        amount: sale.total,
        detail: sale.customer_name,
      })),
      ...fiche.advances.map(advance => ({
        ...common,
        id: `advance-${advance.id}`,
        date: date(advance.advance_date),
        kind: 'Avance',
        reference: advance.id,
        store: storeName(fiche.employees.find(employee => employee.id === advance.employee_id)?.store_id || ''),
        status: advance.status,
        amount: advance.amount,
        detail: advance.reason || '',
      })),
      ...fiche.payslips.map(slip => ({
        ...common,
        id: `pay-${slip.id}`,
        date: slip.period,
        kind: 'Bulletin de paie',
        reference: slip.id,
        store: storeName(fiche.employees.find(employee => employee.id === slip.employee_id)?.store_id || ''),
        status: slip.payment_status,
        amount: slip.net_salary,
        detail: `Base : ${money(slip.base_salary)} ; primes : ${money(slip.bonuses)} ; retenues : ${money(slip.deductions)} ; avances déduites : ${money(slip.advances_deducted || 0)} ; inventaire déduit : ${money(slip.inventory_charges_deducted || 0)}`,
      })),
      ...fiche.counts.map(count => ({
        ...common,
        id: `count-${count.id}`,
        date: date(count.reviewed_at ?? count.updated_at),
        kind: 'Retenue inventaire',
        reference: count.count_number,
        store: storeName(count.store_id),
        status: count.charge_settlement ? 'DEDUCTED' : 'OUTSTANDING',
        amount: count.total_charged_amount || 0,
        detail: count.review_note || count.notes || '',
      })),
    ].filter(row =>
      (!kind || row.kind === kind)
      && (!status || row.status === status)
      && (!search || `${row.user} ${row.reference} ${row.detail}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR'))),
    );
  };

  const allRows = fiches.flatMap(rowsFor);
  const validatedSales = allRows.filter(row => row.kind === 'Vente' && row.status === 'VALIDATED');
  const totalSales = validatedSales.reduce((sum, row) => sum + row.amount, 0);
  const totalAdvances = allRows.filter(row => row.kind === 'Avance').reduce((sum, row) => sum + row.amount, 0);
  const hasFilters = Boolean(userId || storeId || start || end || kind || status || search);
  const resetFilters = () => {
    setUserId('');
    setStoreId('');
    setStart('');
    setEnd('');
    setKind('');
    setStatus('');
    setSearch('');
  };

  const panelStyle = { backgroundColor: 'var(--theme-panel)', borderColor: 'var(--theme-border)' };
  const controlStyle = { backgroundColor: 'var(--theme-page)', borderColor: 'var(--theme-border)', color: 'var(--theme-ink)' };

  return (
    <section className="space-y-5 rounded-3xl border p-4 text-[var(--theme-ink)] sm:p-6 lg:p-7" style={panelStyle}>
      <header className="flex flex-col justify-between gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center sm:p-6" style={controlStyle}>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Rapport N° 15</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Audit des utilisateurs</h2>
            <p className="mt-1 max-w-2xl text-sm opacity-70">Suivez les opérations, affectations et éléments de paie associés à chaque compte.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => downloadReportCsv('audit-utilisateurs.csv', columns, allRows)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-white/5"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Utilisateurs affichés', value: fiches.length.toLocaleString('fr-FR'), icon: Users, detail: 'Comptes dans ce rapport', color: 'text-sky-400 bg-sky-400/10' },
          { label: 'Opérations trouvées', value: allRows.length.toLocaleString('fr-FR'), icon: Activity, detail: 'Après application des filtres', color: 'text-violet-400 bg-violet-400/10' },
          { label: 'Chiffre d’affaires validé', value: money(totalSales), icon: CheckCircle2, detail: 'Ventes validées uniquement', color: 'text-emerald-400 bg-emerald-400/10' },
          { label: 'Avances', value: money(totalAdvances), icon: Wallet, detail: 'Montant des avances listées', color: 'text-amber-400 bg-amber-400/10' },
        ].map(metric => (
          <article key={metric.label} className="rounded-2xl border p-4" style={panelStyle}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium opacity-70">{metric.label}</span>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.color}`}>
                <metric.icon aria-hidden="true" className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 truncate text-lg font-bold tracking-tight sm:text-xl">{metric.value}</p>
            <p className="mt-1 text-xs opacity-55">{metric.detail}</p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border p-4 sm:p-5" style={controlStyle}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter aria-hidden="true" className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold">Filtres du rapport</h3>
            {hasFilters && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">Actifs</span>}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasFilters}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40 print:hidden"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Réinitialiser
          </button>
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          <label className="text-xs font-semibold opacity-80">
            Utilisateur
            <select className={controlClass} style={controlStyle} value={userId} onChange={event => setUserId(event.target.value)}>
              <option value="">Tous les utilisateurs</option>
              {props.users.map(user => <option key={user.id} value={user.id}>{user.displayName} — {user.email}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold opacity-80">
            Magasin
            <select className={controlClass} style={controlStyle} value={storeId} onChange={event => setStoreId(event.target.value)}>
              <option value="">Tous les magasins</option>
              {props.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold opacity-80">
            Opération
            <select className={controlClass} style={controlStyle} value={kind} onChange={event => setKind(event.target.value)}>
              <option value="">Toutes les opérations</option>
              {kinds.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold opacity-80">
            Statut
            <select className={controlClass} style={controlStyle} value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Tous les statuts</option>
              {statusOptions.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold opacity-80">
            <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />Du</span>
            <input className={controlClass} style={controlStyle} type="date" value={start} onChange={event => setStart(event.target.value)} />
          </label>
          <label className="text-xs font-semibold opacity-80">
            <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />Au</span>
            <input className={controlClass} style={controlStyle} type="date" min={start} value={end} onChange={event => setEnd(event.target.value)} />
          </label>
          <label className="text-xs font-semibold opacity-80 sm:col-span-2">
            Recherche
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45" />
              <input
                className={`${controlClass} pl-9`}
                style={controlStyle}
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Utilisateur, référence ou motif…"
              />
            </span>
          </label>
        </div>
      </div>

      <div className="printable-document space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--theme-border)' }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">Résultats</p>
            <h2 className="mt-1 text-lg font-bold">Activité par utilisateur</h2>
          </div>
          <p className="text-xs opacity-65">{allRows.length.toLocaleString('fr-FR')} opération{allRows.length === 1 ? '' : 's'} · {fiches.length.toLocaleString('fr-FR')} compte{fiches.length === 1 ? '' : 's'}</p>
        </div>
        <p className="text-xs leading-relaxed opacity-60">
          Période : {start || 'sans limite'} → {end || 'sans limite'} · Magasin : {storeId ? storeName(storeId) : 'tous'} · Opération : {kind || 'toutes'} · Statut : {status || 'tous'} · Recherche : {search || 'aucune'}
        </p>
        <p className="rounded-xl border px-4 py-3 text-xs leading-relaxed opacity-75" style={{ ...panelStyle, borderStyle: 'dashed' }}>
          Affectations et salaire contractuel actuels. Paie filtrée par mois du bulletin et magasin actuel du salarié. CA des ventes validées uniquement. Les retenues d’inventaire et leur déduction sur bulletin représentent la même charge.
        </p>

        {start && end && start > end ? (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">
            La date de fin doit être postérieure à la date de début.
          </p>
        ) : fiches.map(fiche => {
          const rows = rowsFor(fiche);
          const visibleSales = rows.filter(row => row.kind === 'Vente' && row.status === 'VALIDATED');
          const userAdvances = rows.filter(row => row.kind === 'Avance').reduce((sum, row) => sum + row.amount, 0);
          const inventoryCharges = rows.filter(row => row.kind === 'Retenue inventaire').reduce((sum, row) => sum + row.amount, 0);

          return (
            <article key={fiche.user.id} className="overflow-hidden rounded-2xl border" style={panelStyle}>
              <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5" style={{ borderColor: 'var(--theme-border)' }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
                    {fiche.user.displayName.trim().split(/\s+/).slice(0, 2).map(name => name.charAt(0)).join('').toLocaleUpperCase('fr-FR')}
                  </div>
                  <div>
                    <h3 className="font-bold">{fiche.user.displayName}</h3>
                    <p className="mt-0.5 text-xs opacity-60">{fiche.user.email} · {fiche.user.roleId}</p>
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${fiche.user.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/15 opacity-75'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${fiche.user.isActive ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                      {fiche.user.isActive ? 'Compte actif' : 'Compte inactif'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:min-w-[300px]">
                  <div><p className="text-[11px] opacity-55">CA validé</p><p className="mt-1 text-xs font-bold">{money(visibleSales.reduce((sum, row) => sum + row.amount, 0))}</p></div>
                  <div><p className="text-[11px] opacity-55">Avances</p><p className="mt-1 text-xs font-bold">{money(userAdvances)}</p></div>
                  <div><p className="text-[11px] opacity-55">Retenues</p><p className="mt-1 text-xs font-bold">{money(inventoryCharges)}</p></div>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <div className="flex items-start gap-2.5 rounded-xl p-3" style={controlStyle}>
                  <StoreIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-xs font-semibold opacity-65">Magasins affectés</p>
                    <p className="mt-1 text-sm">{fiche.storeIds.map(storeName).join(', ') || 'Aucune affectation'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-xl p-3" style={controlStyle}>
                  <Wallet aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-xs font-semibold opacity-65">Salaire de base actuel</p>
                    <p className="mt-1 text-sm">
                      {fiche.employees.length
                        ? fiche.employees.map(employee => `${employee.first_name} ${employee.last_name} : ${employee.salary === undefined ? 'non renseigné' : money(employee.salary)}`).join(' ; ')
                        : 'Aucun salarié lié à ce compte'}
                    </p>
                  </div>
                </div>
              </div>

              {rows.length ? (
                <div className="overflow-x-auto border-t" style={{ borderColor: 'var(--theme-border)' }}>
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide opacity-55">
                        {columns.filter(column => column.key !== 'user').map(column => (
                          <th className="px-4 py-3 font-semibold" key={column.key}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.id} className="border-t transition hover:bg-white/[0.03]" style={{ borderColor: 'var(--theme-border)' }}>
                          {columns.filter(column => column.key !== 'user').map(column => (
                            <td className={`max-w-xs px-4 py-3 align-top ${column.key === 'amount' ? 'whitespace-nowrap font-semibold' : ''}`} key={column.key}>
                              {column.key === 'status' ? (
                                <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">{row.status}</span>
                              ) : column.value(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="border-t px-5 py-5 text-sm opacity-55" style={{ borderColor: 'var(--theme-border)' }}>Aucune opération pour ces filtres.</p>
              )}
            </article>
          );
        })}
        {!fiches.length && !(start && end && start > end) && (
          <div className="rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: 'var(--theme-border)' }}>
            <Users aria-hidden="true" className="mx-auto h-8 w-8 opacity-35" />
            <p className="mt-3 font-semibold">Aucun utilisateur trouvé</p>
            <p className="mt-1 text-sm opacity-60">Modifiez vos filtres ou réinitialisez la recherche.</p>
          </div>
        )}
      </div>
    </section>
  );
}
