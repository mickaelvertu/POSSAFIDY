import { 
  Store, 
  Article, 
  StoreStock, 
  StockTransfer, 
  Sale, 
  StockMovement, 
  Production 
} from "../types";
import { 
  Package, 
  TrendingUp, 
  ArrowRightLeft, 
  AlertTriangle, 
  CheckCircle2, 
  Factory, 
  Store as StoreIcon, 
  Truck, 
  DollarSign,
  ShoppingCart,
  Boxes,
  Clock
} from "lucide-react";

interface DashboardViewProps {
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  transfers: StockTransfer[];
  sales: Sale[];
  movements: StockMovement[];
  productions: Production[];
  onNavigate: (tab: string) => void;
}

export default function DashboardView({
  stores,
  articles,
  stocks,
  transfers,
  sales,
  movements,
  productions,
  onNavigate
}: DashboardViewProps) {
  // Statistics calculations
  const totalArticles = articles.length;
  const resaleCount = articles.filter(a => a.article_type === "RESALE").length;
  const rawCount = articles.filter(a => a.article_type === "RAW_MATERIAL").length;

  const totalStockValue = stocks.reduce((acc, stk) => {
    const art = articles.find(a => a.id === stk.article_id);
    return acc + (stk.quantity * (art ? art.prix_normal : 0));
  }, 0);

  const inTransitTransfers = transfers.filter(t => t.status === "IN_TRANSIT");
  const discrepancyTransfers = transfers.filter(t => t.status === "DISCREPANCY" || (!t.discrepancy_resolved && t.lines.some(l => l.quantity_rejected > 0)));

  const totalSalesAmount = sales
    .filter(s => s.status === "VALIDATED")
    .reduce((acc, s) => acc + s.total, 0);

  // Critical low stock alerts
  const lowStockAlerts = stocks
    .map(s => {
      const art = articles.find(a => a.id === s.article_id);
      const store = stores.find(st => st.id === s.store_id);
      const threshold = art?.min_alert_stock || 10;
      return {
        stock: s,
        article: art,
        store: store,
        isLow: s.quantity <= threshold
      };
    })
    .filter(item => item.isLow && item.article && item.store);

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <Factory className="h-64 w-64" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-300 bg-blue-950/60 px-3 py-1 rounded-full border border-blue-800/80">
            GILEADA • Règles Métier & Traçabilité Multi-Magasins
          </span>
          <h1 className="text-2xl sm:text-3xl font-black mt-3 font-serif tracking-tight">
            Pilotage Central des Stocks, Flux et Ventes
          </h1>
          <p className="text-slate-300 text-sm mt-2 leading-relaxed">
            Contrôle rigoureux de la chaîne d'approvisionnement : réceptions contrôlées avec acceptation/rejet, 
            tarification stricte POS/Revendeurs, traçabilité de production et 13 rapports officiels.
          </p>

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              type="button"
              onClick={() => onNavigate("transfers")}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Nouveau Transfert
            </button>
            <button
              type="button"
              onClick={() => onNavigate("sales")}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Caisse / Nouvelle Vente
            </button>
            <button
              type="button"
              onClick={() => onNavigate("production")}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Factory className="h-3.5 w-3.5" />
              Ordre de Production
            </button>
            <button
              type="button"
              onClick={() => onNavigate("reports")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              Éditer un Rapport PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* KPI 1: Total Stock Value */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Valeur Stock</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-slate-900 font-mono">
              {totalStockValue.toLocaleString("fr-FR")} Ar
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Valorisation au prix public
            </p>
          </div>
        </div>

        {/* KPI 2: Articles catalog */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Catalogue</span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-xl">
              <Boxes className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-slate-900 font-mono">
              {totalArticles} Articles
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {resaleCount} Revente • {rawCount} Mat. Premières
            </p>
          </div>
        </div>

        {/* KPI 3: In Transit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">En Transit</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-amber-600 font-mono">
              {inTransitTransfers.length} Expéditions
            </div>
            <p className="text-xs text-slate-500 mt-1">
              En cours d'acheminement
            </p>
          </div>
        </div>

        {/* KPI 4: Discrepancies */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Écarts / Rejets</span>
            <div className={`p-2 rounded-xl ${discrepancyTransfers.length > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-xl font-black font-mono ${discrepancyTransfers.length > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {discrepancyTransfers.length} Écarts
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Traçabilité des avaries/rejets
            </p>
          </div>
        </div>

        {/* KPI 5: Validated Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Chiffre Ventes</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-emerald-700 font-mono">
              {totalSalesAmount.toLocaleString("fr-FR")} Ar
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Total validé en caisse
            </p>
          </div>
        </div>

      </div>

      {/* The 4 Store Types Overview (Section 2) */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
          <StoreIcon className="h-5 w-5 text-blue-600" />
          Réseau des 4 Types de Magasins GILEADA (Règle Métier N°2)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* 1. CENTRAL_WAREHOUSE */}
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs hover:border-blue-400 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                DÉPÔT CENTRAL
              </span>
              <Boxes className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-3">
              Réception, Stockage & Distribution
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Alimente le réseau. Lors de l'expédition, son stock est diminué immédiatement. Reçoit les retours de MP.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-blue-700">
              Site : Dépôt Antananarivo (DEP-01)
            </div>
          </div>

          {/* 2. POS */}
          <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs hover:border-emerald-400 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                POINT DE VENTE NORMAL
              </span>
              <StoreIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-3">
              Vente au Tarif Normal
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Reçoit par transfert contrôlé. Vend exclusivement au prix public normal. Stock crédité seulement après contrôle.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-emerald-700">
              Sites : POS Analakely & Tamatave
            </div>
          </div>

          {/* 3. RESELLER */}
          <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs hover:border-amber-400 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                MAGASIN REVENDEUR
              </span>
              <ShoppingCart className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-3">
              Vente au Tarif Revendeur
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Reçoit sur accord administratif. Vend automatiquement avec la grille de prix revendeur.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-amber-700">
              Sites : Revendeur Majunga & Antsirabe
            </div>
          </div>

          {/* 4. MANUFACTURER */}
          <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-xs hover:border-purple-400 transition">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                MAGASIN PRODUCTION
              </span>
              <Factory className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-3">
              Laboratoire & Fabrication
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Consomme les matières premières (MP) et fabrique des articles de revente (PF). Peut retourner les surplus.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-purple-700">
              Site : Atelier & Labo (PRD-01)
            </div>
          </div>

        </div>
      </div>

      {/* Two columns: In-Transit Transfers to Inspect & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Column 1: In-Transit Transfers needing inspection */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Expéditions en Transit (Contrôle Réception Requis)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("transfers")}
              className="text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              Voir tout
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {inTransitTransfers.length > 0 ? (
              inTransitTransfers.map((t) => {
                const src = stores.find(s => s.id === t.source_store_id)?.name;
                const dst = stores.find(s => s.id === t.destination_store_id)?.name;
                const totalSent = t.lines.reduce((acc, l) => acc + l.quantity_sent, 0);
                return (
                  <div key={t.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700">{t.transfer_number}</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                          IN_TRANSIT
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        De <span className="font-medium text-slate-900">{src}</span> vers <span className="font-medium text-slate-900">{dst}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {t.lines.length} référence(s) • Total: {totalSent} unités
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate("transfers")}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Contrôler
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                Aucun transfert en transit actuellement. Tous les stocks sont à jour.
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Stock Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Alertes de Réapprovisionnement Stock Bas
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("stocks")}
              className="text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              Voir stock complet
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2 max-h-72 overflow-y-auto">
            {lowStockAlerts.length > 0 ? (
              lowStockAlerts.slice(0, 5).map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-700">[{item.article?.code}]</span>
                      <span className="text-xs font-medium text-slate-900">{item.article?.name}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Site : {item.store?.name}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {item.stock.quantity} {item.article?.unit}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Min alerte : {item.article?.min_alert_stock || 10}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                Tous les niveaux de stock sont conformes aux seuils de sécurité.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
