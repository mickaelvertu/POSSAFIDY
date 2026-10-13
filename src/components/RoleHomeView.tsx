import { useState } from "react";
import { AppUser, AuditLog, Expense, Sale, Store } from "../types";
import { hasPermission } from "../services/authService";
import MyInfoView from "./MyInfoView";
import {
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  HandCoins,
  PackageCheck,
  Receipt,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  X
} from "lucide-react";

interface RoleHomeViewProps {
  user: AppUser;
  onOpenUsers: () => void;
  onOpenSales: () => void;
  onOpenStocks: () => void;
  onOpenProduction: () => void;
  onOpenStores: () => void;
  onOpenCatalog: () => void;
  onOpenProcurement: () => void;
  onOpenExpenses: () => void;
  onOpenTransfers: () => void;
  onOpenCredit: () => void;
  onOpenResellerOrders: () => void;
  pendingResellerOrders: number;
  onOpenUnits: () => void;
  onOpenStaff: () => void;
  onOpenReports: () => void;
  onOpenAudit: () => void;
  onOpenInventory: () => void;
  stores: Store[];
  sales: Sale[];
  expenses: Expense[];
  auditLogs: AuditLog[];
}

type AuditCategory = "SALE" | "TRANSFER" | "INVENTORY" | "PRODUCTION" | "EXPENSE" | "DEPOT";
type AuditPeriod = "HOUR" | "FOUR_HOURS" | "TODAY" | "WEEK";

const auditCategoryLabels: Record<AuditCategory, string> = {
  SALE: "Vente",
  TRANSFER: "Transfert",
  INVENTORY: "Inventaire",
  PRODUCTION: "Production",
  EXPENSE: "Dépense",
  DEPOT: "Dépôt"
};

const auditCategoryCodes: Record<AuditCategory, string> = {
  SALE: "VTE",
  TRANSFER: "TRF",
  INVENTORY: "INV",
  PRODUCTION: "PRD",
  EXPENSE: "EXP",
  DEPOT: "DEP"
};

const auditActionLabels: Record<string, string> = {
  SALE_CREATED: "Vente créée",
  SALE_DRAFT_UPDATED: "Brouillon de vente modifié",
  SALE_DRAFT_DELETED: "Brouillon de vente supprimé",
  SALE_CHECKING: "Vente en vérification",
  SALE_VERIFIED: "Vente vérifiée",
  SALE_APPROVED: "Demande revendeur approuvée",
  SALE_SHIPPED: "Vente revendeur expédiée",
  SALE_VALIDATED: "Vente validée",
  SALE_CANCELLED: "Vente annulée",
  TRANSFER_CREATED: "Transfert créé",
  TRANSFER_DRAFT_UPDATED: "Brouillon de transfert modifié",
  TRANSFER_DRAFT_DELETED: "Brouillon de transfert supprimé",
  TRANSFER_APPROVED_DELETED: "Transfert approuvé supprimé (non expédié)",
  TRANSFER_APPROVED: "Transfert approuvé",
  TRANSFER_REJECTED: "Transfert refusé",
  TRANSFER_SHIPPED: "Transfert expédié",
  TRANSFER_RECEIVED: "Transfert réceptionné",
  TRANSFER_DISCREPANCY_RECORDED: "Écart de transfert signalé",
  TRANSFER_DISCREPANCY_RESOLVED: "Écart de transfert résolu",
  CREDIT_CUSTOMER_UPDATED: "Compte revendeur modifié",
  CREDIT_PAYMENT_RECORDED: "Règlement revendeur enregistré",
  CREDIT_FOLLOW_UP_RECORDED: "Relance revendeur consignée",
  PRODUCTION_DRAFT_UPDATED: "Brouillon de production modifié",
  PRODUCTION_DRAFT_DELETED: "Brouillon de production supprimé",
  EXPENSE_CREATED: "Brouillon de dépense créé",
  EXPENSE_DRAFT_UPDATED: "Brouillon de dépense modifié",
  EXPENSE_VALIDATED: "Dépense validée",
  EXPENSE_DELETED: "Dépense supprimée",
  STOCK_ADJUSTED: "Stock ajusté",
  PURCHASE_RECEIVED: "Dépôt réceptionné"
};

