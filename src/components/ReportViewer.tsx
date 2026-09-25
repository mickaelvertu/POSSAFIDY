import { useState } from "react";
import { 
  ReportType, 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  StockTransfer, 
  StockMovement, 
  Sale, 
  Production, 
  AuditLog, 
  GeneralFilters 
} from "../types";
import { 
  Printer, 
  Download, 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  User, 
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft
} from "lucide-react";

interface ReportViewerProps {
  reportType: ReportType;
  filters: GeneralFilters;
  stores: Store[];
  categories: Category[];
  articles: Article[];
  stocks: StoreStock[];
  transfers: StockTransfer[];
  movements: StockMovement[];
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
  currentUser: { email: string; displayName: string };
  onClose: () => void;
}

export default function ReportViewer({
  reportType,
  filters,
  stores,
  categories,
  articles,
  stocks,
  transfers,
  movements,
  sales,
  productions,
  auditLogs,
  currentUser,
  onClose,
}: ReportViewerProps) {
  const [printDate] = useState(new Date().toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "medium"
  }));

  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || id;
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || id;
  const getArticle = (id: string) => articles.find(a => a.id === id);

  // Active filters summary
  const getFiltersSummary = () => {
    const parts: string[] = [];
    if (filters.startDate || filters.endDate) {
      parts.push(`Période: ${filters.startDate || "Début"} au ${filters.endDate || "Ce jour"}`);
    } else {
      parts.push("Période: Historique complet");
    }
    if (filters.storeIds.length > 0) {
      parts.push(`Magasins: ${filters.storeIds.map(getStoreName).join(", ")}`);
    } else {
      parts.push("Magasins: Tous les sites");
    }
    if (filters.categoryIds.length > 0) {
      parts.push(`Catégories: ${filters.categoryIds.map(getCategoryName).join(", ")}`);
    }
    if (filters.articleType && filters.articleType !== "ALL") {
      parts.push(`Type article: ${filters.articleType === "RESALE" ? "Revente" : "Matière Première"}`);
    }
    if (filters.statuses.length > 0) {
      parts.push(`Statuts: ${filters.statuses.join(", ")}`);
    }
    return parts;
  };

  // Title dictionary
  const REPORT_TITLES: Record<ReportType, string> = {
    STOCK_STATUS: "RAPPORT OFFICIEL DE L'ÉTAT DU STOCK MULTI-MAGASINS",
    STOCK_MOVEMENTS: "JOURNAL DÉTAILLÉ DES MOUVEMENTS DE STOCK (TOUS FLUX)",
    TRANSFERS: "REGISTRE GÉNÉRAL DES EXPÉDITIONS & TRANSFERTS",
    RECEIPTS: "JOURNAL DE RÉCEPTION & CONTRÔLE DES MARCHANDISES",
    DISCREPANCIES: "RAPPORT DES ÉCARTS, AVARIES ET REJETS DE LIVRAISON",
    SALES: "JOURNAL CONSOLIDÉ DES VENTES & ENCAISSEMENTS",
    SALES_BY_CUSTOMER: "ANALYSE DU CHIFFRE D'AFFAIRES PAR CLIENT",
    SALES_BY_ARTICLE: "VENTES DÉTAILLÉES PAR ARTICLE ET CONDITIONNEMENT",
    SALES_BY_CATEGORY: "VENTES PAR CATÉGORIE DE PRODUITS GILEADA",
    RAW_MATERIAL_CONSUMPTION: "ÉTAT DE CONSOMMATION DES MATIÈRES PREMIÈRES",
    PRODUCTION: "REGISTRE DE FABRICATION & PRODUITS FINIS LABORATOIRE",
    RETURNS: "REGISTRE DES RETOURS VERS LE DÉPÔT CENTRAL",
    AUDIT_LOG: "JOURNAL D'AUDIT ET DE TRAÇABILITÉ DES OPÉRATIONS"
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200">
        
        {/* Modal Top Bar (hidden in print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl print:hidden">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Aperçu & Édition du Rapport GILEADA</h3>
              <p className="text-xs text-slate-500">Document certifié conforme aux règles d'audit</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Imprimer / Sauvegarder PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 text-slate-800 bg-white" id="printable-report-area">
          
          {/* Header standard GILEADA */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-tight text-blue-900 font-serif">GILEADA</span>
                  <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">MADAGASCAR</span>
                </div>
                <p className="text-xs font-medium text-slate-600 mt-1">
                  Laboratoire Pharmaceutique, Soins Naturels & Réseau de Distribution
                </p>
                <p className="text-[11px] text-slate-500">
                  Antananarivo • Toamasina • Mahajanga • Antsirabe • Madagascar
                </p>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1">
                <div className="font-bold text-slate-800 flex items-center sm:justify-end gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Édité le : {printDate}
                </div>
                <div className="text-slate-600 flex items-center sm:justify-end gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  Opérateur : <span className="font-semibold text-slate-800">{currentUser.displayName || currentUser.email}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  REF-DOC: GILEADA-{Date.now().toString(36).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-baseline justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wide uppercase">
                {REPORT_TITLES[reportType]}
              </h2>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                Période active & Filtres appliqués
              </span>
            </div>

            {/* Active Filters Box */}
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Filtres appliqués pour ce rapport :
              </div>
              <div className="flex flex-wrap gap-2 text-slate-600">
                {getFiltersSummary().map((filterText, idx) => (
                  <span key={idx} className="bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                    {filterText}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* REPORT CONTENT BY TYPE */}

          {/* 1. ÉTAT DU STOCK */}
          {reportType === "STOCK_STATUS" && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">Magasin</th>
                    <th className="py-2.5 px-2 font-bold">Réf</th>
                    <th className="py-2.5 px-2 font-bold">Désignation</th>
                    <th className="py-2.5 px-2 font-bold">Type</th>
                    <th className="py-2.5 px-2 font-bold">Unité</th>
                    <th className="py-2.5 px-2 font-bold text-right">Quantité</th>
                    <th className="py-2.5 px-2 font-bold text-right">PU (Normal)</th>
                    <th className="py-2.5 px-2 font-bold text-right">Valeur Totale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stocks.map((stk) => {
                    const art = getArticle(stk.article_id);
                    if (!art) return null;
                    const val = stk.quantity * art.prix_normal;
                    return (
                      <tr key={stk.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-medium text-slate-700">{getStoreName(stk.store_id)}</td>
                        <td className="py-2 px-2 font-mono font-bold text-blue-700">{art.code}</td>
                        <td className="py-2 px-2 font-medium text-slate-900">{art.name}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            art.article_type === "RESALE" ? "bg-emerald-50 text-emerald-700" : "bg-purple-50 text-purple-700"
                          }`}>
                            {art.article_type === "RESALE" ? "Revente" : "Mat. Première"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{art.unit}</td>
                        <td className="py-2 px-2 text-right font-bold text-slate-900">{stk.quantity}</td>
                        <td className="py-2 px-2 text-right font-mono text-slate-600">{art.prix_normal.toLocaleString("fr-FR")} Ar</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">{val.toLocaleString("fr-FR")} Ar</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <td colSpan={5} className="py-3 px-2 text-right">TOTAL CONSOLIDÉ :</td>
                    <td className="py-3 px-2 text-right font-mono">
                      {stocks.reduce((acc, s) => acc + s.quantity, 0)}
                    </td>
                    <td></td>
                    <td className="py-3 px-2 text-right font-mono text-blue-900">
                      {stocks.reduce((acc, s) => {
                        const a = getArticle(s.article_id);
                        return acc + (s.quantity * (a ? a.prix_normal : 0));
                      }, 0).toLocaleString("fr-FR")} Ar
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 2. MOUVEMENTS DE STOCK */}
          {reportType === "STOCK_MOVEMENTS" && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">Date / Heure</th>
                    <th className="py-2.5 px-2 font-bold">Magasin</th>
                    <th className="py-2.5 px-2 font-bold">Flux</th>
                    <th className="py-2.5 px-2 font-bold">Article</th>
                    <th className="py-2.5 px-2 font-bold text-right">Avant</th>
                    <th className="py-2.5 px-2 font-bold text-right">Mouvement</th>
                    <th className="py-2.5 px-2 font-bold text-right">Après</th>
                    <th className="py-2.5 px-2 font-bold">Réf / Opérateur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {movements.map((m) => {
                    const art = getArticle(m.article_id);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono text-slate-600">
                          {new Date(m.created_at).toLocaleString("fr-FR")}
                        </td>
                        <td className="py-2 px-2 font-medium">{getStoreName(m.store_id)}</td>
                        <td className="py-2 px-2 font-bold text-blue-700">{m.movement_type}</td>
                        <td className="py-2 px-2">
                          <span className="font-mono text-slate-500 font-bold">[{art?.code}]</span> {art?.name}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-slate-500">{m.before_quantity}</td>
                        <td className={`py-2 px-2 text-right font-mono font-bold ${m.quantity > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-800">{m.after_quantity}</td>
                        <td className="py-2 px-2 text-[11px] text-slate-600">
                          <span className="font-mono font-semibold">{m.reference_number}</span> ({m.created_by_name})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. TRANSFERTS */}
          {reportType === "TRANSFERS" && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">N° Transfert</th>
                    <th className="py-2.5 px-2 font-bold">Date</th>
                    <th className="py-2.5 px-2 font-bold">Source</th>
                    <th className="py-2.5 px-2 font-bold">Destination</th>
                    <th className="py-2.5 px-2 font-bold">Articles</th>
                    <th className="py-2.5 px-2 font-bold text-right">Qté Expédiée</th>
                    <th className="py-2.5 px-2 font-bold text-right">Qté Validée</th>
                    <th className="py-2.5 px-2 font-bold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {transfers.map((trf) => {
                    const totalSent = trf.lines.reduce((acc, l) => acc + l.quantity_sent, 0);
                    const totalAccepted = trf.lines.reduce((acc, l) => acc + l.quantity_accepted, 0);
                    return (
                      <tr key={trf.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono font-bold text-blue-700">{trf.transfer_number}</td>
                        <td className="py-2 px-2 text-slate-600">{new Date(trf.created_at).toLocaleDateString("fr-FR")}</td>
                        <td className="py-2 px-2 font-medium">{getStoreName(trf.source_store_id)}</td>
                        <td className="py-2 px-2 font-medium">{getStoreName(trf.destination_store_id)}</td>
                        <td className="py-2 px-2 text-slate-600">
                          {trf.lines.map(l => `${l.article_name} (${l.quantity_sent})`).join(", ")}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold">{totalSent}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                          {trf.status === "VALIDATED" ? totalAccepted : "-"}
                        </td>
                        <td className="py-2 px-2 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            trf.status === "VALIDATED" ? "bg-emerald-100 text-emerald-800" :
                            trf.status === "IN_TRANSIT" ? "bg-amber-100 text-amber-800" :
                            trf.status === "DISCREPANCY" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
                          }`}>
                            {trf.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. RÉCEPTIONS & 5. ÉCARTS */}
          {(reportType === "RECEIPTS" || reportType === "DISCREPANCIES") && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">N° Transfert</th>
                    <th className="py-2.5 px-2 font-bold">Site Destinataire</th>
                    <th className="py-2.5 px-2 font-bold">Article</th>
                    <th className="py-2.5 px-2 font-bold text-right">Qté Envoyée</th>
                    <th className="py-2.5 px-2 font-bold text-right">Qté Reçue</th>
                    <th className="py-2.5 px-2 font-bold text-right">Qté Acceptée</th>
                    <th className="py-2.5 px-2 font-bold text-right text-rose-700">Écart / Rejet</th>
                    <th className="py-2.5 px-2 font-bold">Motif / Commentaire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {transfers
                    .filter(t => reportType === "DISCREPANCIES" ? (t.has_discrepancy || t.status === "DISCREPANCY" || t.lines.some(l => l.quantity_rejected > 0)) : (t.status === "RECEIVED" || t.status === "VALIDATED"))
                    .flatMap(t => t.lines.map(l => ({ transfer: t, line: l })))
                    .map(({ transfer, line }) => (
                      <tr key={line.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-mono font-bold text-blue-700">{transfer.transfer_number}</td>
                        <td className="py-2 px-2 font-medium">{getStoreName(transfer.destination_store_id)}</td>
                        <td className="py-2 px-2">
                          <span className="font-mono font-bold text-slate-500">[{line.article_code}]</span> {line.article_name}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{line.quantity_sent}</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold">{line.quantity_received}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">{line.quantity_accepted}</td>
                        <td className={`py-2 px-2 text-right font-mono font-bold ${line.quantity_rejected > 0 ? "text-rose-700 bg-rose-50" : "text-slate-400"}`}>
                          {line.quantity_rejected}
                        </td>
                        <td className="py-2 px-2 text-[11px] text-slate-600">
                          {line.note || transfer.discrepancy_resolution_note || "-"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. VENTES & 7. VENTES PAR CLIENT & 8. VENTES PAR ARTICLE */}
          {reportType === "SALES" && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">N° Vente</th>
                    <th className="py-2.5 px-2 font-bold">Date</th>
                    <th className="py-2.5 px-2 font-bold">Point de Vente</th>
                    <th className="py-2.5 px-2 font-bold">Client</th>
                    <th className="py-2.5 px-2 font-bold">Vendeur</th>
                    <th className="py-2.5 px-2 font-bold">Paiement</th>
                    <th className="py-2.5 px-2 font-bold text-right">Sous-Total</th>
                    <th className="py-2.5 px-2 font-bold text-right">Remise</th>
                    <th className="py-2.5 px-2 font-bold text-right">Total Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono font-bold text-blue-700">{sale.sale_number}</td>
                      <td className="py-2 px-2 text-slate-600">{new Date(sale.created_at).toLocaleDateString("fr-FR")}</td>
                      <td className="py-2 px-2 font-medium">{getStoreName(sale.store_id)}</td>
                      <td className="py-2 px-2 font-medium text-slate-900">{sale.customer_name}</td>
                      <td className="py-2 px-2 text-slate-600">{sale.seller_name}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">{sale.payment_method}</td>
                      <td className="py-2 px-2 text-right font-mono">{sale.subtotal.toLocaleString("fr-FR")} Ar</td>
                      <td className="py-2 px-2 text-right font-mono text-rose-600">
                        {sale.discount > 0 ? `-${sale.discount.toLocaleString("fr-FR")} Ar` : "0 Ar"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-blue-900">
                        {sale.total.toLocaleString("fr-FR")} Ar
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <td colSpan={8} className="py-3 px-2 text-right">TOTAL CHIFFRE D'AFFAIRES :</td>
                    <td className="py-3 px-2 text-right font-mono text-blue-900 text-sm">
                      {sales.reduce((acc, s) => acc + s.total, 0).toLocaleString("fr-FR")} Ar
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 10. CONSOMMATION DES MATIÈRES PREMIÈRES & 11. PRODUCTION */}
          {(reportType === "RAW_MATERIAL_CONSUMPTION" || reportType === "PRODUCTION") && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">N° Ordre Fab</th>
                    <th className="py-2.5 px-2 font-bold">Date Réalisation</th>
                    <th className="py-2.5 px-2 font-bold">Atelier</th>
                    <th className="py-2.5 px-2 font-bold">Matières Consommées</th>
                    <th className="py-2.5 px-2 font-bold">Produits Fabriqués (Sortie)</th>
                    <th className="py-2.5 px-2 font-bold">Opérateur / Validation</th>
                    <th className="py-2.5 px-2 font-bold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {productions.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-mono font-bold text-blue-700">{p.production_number}</td>
                      <td className="py-2.5 px-2 text-slate-600">{new Date(p.created_at).toLocaleDateString("fr-FR")}</td>
                      <td className="py-2.5 px-2 font-medium">{getStoreName(p.manufacturer_store_id)}</td>
                      <td className="py-2.5 px-2">
                        <ul className="list-disc list-inside text-rose-700 font-medium">
                          {p.consumptions.map(c => (
                            <li key={c.id}>{c.article_name} : <span className="font-mono font-bold">{c.quantity} {c.unit}</span></li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-2.5 px-2">
                        <ul className="list-disc list-inside text-emerald-700 font-medium">
                          {p.outputs.map(o => (
                            <li key={o.id}>{o.article_name} : <span className="font-mono font-bold">{o.quantity} {o.unit}</span></li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-slate-600">
                        {p.created_by_name} / {p.validated_by_name || "En attente"}
                      </td>
                      <td className="py-2.5 px-2 font-bold">
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px]">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 13. JOURNAL D'AUDIT */}
          {reportType === "AUDIT_LOG" && (
            <div>
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                    <th className="py-2.5 px-2 font-bold">Horodatage</th>
                    <th className="py-2.5 px-2 font-bold">Utilisateur</th>
                    <th className="py-2.5 px-2 font-bold">Action</th>
                    <th className="py-2.5 px-2 font-bold">Entité & ID</th>
                    <th className="py-2.5 px-2 font-bold">Appareil (Device)</th>
                    <th className="py-2.5 px-2 font-bold">Détails de Sécurité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono text-slate-600">
                        {new Date(log.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2 px-2 font-medium text-slate-900">{log.user_name}</td>
                      <td className="py-2 px-2 font-mono font-bold text-blue-700">{log.action}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">
                        {log.entity_type} <span className="text-slate-400">({log.entity_id})</span>
                      </td>
                      <td className="py-2 px-2 text-[10px] text-slate-500 font-mono">{log.device_id}</td>
                      <td className="py-2 px-2 text-[11px] text-slate-600 truncate max-w-xs font-mono">
                        {JSON.stringify(log.new_value || log.old_value || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer & Signature Section */}
          <div className="mt-12 pt-6 border-t-2 border-slate-300 flex justify-between items-end text-xs text-slate-600">
            <div>
              <p className="font-bold text-slate-800">Direction Générale & Contrôle de Gestion GILEADA</p>
              <p className="text-[11px] text-slate-500">Document généré automatiquement sous contrôle cryptographique</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Page 1 / 1 • Certifié ISO 9001:2015</p>
            </div>
            <div className="text-center w-48">
              <div className="h-14 border-b border-dashed border-slate-400 mb-1"></div>
              <span className="text-[11px] font-semibold text-slate-700">Visa & Signature Autorité</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
