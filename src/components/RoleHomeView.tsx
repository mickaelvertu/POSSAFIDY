import { AppUser } from "../types";
import { hasPermission } from "../services/authService";
import {
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  Factory,
  HandCoins,
  KeyRound,
  PackageCheck,
  Receipt,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users
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
  onOpenUnits: () => void;
  onOpenReports: () => void;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN: "Administrateur",
  VENDEUR: "Vendeur POS",
  MAGASINIER: "Magasinier",
  RESPONSABLE_MAGASIN: "Responsable magasin",
  PRODUCTION: "Responsable production",
  COMPTABLE: "Comptable"
};

const roleDescriptions: Record<string, string> = {
  SUPER_ADMIN: "Pilotage complet des opérations, des accès et des magasins.",
  ADMIN: "Supervision opérationnelle et administration des utilisateurs.",
  VENDEUR: "Accès rapide à la caisse, aux articles et au stock de votre magasin.",
  MAGASINIER: "Suivi du stock et préparation des flux entre magasins.",
  RESPONSABLE_MAGASIN: "Pilotage des ventes, du stock et des transferts de votre magasin.",
  PRODUCTION: "Suivi des ordres de production et des matières premières.",
  COMPTABLE: "Contrôle des ventes, des indicateurs et des rapports."
};

const accessCards = [
  { permission: "sales.view", title: "Ventes & caisse", description: "Consulter et gérer les ventes", icon: ShoppingCart, accent: "emerald" },
  { permission: "stock.view", title: "Stocks", description: "Suivre les disponibilités par magasin", icon: Boxes, accent: "blue" },
  { permission: "transfers.view", title: "Transferts", description: "Suivre les mouvements inter-magasins", icon: ArrowRightLeft, accent: "amber" },
  { permission: "production.view", title: "Production", description: "Suivre les fabrications et consommations", icon: Factory, accent: "indigo" },
  { permission: "reports.view", title: "Rapports", description: "Analyser les performances et les écarts", icon: BarChart3, accent: "violet" },
  { permission: "users.view", title: "Utilisateurs", description: "Attribuer les rôles et les accès", icon: Users, accent: "rose", adminOnly: true },
  { permission: "stores.manage", title: "Magasins", description: "Créer et administrer les sites", icon: Building2, accent: "blue" },
  { permission: "catalog.manage", title: "Articles & catégories", description: "Gérer les articles et leur classification", icon: PackageCheck, accent: "indigo" },
  { permission: "procurement.manage", title: "Achats & fournisseurs", description: "Réceptionner les achats et suivre les échéances", icon: Truck, accent: "emerald" },
  { permission: "expenses.view", title: "Dépenses & frais", description: "Suivre les loyers, factures et autres charges", icon: HandCoins, accent: "amber" },
  { permission: "units.manage", title: "Unités de mesure", description: "Administrer les unités du catalogue", icon: Ruler, accent: "emerald" }
];

const accentClasses: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200"
};

export default function RoleHomeView({ user, onOpenUsers, onOpenSales, onOpenStocks, onOpenProduction, onOpenStores, onOpenCatalog, onOpenProcurement, onOpenExpenses, onOpenTransfers, onOpenUnits, onOpenReports }: RoleHomeViewProps) {
  const role = user.role || "UNASSIGNED";
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const availableCards = accessCards.filter(card => {
    if (card.permission === "stores.manage" || card.permission === "catalog.manage" || card.permission === "procurement.manage" || card.permission === "units.manage") return isAdmin;
    if (card.permission === "expenses.view" && isAdmin) return true;
    if (card.permission === "transfers.view" && isAdmin) return true;
    if (card.permission === "reports.view" && isAdmin) return true;
    if (card.adminOnly && !hasPermission(user, "users.view")) return false;
    return hasPermission(user, card.permission);
  });

  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-lg sm:px-8">
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

        <div className="mt-6 grid grid-cols-1 gap-3 text-xs text-slate-300 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <KeyRound className="h-4 w-4 text-emerald-300" />
            <span>{user.permissions.length} permissions actives</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <Building2 className="h-4 w-4 text-blue-300" />
            <span>{user.storeIds.length ? `${user.storeIds.length} magasin(s) assigné(s)` : "Tous les magasins"}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
            <ClipboardList className="h-4 w-4 text-amber-300" />
            <span>Compte Firebase actif</span>
          </div>
        </div>
      </div>

      {availableCards.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Vos espaces de travail</h2>
              <p className="text-xs text-slate-500">Les modules affichés suivent les permissions de votre compte.</p>
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
              const isUnitsCard = card.permission === "units.manage";
              const isReportsCard = card.permission === "reports.view";
              const isActionable = isUsersCard || isSalesCard || isStockCard || isProductionCard || isStoresCard || isCatalogCard || isProcurementCard || isExpensesCard || isTransfersCard || isUnitsCard || isReportsCard;
              return (
                <button
                  key={card.permission}
                  type="button"
                  onClick={isUsersCard ? onOpenUsers : isSalesCard ? onOpenSales : isStockCard ? onOpenStocks : isProductionCard ? onOpenProduction : isStoresCard ? onOpenStores : isCatalogCard ? onOpenCatalog : isProcurementCard ? onOpenProcurement : isExpensesCard ? onOpenExpenses : isTransfersCard ? onOpenTransfers : isUnitsCard ? onOpenUnits : isReportsCard ? onOpenReports : undefined}
                  disabled={!isActionable}
                  className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:border-slate-300 enabled:hover:shadow-md disabled:cursor-default"
                >
                  <span className={`rounded-xl border p-2.5 ${accentClasses[card.accent]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      {card.title}
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
    </section>
  );
}