const auditDetailHiddenFields = new Set(["id", "created_at", "updated_at", "device_id", "sale_id", "article_id", "seller_id", "verified_by", "validated_by"]);
const auditDetailFieldLabels: Record<string, string> = {
  sale_number: "N° de vente",
  transfer_number: "N° de transfert",
  purchase_number: "N° de dépôt",
  expense_number: "N° de dépense",
  reference_number: "Référence",
  invoice_number: "N° de facture",
  customer_name: "Client",
  customer_phone: "Téléphone",
  customer_type: "Type de client",
  seller_name: "Vendeur",
  amount: "Montant",
  total: "Total",
  quantity: "Quantité",
  quantity_sent: "Quantité expédiée",
  quantity_received: "Quantité reçue",
  before_quantity: "Quantité avant",
  after_quantity: "Quantité après",
  payment_method: "Mode de paiement",
  payment_status: "Statut du paiement",
  status: "Statut",
  reason: "Motif",
  notes: "Notes",
  description: "Description"
};

function getAuditCategory(log: AuditLog): AuditCategory | null {
  switch (log.entity_type.toUpperCase()) {
    case "SALE":
      return "SALE";
    case "TRANSFER":
    case "STOCK_TRANSFER":
    case "MOVEMENT":
      return "TRANSFER";
    case "INVENTORY_COUNT":
      return "INVENTORY";
    case "PRODUCTION":
      return "PRODUCTION";
    case "EXPENSE":
      return "EXPENSE";
    case "STOCK":
    case "STOCK_DEPOSIT":
    case "PURCHASE":
      return "DEPOT";
    default:
      return null;
  }
}

function getAuditDescription(log: AuditLog): string {
  const value = log.new_value && typeof log.new_value === "object"
    ? log.new_value as Record<string, unknown>
    : log.old_value && typeof log.old_value === "object"
      ? log.old_value as Record<string, unknown>
      : {};
  const reference = [
    value.sale_number,
    value.transfer_number,
    value.purchase_number,
    value.expense_number,
    value.reference_number,
    value.invoice_number,
    value.customer_name,
    value.reason,
    value.notes
  ].find(entry => typeof entry === "string" && entry.trim());
  return typeof reference === "string" ? reference : `Réf. ${log.entity_id}`;
}

function auditDetailLabel(field: string): string {
  if (auditDetailFieldLabels[field]) return auditDetailFieldLabels[field];
  const label = field.replace(/_/g, " ");
  return label.charAt(0).toLocaleUpperCase("fr") + label.slice(1);
}

function formatAuditDetailValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number" && ["amount", "total", "subtotal", "discount", "tax", "unit_price", "price"].includes(field)) {
    return `${value.toLocaleString("fr-FR")} Ar`;
  }
  if (typeof value === "number" && (field.endsWith("_at") || field.endsWith("_date"))) {
    return new Date(value).toLocaleString("fr-FR");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function AuditDetailLines({ lines }: { lines: unknown[] }) {
  if (lines.length === 0) return <span>—</span>;
  return (
    <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg bg-slate-50 text-xs">
      {lines.map((line, index) => {
        const item = (line && typeof line === "object" ? line : {}) as Record<string, unknown>;
        const name = String(item.article_name ?? item.article_code ?? item.name ?? `Ligne ${index + 1}`);
        const hasPrice = typeof item.unit_price === "number";
        const quantity = item.quantity ?? item.quantity_sent;
        return (
          <li key={String(item.id ?? index)} className="flex items-center justify-between gap-3 px-2 py-1.5">
            <span className="min-w-0 truncate font-semibold text-slate-800">{name}</span>
            <span className="shrink-0 text-slate-600">
              {quantity !== undefined && `${Number(quantity).toLocaleString("fr-FR")}`}
              {hasPrice && ` × ${(item.unit_price as number).toLocaleString("fr-FR")}`}
              {typeof item.total === "number" && <strong className="ml-1 text-slate-900">= {item.total.toLocaleString("fr-FR")} Ar</strong>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AuditDetailValues({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return <p className="text-sm text-slate-500">{formatAuditDetailValue("", value)}</p>;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([field]) => !auditDetailHiddenFields.has(field));
  if (entries.length === 0) return <p className="text-sm text-slate-500">Aucun détail disponible.</p>;
  return (
    <dl className="space-y-2">
      {entries.map(([field, entry]) => (
        <div key={field} className="grid gap-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0 sm:grid-cols-[minmax(8rem,0.35fr)_1fr]">
          <dt className="text-xs font-semibold text-slate-500">{auditDetailLabel(field)}</dt>
          <dd className="break-words text-sm text-slate-800">
            {Array.isArray(entry)
              ? <AuditDetailLines lines={entry} />
              : typeof entry === "object" && entry !== null
                ? Object.entries(entry as Record<string, unknown>)
                    .filter(([key, nested]) => !auditDetailHiddenFields.has(key) && (typeof nested !== "object" || nested === null))
                    .map(([key, nested]) => `${auditDetailLabel(key)} : ${formatAuditDetailValue(key, nested)}`)
                    .join(" · ") || "—"
                : formatAuditDetailValue(field, entry)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  VENDEUR: "Vendeur POS",
  MAGASINIER: "Magasinier",
  RESPONSABLE_MAGASIN: "Responsable magasin",
  CONTROLEUR: "Contrôleur",
  PRODUCTION: "Responsable production",
  COMPTABLE: "Comptable",
  GESTIONNAIRE_CREDIT: "Gestionnaire crédit",
  STAFF: "Staff",
  REVENDEUR: "Revendeur"
};

const roleDescriptions: Record<string, string> = {
  SUPER_ADMIN: "Pilotage complet des opérations, des accès et des magasins.",
  ADMIN: "Supervision opérationnelle et administration des utilisateurs.",
  VENDEUR: "Accès rapide à la caisse, aux articles et au stock de votre magasin.",
  MAGASINIER: "Suivi du stock et préparation des flux entre magasins.",
  RESPONSABLE_MAGASIN: "Pilotage des ventes, du stock et des transferts de votre magasin.",
  CONTROLEUR: "Comptage physique des magasins assignés et contrôle des stocks.",
  PRODUCTION: "Suivi des ordres de production et des matières premières.",
  COMPTABLE: "Contrôle des ventes, des indicateurs et des rapports.",
  GESTIONNAIRE_CREDIT: "Gestion des comptes revendeurs, plafonds, règlements et relances.",
  STAFF: "Bienvenue dans votre espace collaborateur : retrouvez votre profil, vos magasins et les informations de l'équipe.",
  REVENDEUR: "Votre demande de compte revendeur est en cours d'examen."
};

const accessCards = [
  { permission: "sales.view", title: "Ventes & caisse", description: "Consulter et gérer les ventes", icon: ShoppingCart, accent: "emerald" },
  { permission: "credit.manage", title: "Crédits revendeurs", description: "Gérer les plafonds, échéances, paiements et relances", icon: HandCoins, accent: "teal" },
  { permission: "reseller.orders", title: "Commandes revendeurs", description: "Examiner les commandes et notifier les décisions", icon: ShoppingCart, accent: "amber", adminOnly: true },
  { permission: "stock.view", title: "Stocks", description: "Suivre les disponibilités par magasin", icon: Boxes, accent: "blue" },
  { permission: "inventory.control", title: "Contrôle d'inventaire", description: "Compter le stock, justifier les écarts et valider les ajustements", icon: ClipboardList, accent: "teal" },
  { permission: "transfers.view", title: "Transferts", description: "Suivre les mouvements inter-magasins", icon: ArrowRightLeft, accent: "amber" },
  { permission: "production.view", title: "Production", description: "Suivre les fabrications et consommations", icon: Factory, accent: "indigo" },
  { permission: "reports.view", title: "Rapports", description: "Analyser les performances et les écarts", icon: BarChart3, accent: "violet" },
  { permission: "audit.view", title: "Audit & connexions", description: "Consulter les actions et l’état de connexion des utilisateurs", icon: ClipboardList, accent: "rose", adminOnly: true },
  { permission: "users.view", title: "Utilisateurs", description: "Attribuer les rôles et les accès", icon: Users, accent: "rose", adminOnly: true },
  { permission: "stores.manage", title: "Magasins", description: "Créer et administrer les sites", icon: Building2, accent: "blue" },
  { permission: "catalog.manage", title: "Articles & catégories", description: "Gérer les articles et leur classification", icon: PackageCheck, accent: "indigo" },
  { permission: "procurement.manage", title: "Achats & fournisseurs", description: "Réceptionner les achats et suivre les échéances", icon: Truck, accent: "emerald" },
  { permission: "expenses.view", title: "Dépenses & frais", description: "Suivre les loyers, factures et autres charges", icon: HandCoins, accent: "amber" },
  { permission: "units.manage", title: "Unités de mesure", description: "Administrer les unités du catalogue", icon: Ruler, accent: "emerald" },
  { permission: "staff.manage", title: "Personnel", description: "Gérer les employés, affectations et contrats", icon: UserRound, accent: "violet" }
];

const accentClasses: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200"
};

export default function RoleHomeView({ user, onOpenUsers, onOpenSales, onOpenStocks, onOpenProduction, onOpenStores, onOpenCatalog, onOpenProcurement, onOpenExpenses, onOpenTransfers, onOpenCredit, onOpenResellerOrders, pendingResellerOrders, onOpenUnits, onOpenStaff, onOpenReports, onOpenAudit, onOpenInventory, stores, sales, expenses, auditLogs }: RoleHomeViewProps) {
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriod>("WEEK");
  const [auditCategory, setAuditCategory] = useState<AuditCategory | "ALL">("ALL");
  const [showAllAuditLogs, setShowAllAuditLogs] = useState(false);
  const role = user.role || "UNASSIGNED";
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const pointOfSales = stores.filter(store => store.store_type === "POS" && store.is_active);
  const staffStores = stores.filter(store => store.is_active && user.storeIds.includes(store.id));
  const resellerStores = stores.filter(store => store.store_type === "RESELLER" && store.is_active);
  const today = new Date();
  const isToday = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  };
  const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
  const storeTypeLabel = (store: Store) => store.store_type === "POS"
    ? "Point de vente"
    : store.store_type === "RESELLER"
      ? "Revendeur"
      : store.store_type === "CENTRAL_WAREHOUSE"
        ? "Dépôt central"
        : "Production";
  const availableCards = accessCards.filter(card => {
    if (card.permission === "reseller.orders") return isAdmin;
    if (card.permission === "inventory.control") return isAdmin || role === "RESPONSABLE_MAGASIN" || hasPermission(user, "inventory.count") || hasPermission(user, "inventory.review");
    if (card.permission === "stores.manage" || card.permission === "catalog.manage" || card.permission === "procurement.manage" || card.permission === "units.manage" || card.permission === "staff.manage") return isAdmin;
    if (card.permission === "expenses.view") return isAdmin || hasPermission(user, "expenses.view") || hasPermission(user, "expenses.create");
    if (card.permission === "transfers.view" && isAdmin) return true;
    if (card.permission === "reports.view" && isAdmin) return true;
    if (card.permission === "credit.manage" && isAdmin) return true;
    if (card.adminOnly && !hasPermission(user, "users.view")) return false;
    if (card.permission === "audit.view" && !isAdmin) return false;
    return hasPermission(user, card.permission);
  });
  const now = Date.now();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const periodStart = auditPeriod === "HOUR"
    ? now - 60 * 60 * 1000
    : auditPeriod === "FOUR_HOURS"
      ? now - 4 * 60 * 60 * 1000
      : auditPeriod === "TODAY"
        ? startOfToday
        : now - 7 * 24 * 60 * 60 * 1000;
  const filteredAuditLogs = auditLogs
    .filter(log => getAuditCategory(log) !== null)
    .filter(log => log.created_at >= periodStart && log.created_at <= now)
    .filter(log => auditCategory === "ALL" || getAuditCategory(log) === auditCategory)
    .sort((left, right) => right.created_at - left.created_at);
  const displayedAuditLogs = showAllAuditLogs ? filteredAuditLogs : filteredAuditLogs.slice(0, 5);

  return (
    <section className="space-y-5">
      <div className="theme-hero rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-lg sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Accueil personnalisé
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Bonjour, {user.firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {roleDescriptions[role] || "Votre compte attend encore l'attribution d'un rôle."}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Rôle attribué</p>
            <p className="mt-1 text-sm font-bold text-white">{roleLabels[role] || "Non attribué"}</p>
          </div>
        </div>

        <div className="mt-6 flex text-xs text-slate-300">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <Building2 className="h-4 w-4 text-blue-300" />
            <span>{user.storeIds.length ? `${user.storeIds.length} magasin(s) assigné(s)` : "Tous les magasins"}</span>
          </div>
        </div>
      </div>

      {role === "STAFF" && (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Mon profil</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Nom</dt><dd className="font-bold text-slate-900">{user.displayName || `${user.firstName} ${user.lastName}`}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Identifiant</dt><dd className="font-mono font-semibold text-slate-700">{user.code || user.username}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">E-mail</dt><dd className="font-semibold text-slate-700">{user.email}</dd></div>
              {user.phone && <div className="flex justify-between gap-3"><dt className="text-slate-500">Téléphone</dt><dd className="font-semibold text-slate-700">{user.phone}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Statut</dt><dd className={`rounded-full px-2 py-0.5 font-bold ${user.isActive ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{user.isActive ? "Actif" : "Inactif"}</dd></div>
              {user.lastLoginAt && <div className="flex justify-between gap-3"><dt className="text-slate-500">Dernière connexion</dt><dd className="font-semibold text-slate-700">{new Date(user.lastLoginAt).toLocaleString("fr-FR")}</dd></div>}
            </dl>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Mes lieux de travail</h2>
            {staffStores.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Aucun magasin ne vous est encore affecté.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {staffStores.map(store => (
                  <li key={store.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-bold text-slate-900">{store.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">{store.code} · {storeTypeLabel(store)}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
          {user.isActive && <MyInfoView user={user} />}
          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-xs text-sky-900 md:col-span-2">
            <p className="font-bold">Accès limité</p>
            <p className="mt-1">Votre compte Staff est actif mais ne donne accès à aucun module de gestion. Pour obtenir de nouveaux droits (ventes, stock, transferts…), demandez à un administrateur de vous attribuer un rôle.</p>
          </article>
        </section>
      )}

      {role !== "STAFF" && role !== "SUPER_ADMIN" && user.isActive && role !== "REVENDEUR" && <MyInfoView user={user} />}

      {isAdmin && pointOfSales.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Performance du jour par point de vente</h2>
              <p className="text-xs text-slate-500">Chiffre d’affaires validé, dépenses enregistrées et solde net.</p>
            </div>
            <span className="hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:block">Défiler horizontalement</span>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {pointOfSales.map(store => {
              const dailySales = sales
                .filter(sale => sale.store_id === store.id && sale.status === "VALIDATED" && isToday(sale.created_at))
                .reduce((total, sale) => total + sale.total, 0);
              const dailyExpenses = expenses
                .filter(expense => expense.status !== "DRAFT" && expense.store_id === store.id && isToday(expense.expense_date))
                .reduce((total, expense) => total + expense.amount, 0);
              return (
                <article
                  key={store.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Afficher les informations du magasin ${store.name}`}
                  onClick={() => { setExpandedItem(null); setSelectedStore(store); }}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedStore(store);
                    }
                  }}
                  className="min-w-[285px] snap-start cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:min-w-[320px]"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{store.name}</p>
                      <p className="mt-1 text-[11px] font-mono font-semibold text-slate-500">{store.code} · Point de vente</p>
                    </div>
                    <Building2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">CA du jour</dt><dd className="font-bold text-emerald-700">{money(dailySales)}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Dépenses du jour</dt><dd className="font-bold text-rose-600">{money(dailyExpenses)}</dd></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2"><dt className="font-bold text-slate-700">CA - dépenses</dt><dd className={`font-black ${dailySales - dailyExpenses >= 0 ? "text-blue-700" : "text-rose-700"}`}>{money(dailySales - dailyExpenses)}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {isAdmin && resellerStores.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Performance du jour par revendeur</h2>
              <p className="text-xs text-slate-500">Chiffre d’affaires validé, dépenses enregistrées et solde net.</p>
            </div>
            <span className="hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:block">Défiler horizontalement</span>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {resellerStores.map(store => {
              const dailySales = sales
                .filter(sale => sale.store_id === store.id && sale.status === "VALIDATED" && isToday(sale.created_at))
                .reduce((total, sale) => total + sale.total, 0);
              const dailyExpenses = expenses
                .filter(expense => expense.status !== "DRAFT" && expense.store_id === store.id && isToday(expense.expense_date))
                .reduce((total, expense) => total + expense.amount, 0);
              return (
                <article
                  key={store.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Afficher les informations du magasin ${store.name}`}
                  onClick={() => { setExpandedItem(null); setSelectedStore(store); }}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedStore(store);
                    }
                  }}
                  className="min-w-[285px] snap-start cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500 sm:min-w-[320px]"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{store.name}</p>
                      <p className="mt-1 text-[11px] font-mono font-semibold text-slate-500">{store.code} · Revendeur</p>
                    </div>
                    <Building2 className="h-5 w-5 shrink-0 text-amber-600" />
                  </div>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">CA du jour</dt><dd className="font-bold text-emerald-700">{money(dailySales)}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Dépenses du jour</dt><dd className="font-bold text-rose-600">{money(dailyExpenses)}</dd></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2"><dt className="font-bold text-slate-700">CA - dépenses</dt><dd className={`font-black ${dailySales - dailyExpenses >= 0 ? "text-blue-700" : "text-rose-700"}`}>{money(dailySales - dailyExpenses)}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Activité récente</h2>
              <p className="text-xs text-slate-500">Ventes, transferts, inventaires, dépôts et dépenses · {filteredAuditLogs.length} événement(s)</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <label className="text-xs font-semibold text-slate-600">
                Période
                <select
                  value={auditPeriod}
                  onChange={event => { setAuditPeriod(event.target.value as AuditPeriod); setShowAllAuditLogs(false); }}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="HOUR">Dernière heure</option>
                  <option value="FOUR_HOURS">4 dernières heures</option>
                  <option value="TODAY">Aujourd’hui</option>
                  <option value="WEEK">7 derniers jours</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
            {(["ALL", ...Object.keys(auditCategoryLabels)] as Array<AuditCategory | "ALL">).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={auditCategory === option}
                title={option === "ALL" ? "Toutes les catégories" : auditCategoryLabels[option]}
                onClick={() => { setAuditCategory(option); setShowAllAuditLogs(false); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${auditCategory === option ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"}`}
              >
                {option === "ALL" ? "TOUS" : auditCategoryCodes[option]}
              </button>
            ))}
          </div>
          {filteredAuditLogs.length > 0 ? (
            <>
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {displayedAuditLogs.map(log => {
                  const category = getAuditCategory(log);
                  if (!category) return null;
                  const storeName = stores.find(store => store.id === log.store_id)?.name;
                  return (
                    <li key={log.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAuditLog(log)}
                        className="flex w-full flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:flex-row sm:items-center sm:justify-between"
                        aria-label={`Afficher le détail : ${auditActionLabels[log.action] || log.action}, ${getAuditDescription(log)}`}
                      >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">{auditCategoryLabels[category]}</span>
                          <span className="text-sm font-bold text-slate-800">{auditActionLabels[log.action] || log.action.replace(/_/g, " ")}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-600">{getAuditDescription(log)}{storeName ? ` · ${storeName}` : ""}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Par {log.user_name || "Utilisateur"}</p>
                      </div>
                      <time className="shrink-0 text-xs font-medium text-slate-500" dateTime={new Date(log.created_at).toISOString()}>
                        {new Date(log.created_at).toLocaleString("fr-FR")}
                      </time>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filteredAuditLogs.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllAuditLogs(current => !current)}
                  className="mt-3 text-sm font-bold text-emerald-700 hover:text-emerald-800"
                >
                  {showAllAuditLogs ? "Afficher les 5 plus récents" : `Afficher tous les événements (${filteredAuditLogs.length})`}
                </button>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Aucune activité pour cette période et cette catégorie.</p>
          )}
        </section>
      )}

      {availableCards.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vos espaces de travail</h2>
            </div>
            <Receipt className="hidden h-5 w-5 text-slate-400 sm:block" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {availableCards.map(card => {
              const Icon = card.icon;
              const isUsersCard = card.title === "Utilisateurs";
              const isSalesCard = card.permission === "sales.view";
              const isStockCard = card.permission === "stock.view";
              const isProductionCard = card.permission === "production.view";
              const isStoresCard = card.permission === "stores.manage";
              const isCatalogCard = card.permission === "catalog.manage";
              const isProcurementCard = card.permission === "procurement.manage";
              const isExpensesCard = card.permission === "expenses.view";
              const isTransfersCard = card.permission === "transfers.view";
              const isCreditCard = card.permission === "credit.manage";
              const isUnitsCard = card.permission === "units.manage";
              const isReportsCard = card.permission === "reports.view";
              const isAuditCard = card.permission === "audit.view";
              const isStaffCard = card.permission === "staff.manage";
              const isResellerOrdersCard = card.permission === "reseller.orders";
              const isInventoryCard = card.permission === "inventory.control";
              const isActionable = isInventoryCard || isResellerOrdersCard || isUsersCard || isSalesCard || isStockCard || isProductionCard || isStoresCard || isCatalogCard || isProcurementCard || isExpensesCard || isTransfersCard || isCreditCard || isUnitsCard || isStaffCard || isReportsCard || isAuditCard;
              return (
                <button
                  key={card.permission}
                  type="button"
                  onClick={isInventoryCard ? onOpenInventory : isResellerOrdersCard ? onOpenResellerOrders : isUsersCard ? onOpenUsers : isSalesCard ? onOpenSales : isStockCard ? onOpenStocks : isProductionCard ? onOpenProduction : isStoresCard ? onOpenStores : isCatalogCard ? onOpenCatalog : isProcurementCard ? onOpenProcurement : isExpensesCard ? onOpenExpenses : isTransfersCard ? onOpenTransfers : isCreditCard ? onOpenCredit : isUnitsCard ? onOpenUnits : isStaffCard ? onOpenStaff : isReportsCard ? onOpenReports : isAuditCard ? onOpenAudit : undefined}
                  disabled={!isActionable}
                  className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-slate-300 enabled:hover:shadow-md disabled:cursor-default"
                >
                  <span className={`rounded-xl border p-2.5 ${accentClasses[card.accent]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      {card.title}
                      {isResellerOrdersCard && pendingResellerOrders > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{pendingResellerOrders}</span>}
                      {isUsersCard && <span className="text-[10px] font-semibold uppercase text-rose-600">Admin</span>}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{card.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Votre compte est actif, mais aucun rôle métier ne lui a encore été attribué. Un administrateur doit configurer vos permissions.
        </div>
      )}

      {selectedAuditLog && (() => {
        const category = getAuditCategory(selectedAuditLog);
        const storeName = stores.find(store => store.id === selectedAuditLog.store_id)?.name;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setSelectedAuditLog(null)}
            onKeyDown={event => {
              if (event.key === "Escape") setSelectedAuditLog(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-detail-title"
              className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6"
              onClick={event => event.stopPropagation()}
            >
              <header className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {category && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">{auditCategoryLabels[category]}</span>}
                    <span className="text-xs text-slate-500">{new Date(selectedAuditLog.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  <h2 id="audit-detail-title" className="text-lg font-black text-slate-900">
                    {auditActionLabels[selectedAuditLog.action] || selectedAuditLog.action.replace(/_/g, " ")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{getAuditDescription(selectedAuditLog)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Fermer les détails"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <dl className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-slate-500">Utilisateur</dt><dd className="mt-0.5 font-medium text-slate-800">{selectedAuditLog.user_name || "Utilisateur"}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">Magasin</dt><dd className="mt-0.5 font-medium text-slate-800">{storeName || "Système global"}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">Entité</dt><dd className="mt-0.5 font-medium text-slate-800">{selectedAuditLog.entity_type}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">Identifiant</dt><dd className="mt-0.5 break-all font-mono text-xs text-slate-700">{selectedAuditLog.entity_id}</dd></div>
              </dl>
              <div className="space-y-4">
                <section className="rounded-xl border border-rose-100 p-4">
                  <h3 className="mb-3 text-sm font-bold text-rose-800">Détails avant</h3>
                  <AuditDetailValues value={selectedAuditLog.old_value} />
                </section>
                <section className="rounded-xl border border-emerald-100 p-4">
                  <h3 className="mb-3 text-sm font-bold text-emerald-800">Détails après</h3>
                  <AuditDetailValues value={selectedAuditLog.new_value} />
                </section>
              </div>
            </section>
          </div>
        );
      })()}

      {selectedStore && (() => {
        const storeSales = sales.filter(sale => sale.store_id === selectedStore.id && sale.status === "VALIDATED" && isToday(sale.created_at));
        const storeExpenses = expenses.filter(expense => expense.status !== "DRAFT" && expense.store_id === selectedStore.id && isToday(expense.expense_date));
        const dailySales = storeSales.reduce((total, sale) => total + sale.total, 0);
        const dailyExpenses = storeExpenses.reduce((total, expense) => total + expense.amount, 0);
        const latestSales = [...storeSales].sort((left, right) => right.created_at - left.created_at);
        const latestExpenses = [...storeExpenses].sort((left, right) => right.expense_date - left.expense_date);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setSelectedStore(null)}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="store-detail-title"
              className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6"
              onClick={event => event.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 id="store-detail-title" className="truncate text-lg font-black text-slate-900">{selectedStore.name}</h2>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">{selectedStore.code} · {storeTypeLabel(selectedStore)}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedStore.location || "Adresse non renseignée"}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedStore(null)} aria-label="Fermer les informations du magasin" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </header>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-emerald-50 p-3"><dt className="text-emerald-800">CA validé</dt><dd className="mt-1 font-black text-emerald-900">{money(dailySales)}</dd></div>
                <div className="rounded-xl bg-rose-50 p-3"><dt className="text-rose-800">Dépenses</dt><dd className="mt-1 font-black text-rose-900">{money(dailyExpenses)}</dd></div>
                <div className="rounded-xl bg-slate-100 p-3"><dt className="text-slate-600">Net du jour</dt><dd className="mt-1 font-black text-slate-900">{money(dailySales - dailyExpenses)}</dd></div>
              </dl>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <section>
                  <h3 className="mb-2 text-sm font-bold text-slate-900">Ventes du jour <span className="text-xs font-medium text-slate-500">({storeSales.length})</span></h3>
                  {latestSales.length ? <ul className="divide-y divide-slate-100">{latestSales.map(sale => (
                    <li key={sale.id} className="py-2 text-xs">
                      <button type="button" aria-expanded={expandedItem === sale.id} onClick={() => setExpandedItem(expandedItem === sale.id ? null : sale.id)} className="flex w-full items-center justify-between gap-3 text-left">
                        <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{sale.sale_number}</span><span className="text-slate-500">{sale.customer_name} · {new Date(sale.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></span>
                        <span className="shrink-0 font-mono font-bold text-emerald-700">{money(sale.total)}</span>
                      </button>
                      {expandedItem === sale.id && (
                        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-slate-700">
                          <ul className="space-y-1">
                            {sale.lines.map((line, index) => (
                              <li key={line.id || index} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate">{line.article_name} <span className="text-slate-500">× {line.quantity.toLocaleString("fr-FR")} à {money(line.unit_price)}{line.discount > 0 ? ` (−${money(line.discount)})` : ""}</span></span>
                                <span className="shrink-0 font-mono font-semibold">{money(line.total)}</span>
                              </li>
                            ))}
                          </ul>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-200 pt-2">
                            <dt className="text-slate-500">Vendeur</dt><dd className="text-right">{sale.seller_name}</dd>
                            <dt className="text-slate-500">Client</dt><dd className="text-right">{sale.customer_name}{sale.customer_phone ? ` · ${sale.customer_phone}` : ""}</dd>
                            <dt className="text-slate-500">Sous-total</dt><dd className="text-right font-mono">{money(sale.subtotal)}</dd>
                            {sale.discount > 0 && <><dt className="text-slate-500">Remise</dt><dd className="text-right font-mono">−{money(sale.discount)}</dd></>}
                            {sale.tax > 0 && <><dt className="text-slate-500">Taxe</dt><dd className="text-right font-mono">{money(sale.tax)}</dd></>}
                            <dt className="text-slate-500">Paiement</dt><dd className="text-right">{sale.payment_method} · {sale.payment_status === "PAID" ? "Payé" : sale.payment_status === "PARTIAL" ? "Partiel" : "En attente"}</dd>
                            <dt className="text-slate-500">Montant payé</dt><dd className="text-right font-mono">{money(sale.amount_paid)}</dd>
                            {sale.change_returned > 0 && <><dt className="text-slate-500">Monnaie rendue</dt><dd className="text-right font-mono">{money(sale.change_returned)}</dd></>}
                          </dl>
                          {sale.notes && <p className="text-slate-500">Note : {sale.notes}</p>}
                        </div>
                      )}
                    </li>
                  ))}</ul> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Aucune vente validée aujourd’hui.</p>}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-bold text-slate-900">Dépenses du jour <span className="text-xs font-medium text-slate-500">({storeExpenses.length})</span></h3>
                  {latestExpenses.length ? <ul className="divide-y divide-slate-100">{latestExpenses.map(expense => (
                    <li key={expense.id} className="py-2 text-xs">
                      <button type="button" aria-expanded={expandedItem === expense.id} onClick={() => setExpandedItem(expandedItem === expense.id ? null : expense.id)} className="flex w-full items-center justify-between gap-3 text-left">
                        <span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{expense.description || expense.category}</span><span className="text-slate-500">{new Date(expense.expense_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {expense.payment_status === "PAID" ? "Payée" : "En attente"}</span></span>
                        <span className="shrink-0 font-mono font-bold text-rose-700">{money(expense.amount)}</span>
                      </button>
                      {expandedItem === expense.id && (
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-slate-700">
                          <dt className="text-slate-500">N° de dépense</dt><dd className="text-right">{expense.expense_number}</dd>
                          <dt className="text-slate-500">Catégorie</dt><dd className="text-right">{expense.category === "SALARY_ADVANCE" ? "Avance sur salaire" : expense.category}</dd>
                          <dt className="text-slate-500">Date</dt><dd className="text-right">{new Date(expense.expense_date).toLocaleString("fr-FR")}</dd>
                          {expense.payee && <><dt className="text-slate-500">Bénéficiaire</dt><dd className="text-right">{expense.payee}</dd></>}
                          <dt className="text-slate-500">Paiement</dt><dd className="text-right">{expense.payment_method}</dd>
                          {expense.reference && <><dt className="text-slate-500">Référence</dt><dd className="text-right">{expense.reference}</dd></>}
                          <dt className="text-slate-500">Saisie par</dt><dd className="text-right">{expense.created_by_name}</dd>
                          {expense.notes && <><dt className="text-slate-500">Note</dt><dd className="text-right">{expense.notes}</dd></>}
                        </dl>
                      )}
                    </li>
                  ))}</ul> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Aucune dépense aujourd’hui.</p>}
                </section>
              </div>
            </section>
          </div>
        );
      })()}
    </section>
  );
}
