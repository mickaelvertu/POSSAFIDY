import { useEffect, useMemo, useState } from "react";
import { AuditLog, AppUser, Store } from "../types";
import { subscribeUserConnections, UserConnection } from "../services/presenceService";
import { Search, ShieldAlert, X } from "lucide-react";

interface AuditViewProps {
  auditLogs: AuditLog[];
  stores: Store[];
  users: AppUser[];
  canViewConnectionStatus: boolean;
}

type ConnectionLoadState = "loading" | "ready" | "error";
type ConnectionFilter = "ALL" | "ONLINE" | "OFFLINE";

const CONNECTION_FRESHNESS_MS = 300_000;

function timestampToMillis(value: UserConnection["heartbeat_at"]): number {
  if (typeof value === "number") return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at", "device_id", "sale_id", "article_id", "seller_id", "verified_by", "validated_by", "store_id"]);

const MONEY_FIELDS = new Set(["subtotal", "discount", "tax", "total", "amount_paid", "change_returned", "unit_price", "amount", "price"]);

const VALUE_LABELS: Record<string, string> = {
  PAID: "Payé", PENDING: "En attente", PARTIAL: "Partiel", DRAFT: "Brouillon", VALIDATED: "Validée",
  VERIFIED: "Vérifiée", CANCELLED: "Annulée", CASH: "Espèces", PARTICULIER: "Particulier",
  REVENDEUR: "Revendeur", ENTREPRISE: "Entreprise"
};

const FIELD_LABELS: Record<string, string> = {
  sale_number: "N° de vente",
  customer_name: "Client",
  customer_phone: "Téléphone client",
  customer_type: "Type de client",
  seller_name: "Vendeur",
  verified_by_name: "Vérifié par",
  validated_by_name: "Validé par",
  lines: "Articles",
  subtotal: "Sous-total",
  discount: "Remise",
  tax: "Taxe",
  total: "Total",
  payment_method: "Mode de paiement",
  payment_status: "Statut du paiement",
  amount_paid: "Montant payé",
  change_returned: "Monnaie rendue",
  notes: "Notes",
  verified_at: "Vérifiée le",
  validated_at: "Validée le",
  article_name: "Article",
  article_code: "Code article",
  unit_price: "Prix unitaire",
  first_name: "Prénom",
  last_name: "Nom",
  email: "E-mail",
  code: "Code",
  position: "Poste",
  hire_date: "Date d'embauche",
  contract_type: "Type de contrat",
  is_active: "Actif",
  status: "Statut",
  role: "Rôle",
  name: "Nom",
  phone: "Téléphone",
  amount: "Montant",
  quantity: "Quantité",
  price: "Prix",
  store_id: "Magasin",
  deleted_at: "Supprimé le"
};

function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number" && MONEY_FIELDS.has(key)) return `${value.toLocaleString("fr-FR")} Ar`;
  if (typeof value === "number" && (key.endsWith("_at") || key.endsWith("_date") || key.startsWith("date"))) {
    return new Date(value).toLocaleString("fr-FR");
  }
  if (typeof value === "string") return VALUE_LABELS[value] ?? value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SaleLines({ lines }: { lines: Array<Record<string, unknown>> }) {
  if (lines.length === 0) return <span>—</span>;
  return (
    <ul className="mt-0.5 space-y-1">
      {lines.map((line, index) => (
        <li key={String(line.id ?? index)} className="rounded border border-current/20 px-1.5 py-1">
          <div className="font-semibold">{String(line.article_name ?? line.article_code ?? "Article")}</div>
          <div className="text-slate-500">
            {Number(line.quantity ?? 0).toLocaleString("fr-FR")} × {formatFieldValue("unit_price", line.unit_price)}
            {Number(line.discount) > 0 && ` − remise ${formatFieldValue("discount", line.discount)}`}
            {" = "}
            <span className="font-semibold">{formatFieldValue("total", line.total)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StateDetails({ value, other }: { value: unknown; other: unknown }) {
  if (!value || typeof value !== "object") return <span className="text-slate-400">—</span>;
  const record = value as Record<string, unknown>;
  const otherRecord = other && typeof other === "object" ? (other as Record<string, unknown>) : null;
  const keys = Object.keys(record)
    .filter(key => !HIDDEN_FIELDS.has(key))
    .filter(key => !otherRecord || JSON.stringify(record[key]) !== JSON.stringify(otherRecord[key]))
    .sort((left, right) => fieldLabel(left).localeCompare(fieldLabel(right), "fr"));
  if (keys.length === 0) return <span className="text-slate-400">Aucun changement</span>;
  return (
    <dl className="space-y-0.5">
      {keys.map(key => {
        const entry = record[key];
        const isLines = key === "lines" && Array.isArray(entry);
        return (
          <div key={key} className={isLines ? undefined : "flex gap-1.5"}>
            <dt className="font-semibold text-slate-500">{fieldLabel(key)} :</dt>
            <dd className="break-words">
              {isLines ? <SaleLines lines={entry as Array<Record<string, unknown>>} /> : formatFieldValue(key, entry)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "moins d'1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export default function AuditView({
  auditLogs,
  stores,
  users,
  canViewConnectionStatus
}: AuditViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState("ALL");
  const [selectedUser, setSelectedUser] = useState("ALL");
  const [selectedStore, setSelectedStore] = useState("ALL");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [connectionLoadState, setConnectionLoadState] = useState<ConnectionLoadState>(
    canViewConnectionStatus ? "loading" : "ready"
  );
  const [now, setNow] = useState(Date.now());
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewConnectionStatus) return;
    return subscribeUserConnections(
      entries => {
        setConnections(entries);
        setConnectionLoadState("ready");
        setConnectionError(null);
      },
      error => {
        console.error("Failed to load user connection status:", error);
        setConnectionLoadState("error");
        setConnectionError("Impossible de charger les statuts de connexion.");
      }
    );
  }, [canViewConnectionStatus]);

  useEffect(() => {
    if (!canViewConnectionStatus) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(intervalId);
  }, [canViewConnectionStatus]);

  const onlineUserIds = useMemo(() => {
    const activeIds = new Map<string, number>();
    for (const connection of connections) {
      if (now - timestampToMillis(connection.heartbeat_at) <= CONNECTION_FRESHNESS_MS) {
        const since = timestampToMillis(connection.connected_at) || now;
        const previous = activeIds.get(connection.user_id);
        activeIds.set(connection.user_id, previous === undefined ? since : Math.min(previous, since));
      }
    }
    return activeIds;
  }, [connections, now]);

  const entityTypes = useMemo(
    () => [...new Set(auditLogs.map(log => log.entity_type))].sort((left, right) => left.localeCompare(right, "fr")),
    [auditLogs]
  );
  const actions = useMemo(
    () => [...new Set(auditLogs.map(log => log.action))].sort((left, right) => left.localeCompare(right, "fr")),
    [auditLogs]
  );
  const onlineCount = users.filter(user => onlineUserIds.has(user.id)).length;

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("fr");
    const startTimestamp = startDate ? new Date(`${startDate}T00:00:00`).getTime() : undefined;
    const endTimestamp = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : undefined;

    return auditLogs.filter(log => {
      if (selectedEntity !== "ALL" && log.entity_type !== selectedEntity) return false;
      if (selectedUser !== "ALL" && log.user_id !== selectedUser) return false;
      if (selectedStore !== "ALL" && (
        selectedStore === "GLOBAL" ? Boolean(log.store_id) : log.store_id !== selectedStore
      )) return false;
      if (selectedAction !== "ALL" && log.action !== selectedAction) return false;
      if (startTimestamp !== undefined && log.created_at < startTimestamp) return false;
      if (endTimestamp !== undefined && log.created_at > endTimestamp) return false;
      if (
        canViewConnectionStatus &&
        connectionLoadState === "ready" &&
        connectionFilter !== "ALL" &&
        onlineUserIds.has(log.user_id) !== (connectionFilter === "ONLINE")
      ) return false;
      if (query) {
        const searchable = [
          log.action,
          log.user_name,
          log.entity_type,
          log.entity_id,
          log.device_id,
          log.store_id || ""
        ].join(" ").toLocaleLowerCase("fr");
        if (!searchable.includes(query)) return false;
      }
      return true;
    }).sort((left, right) => right.created_at - left.created_at);
  }, [
    auditLogs,
    canViewConnectionStatus,
    connectionFilter,
    connectionLoadState,
    endDate,
    onlineUserIds,
    searchQuery,
    selectedAction,
    selectedEntity,
    selectedStore,
    selectedUser,
    startDate
  ]);

  const hasFilters = Boolean(
    searchQuery || selectedEntity !== "ALL" || selectedUser !== "ALL" ||
    selectedStore !== "ALL" || selectedAction !== "ALL" || connectionFilter !== "ALL" ||
    startDate || endDate
  );
  const getStoreName = (id?: string) => {
    if (!id) return "Système global";
    return stores.find(store => store.id === id)?.name || id;
  };
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedEntity("ALL");
    setSelectedUser("ALL");
    setSelectedStore("ALL");
    setSelectedAction("ALL");
    setConnectionFilter("ALL");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-800" />
            <h2 className="text-lg font-bold text-slate-900">Audit global & connexions</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Historique des actions, filtrable par période, utilisateur, magasin, entité et état de connexion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 font-mono font-bold text-slate-600">
            {filteredLogs.length} / {auditLogs.length} événements
          </span>
          {canViewConnectionStatus && connectionLoadState === "ready" && (
            <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
              {onlineCount} utilisateur{onlineCount === 1 ? "" : "s"} en ligne
            </span>
          )}
        </div>
      </header>

      {connectionError && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {connectionError}
        </p>
      )}

      <section aria-label="Filtres d’audit" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative text-xs font-semibold text-slate-600">
          Recherche
          <Search className="absolute left-3 top-8 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Action, utilisateur, ID, appareil..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Utilisateur
          <select value={selectedUser} onChange={event => setSelectedUser(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900">
            <option value="ALL">Tous les utilisateurs</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Magasin
          <select value={selectedStore} onChange={event => setSelectedStore(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900">
            <option value="ALL">Tous les magasins</option>
            <option value="GLOBAL">Système global</option>
            {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Entité
          <select value={selectedEntity} onChange={event => setSelectedEntity(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900">
            <option value="ALL">Toutes les entités</option>
            {entityTypes.map(entity => <option key={entity} value={entity}>{entity}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Action
          <select value={selectedAction} onChange={event => setSelectedAction(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900">
            <option value="ALL">Toutes les actions</option>
            {actions.map(action => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Du
          <input type="date" value={startDate} max={endDate || undefined} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900" />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Au
          <input type="date" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900" />
        </label>
        {canViewConnectionStatus && (
          <label className="text-xs font-semibold text-slate-600">
            Connexion de l’utilisateur
            <select
              value={connectionFilter}
              onChange={event => setConnectionFilter(event.target.value as ConnectionFilter)}
              disabled={connectionLoadState !== "ready"}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 disabled:opacity-60"
            >
              <option value="ALL">Tous les états</option>
              <option value="ONLINE">En ligne</option>
              <option value="OFFLINE">Hors ligne</option>
            </select>
          </label>
        )}
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center justify-center gap-1 self-end rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            <X className="h-3.5 w-3.5" /> Effacer les filtres
          </button>
        )}
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                <th className="px-3 py-3">Horodatage</th>
                <th className="px-3 py-3">Utilisateur / connexion</th>
                <th className="px-3 py-3">Site / magasin</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Entité & ID</th>
                <th className="px-3 py-3">Appareil</th>
                <th className="px-3 py-3">État avant</th>
                <th className="px-3 py-3">État après</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500">
                    {new Date(log.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-900">{log.user_name}</div>
                    {canViewConnectionStatus && (
                      <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${connectionLoadState !== "ready" ? "text-slate-400" : onlineUserIds.has(log.user_id) ? "text-emerald-700" : "text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${connectionLoadState !== "ready" ? "bg-slate-300" : onlineUserIds.has(log.user_id) ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {connectionLoadState !== "ready" ? "Statut indisponible" : onlineUserIds.has(log.user_id) ? `En ligne depuis ${formatDuration(now - (onlineUserIds.get(log.user_id) ?? now))}` : "Hors ligne"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{getStoreName(log.store_id)}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono font-bold text-blue-700">{log.action}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    <span className="text-slate-500">{log.entity_type}</span>
                    <div className="font-bold text-slate-900">{log.entity_id}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-slate-500">{log.device_id || "—"}</td>
                  <td className="min-w-[200px] px-3 py-2.5 text-[11px] text-rose-700">
                    <StateDetails value={log.old_value} other={log.new_value} />
                  </td>
                  <td className="min-w-[200px] px-3 py-2.5 text-[11px] text-emerald-700">
                    <StateDetails value={log.new_value} other={log.old_value} />
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Aucun événement ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
