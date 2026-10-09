import { useMemo, useState } from 'react';
import type { Store } from '../types';
import { buildUserAudit, UserAuditData } from '../services/userAuditReport';
import { downloadReportCsv, ReportColumn } from '../services/reportColumns';

type Props = UserAuditData & { stores: Store[] };
const money = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;
const date = (timestamp: number) => new Date(timestamp).toLocaleDateString('fr-FR');
const inputClass = 'rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900';
const kinds = ['Vente', 'Avance', 'Bulletin de paie', 'Retenue inventaire'];
interface Row { id: string; user: string; date: string; kind: string; reference: string; store: string; status: string; amount: number; detail: string }
const columns: ReportColumn<Row>[] = ['user', 'date', 'kind', 'reference', 'store', 'status', 'amount', 'detail'].map((key, index) => ({ key, label: ['Utilisateur', 'Date / période', 'Opération', 'Référence', 'Magasin', 'Statut', 'Montant (Ar)', 'Détail'][index], value: row => row[key as keyof Row] }));

export default function UserAuditReport(props: Props) {
  const [userId, setUserId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const fiches = useMemo(() => buildUserAudit(props, { userId, storeId, start, end }), [props, userId, storeId, start, end]);
  const storeName = (id: string) => props.stores.find(store => store.id === id)?.name || id;
  const rowsFor = (fiche: typeof fiches[number]): Row[] => {
    const common = { user: fiche.user.displayName };
    return [
      ...fiche.sales.map(sale => ({ ...common, id: `sale-${sale.id}`, date: date(sale.created_at), kind: 'Vente', reference: sale.sale_number, store: storeName(sale.store_id), status: sale.status, amount: sale.total, detail: sale.customer_name })),
      ...fiche.advances.map(advance => ({ ...common, id: `advance-${advance.id}`, date: date(advance.advance_date), kind: 'Avance', reference: advance.id, store: storeName(fiche.employees.find(employee => employee.id === advance.employee_id)?.store_id || ''), status: advance.status, amount: advance.amount, detail: advance.reason || '' })),
      ...fiche.payslips.map(slip => ({ ...common, id: `pay-${slip.id}`, date: slip.period, kind: 'Bulletin de paie', reference: slip.id, store: storeName(fiche.employees.find(employee => employee.id === slip.employee_id)?.store_id || ''), status: slip.payment_status, amount: slip.net_salary, detail: `Base : ${money(slip.base_salary)} ; primes : ${money(slip.bonuses)} ; retenues : ${money(slip.deductions)} ; avances déduites : ${money(slip.advances_deducted || 0)} ; inventaire déduit : ${money(slip.inventory_charges_deducted || 0)}` })),
      ...fiche.counts.map(count => ({ ...common, id: `count-${count.id}`, date: date(count.reviewed_at ?? count.updated_at), kind: 'Retenue inventaire', reference: count.count_number, store: storeName(count.store_id), status: count.charge_settlement ? 'DEDUCTED' : 'OUTSTANDING', amount: count.total_charged_amount || 0, detail: count.review_note || count.notes || '' }))
    ].filter(row => (!kind || row.kind === kind) && (!status || row.status === status) && (!search || `${row.user} ${row.reference} ${row.detail}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR'))));
  };
  const allRows = fiches.flatMap(rowsFor);
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">N° 15 — Fiche d’audit par utilisateur</h3><div className="flex gap-3 print:hidden"><button type="button" onClick={() => downloadReportCsv('audit-utilisateurs.csv', columns, allRows)}>Exporter CSV</button><button type="button" onClick={() => window.print()}>Imprimer / PDF</button></div></div>
    <div className="grid gap-3 sm:grid-cols-3 print:hidden">
      <label>Utilisateur<select className={`${inputClass} w-full`} value={userId} onChange={event => setUserId(event.target.value)}><option value="">Tous les utilisateurs</option>{props.users.map(user => <option key={user.id} value={user.id}>{user.displayName} — {user.email}</option>)}</select></label>
      <label>Magasin<select className={`${inputClass} w-full`} value={storeId} onChange={event => setStoreId(event.target.value)}><option value="">Tous les magasins</option>{props.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Opération<select className={`${inputClass} w-full`} value={kind} onChange={event => setKind(event.target.value)}><option value="">Toutes les opérations</option>{kinds.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Du<input className={`${inputClass} w-full`} type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Au<input className={`${inputClass} w-full`} type="date" min={start} value={end} onChange={event => setEnd(event.target.value)} /></label>
      <label>Statut<select className={`${inputClass} w-full`} value={status} onChange={event => setStatus(event.target.value)}><option value="">Tous les statuts</option>{['DRAFT', 'CHECKING', 'VERIFIED', 'VALIDATED', 'CANCELLED', 'REFUNDED', 'OUTSTANDING', 'DEDUCTED', 'PENDING', 'PAID'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Recherche<input className={`${inputClass} w-full`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Utilisateur, référence, motif…" /></label>
      <button type="button" onClick={() => { setUserId(''); setStoreId(''); setStart(''); setEnd(''); setKind(''); setStatus(''); setSearch(''); }}>Réinitialiser</button>
    </div>
    <div className="printable-document space-y-4">
      <h2 className="font-bold">GILEADA — Audit des utilisateurs</h2>
      <p className="text-xs text-slate-500">Période : {start || 'sans limite'} → {end || 'sans limite'} · Magasin : {storeId ? storeName(storeId) : 'tous'} · Opération : {kind || 'toutes'} · Statut : {status || 'tous'} · Recherche : {search || 'aucune'}</p>
      <p className="text-xs text-slate-500">Affectations et salaire contractuel actuels. Paie filtrée par mois du bulletin et magasin actuel du salarié. CA des ventes validées uniquement. Les retenues d’inventaire et leur déduction sur bulletin représentent la même charge.</p>
      {start && end && start > end ? <p role="alert">La date de fin doit être postérieure à la date de début.</p> : fiches.map(fiche => {
        const rows = rowsFor(fiche);
        const visibleSales = rows.filter(row => row.kind === 'Vente' && row.status === 'VALIDATED');
        return <article key={fiche.user.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="font-bold">{fiche.user.displayName} — {fiche.user.roleId}</h3><p className="text-xs">{fiche.user.email} · {fiche.user.isActive ? 'Actif' : 'Inactif'}</p>
          <p className="text-sm">Magasins affectés : {fiche.storeIds.map(storeName).join(', ') || 'Aucune affectation'}</p>
          <p className="text-sm">Salaire de base actuel : {fiche.employees.length ? fiche.employees.map(employee => `${employee.first_name} ${employee.last_name} : ${employee.salary === undefined ? 'non renseigné' : money(employee.salary)}`).join(' ; ') : 'Aucun salarié lié à ce compte'}</p>
          <p className="text-sm font-semibold">CA validé : {money(visibleSales.reduce((sum, row) => sum + row.amount, 0))} · Avances : {money(rows.filter(row => row.kind === 'Avance').reduce((sum, row) => sum + row.amount, 0))} · Retenues inventaire : {money(rows.filter(row => row.kind === 'Retenue inventaire').reduce((sum, row) => sum + row.amount, 0))}</p>
          {rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{columns.filter(column => column.key !== 'user').map(column => <th className="border-b p-2" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>{columns.filter(column => column.key !== 'user').map(column => <td className="border-b p-2" key={column.key}>{column.value(row)}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Aucune opération pour ces filtres.</p>}
        </article>;
      })}
      {!fiches.length && <p>Aucun utilisateur pour ces filtres.</p>}
    </div>
  </section>;
}
