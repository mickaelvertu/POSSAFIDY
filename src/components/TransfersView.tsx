import { useState, FormEvent } from "react";
import { 
  StockTransfer, 
  StockTransferLine, 
  Store, 
  Article, 
  StoreStock, 
  UserProfile, 
  TransferStatus,
  TransferTypeCode,
  StockMovementType 
} from "../types";
import { generateRef, getArticleStock } from "../services/stockService";
import { 
  ArrowRightLeft, 
  Plus, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Search, 
  ShieldCheck, 
  X,
  FileCheck,
  Building2,
  Trash2,
  HelpCircle
} from "lucide-react";

interface TransfersViewProps {
  transfers: StockTransfer[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateTransfer: (transfer: StockTransfer) => void;
  onApproveTransfer: (transferId: string) => void;
  onShipTransfer: (transferId: string) => void;
  onReceiveAndValidateTransfer: (
    transferId: string, 
    updatedLines: StockTransferLine[], 
    receiverNote?: string
  ) => void;
  onResolveDiscrepancy: (transferId: string, resolutionNote: string) => void;
  canCreate: boolean;
  canApprove: boolean;
  canShip: boolean;
  canReceive: boolean;
  canResolveDiscrepancy: boolean;
}

export default function TransfersView({
  transfers,
  stores,
  articles,
  stocks,
  currentUser,
  onCreateTransfer,
  onApproveTransfer,
  onShipTransfer,
  onReceiveAndValidateTransfer,
  onResolveDiscrepancy,
  canCreate,
  canApprove,
  canShip,
  canReceive,
  canResolveDiscrepancy
}: TransfersViewProps) {
  // UI states
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [inspectingTransfer, setInspectingTransfer] = useState<StockTransfer | null>(null);
  const [resolvingTransfer, setResolvingTransfer] = useState<StockTransfer | null>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState("");

  // New transfer form state
  const [sourceStoreId, setSourceStoreId] = useState(stores[0]?.id || "");
  const [destStoreId, setDestStoreId] = useState(stores[1]?.id || "");
  const [transferLines, setTransferLines] = useState<Array<{ article_id: string; quantity: number }>>([
    { article_id: articles[0]?.id || "", quantity: 10 }
  ]);
  const [transferNote, setTransferNote] = useState("");

  // Inspection form state for reception
  const [inspectionLines, setInspectionLines] = useState<StockTransferLine[]>([]);
  const [receiverGeneralNote, setReceiverGeneralNote] = useState("");

  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || id;
  const centralStores = stores.filter(store => store.store_type === "CENTRAL_WAREHOUSE");
  const primaryCentralStore = centralStores.find(store => store.code === "DEP-01") || centralStores[0];
  const resellerStores = stores.filter(store => store.store_type === "RESELLER");
  const getTransferArticles = (destinationStoreId: string) => {
    const destination = stores.find(store => store.id === destinationStoreId);
    return destination?.store_type === "POS" || destination?.store_type === "RESELLER"
      ? articles.filter(article => article.article_type === "RESALE")
      : articles;
  };

  // Determine transfer type code automatically from source and destination
  const getTransferTypeCode = (srcId: string, dstId: string): TransferTypeCode => {
    const src = stores.find(s => s.id === srcId);
    const dst = stores.find(s => s.id === dstId);
    if (src?.store_type === "CENTRAL_WAREHOUSE") {
      if (dst?.store_type === "POS") return "CENTRAL_TO_POS";
      if (dst?.store_type === "RESELLER") return "CENTRAL_TO_RESELLER";
      if (dst?.store_type === "MANUFACTURER") return "CENTRAL_TO_MANUFACTURER";
    }
    if (src?.store_type === "MANUFACTURER") {
      if (dst?.store_type === "CENTRAL_WAREHOUSE") return "MANUFACTURER_TO_CENTRAL";
      return "MANUFACTURER_TO_STORE";
    }
    return "STORE_TO_STORE";
  };

  // Filter transfers
  const filteredTransfers = transfers.filter(t => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchNum = t.transfer_number.toLowerCase().includes(q);
      const matchSrc = getStoreName(t.source_store_id).toLowerCase().includes(q);
      const matchDst = getStoreName(t.destination_store_id).toLowerCase().includes(q);
      if (!matchNum && !matchSrc && !matchDst) return false;
    }
    return true;
  });

  const handleOpenCreateModal = () => {
    const sourceStoreId = primaryCentralStore?.id || stores[0]?.id || "";
    const destinationStoreId = resellerStores[0]?.id || stores.find(store => store.id !== sourceStoreId)?.id || "";
    setSourceStoreId(sourceStoreId);
    setDestStoreId(destinationStoreId);
    setTransferLines([{ article_id: getTransferArticles(destinationStoreId)[0]?.id || "", quantity: 10 }]);
    setTransferNote("");
    setIsCreateModalOpen(true);
  };

  const handleAddTransferLine = () => {
    setTransferLines([...transferLines, { article_id: getTransferArticles(destStoreId)[0]?.id || "", quantity: 5 }]);
  };

  const handleRemoveTransferLine = (index: number) => {
    if (!window.confirm("Supprimer cette ligne de transfert ?")) return;
    setTransferLines(transferLines.filter((_, idx) => idx !== index));
  };

  const handleSaveNewTransfer = (e: FormEvent) => {
    e.preventDefault();
    if (sourceStoreId === destStoreId) {
      alert("Le magasin source et le magasin destination doivent être distincts !");
      return;
    }
    if (transferLines.length === 0) {
      alert("Veuillez ajouter au moins une ligne d'article.");
      return;
    }

    const destinationStore = stores.find(store => store.id === destStoreId);
    const transferArticles = getTransferArticles(destStoreId);
    if (destinationStore?.store_type === "POS" || destinationStore?.store_type === "RESELLER") {
      const rawMaterialLine = transferLines.find(line => articles.find(article => article.id === line.article_id)?.article_type === "RAW_MATERIAL");
      if (rawMaterialLine) {
        alert("Les matières premières ne peuvent pas être transférées vers un point de vente ou un magasin revendeur.");
        return;
      }
    }
    if (transferLines.some(line => !transferArticles.some(article => article.id === line.article_id))) {
      alert("L'article sélectionné n'est pas autorisé pour ce magasin destinataire.");
      return;
    }

    const invalidLine = transferLines.find(line => {
      const requestedQuantity = Number(line.quantity);
      const availableQuantity = getArticleStock(stocks, sourceStoreId, line.article_id);
      return !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > availableQuantity;
    });
    if (invalidLine) {
      const article = articles.find(item => item.id === invalidLine.article_id);
      const requestedQuantity = Number(invalidLine.quantity);
      const availableQuantity = getArticleStock(stocks, sourceStoreId, invalidLine.article_id);
      alert(`Stock insuffisant pour ${article?.name || "cet article"}. Demandé : ${requestedQuantity}. Disponible : ${availableQuantity}.`);
      return;
    }

    const type = getTransferTypeCode(sourceStoreId, destStoreId);
    const transferNumber = generateRef("TRF", transfers.length);

    const lines: StockTransferLine[] = transferLines.map((line, idx) => {
      const art = articles.find(a => a.id === line.article_id);
      return {
        id: `line-${Date.now()}-${idx}`,
        transfer_id: `trf-${Date.now()}`,
        article_id: line.article_id,
        article_code: art?.code || "REF",
        article_name: art?.name || "Article",
        unit: art?.unit || "Unité",
        quantity_sent: Number(line.quantity),
        quantity_received: 0,
        quantity_accepted: 0,
        quantity_rejected: 0,
      };
    });

    const newTransfer: StockTransfer = {
      id: `trf-${Date.now()}`,
      transfer_number: transferNumber,
      type,
      source_store_id: sourceStoreId,
      destination_store_id: destStoreId,
      status: "DRAFT",
      requested_by: currentUser.uid,
      requested_by_name: currentUser.displayName || currentUser.email,
      lines,
      note: transferNote,
      has_discrepancy: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    onCreateTransfer(newTransfer);
    setIsCreateModalOpen(false);
  };

  // Launch inspection modal
  const handleOpenInspection = (transfer: StockTransfer) => {
    setInspectingTransfer(transfer);
    // Initialize inspection lines with received = sent by default, accepted = sent, rejected = 0
    setInspectionLines(transfer.lines.map(l => ({
      ...l,
      quantity_received: l.quantity_received || l.quantity_sent,
      quantity_accepted: l.quantity_accepted || l.quantity_sent,
      quantity_rejected: l.quantity_rejected || 0,
      note: l.note || ""
    })));
    setReceiverGeneralNote(transfer.note || "");
  };

  const handleConfirmInspection = () => {
    if (!inspectingTransfer) return;
    onReceiveAndValidateTransfer(inspectingTransfer.id, inspectionLines, receiverGeneralNote);
    setInspectingTransfer(null);
  };

  return (
    <div className="space-y-6 text-slate-900">
      
      {/* Top Header & Workflow reminder banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Transferts & Réceptions Inter-Magasins
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Règle N°3 : Le stock destination n'est jamais crédité à l'expédition. La réception doit être contrôlée et validée.
          </p>
        </div>

        {canCreate && <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Transfert
        </button>}
      </div>

      {/* Workflow Steps Indicator Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xs overflow-x-auto">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
          Cycle de Vie d'un Transfert GILEADA (Section 3 & 4) :
        </div>
        <div className="flex items-center gap-2 text-xs font-mono min-w-max">
          <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700">1. DRAFT</span>
          <span className="text-slate-500">→</span>
          <span className="bg-blue-950 text-blue-300 px-2.5 py-1 rounded-md border border-blue-800">2. APPROVED (Admin)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-indigo-950 text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-800">3. SHIPPED (Stock Source Décrémenté)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-amber-950 text-amber-300 px-2.5 py-1 rounded-md border border-amber-800">4. IN_TRANSIT</span>
          <span className="text-slate-500">→</span>
          <span className="bg-purple-950 text-purple-300 px-2.5 py-1 rounded-md border border-purple-800">5. RECEIVED (Contrôle Destinataire)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-emerald-950 text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-800">6. VALIDATED (Stock Destinataire Crédité)</span>
          <span className="text-slate-500">/</span>
          <span className="bg-rose-950 text-rose-300 px-2.5 py-1 rounded-md border border-rose-800">DISCREPANCY (Écarts Tracés)</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {["ALL", "DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED", "VALIDATED", "DISCREPANCY"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterStatus === st 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {st === "ALL" ? "Tous" : st}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher réf, magasin..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

      </div>

      {/* Transfers List */}
      <div className="space-y-4">
        {filteredTransfers.length > 0 ? (
          filteredTransfers.map((t) => {
            const src = stores.find(s => s.id === t.source_store_id);
            const dst = stores.find(s => s.id === t.destination_store_id);
            const totalSent = t.lines.reduce((acc, l) => acc + l.quantity_sent, 0);
            const totalAccepted = t.lines.reduce((acc, l) => acc + l.quantity_accepted, 0);
            const totalRejected = t.lines.reduce((acc, l) => acc + l.quantity_rejected, 0);

            const isReceiver = currentUser.roleId === "RESPONSABLE_MAGASIN"
              && currentUser.storeIds.includes(t.destination_store_id)
              && currentUser.uid !== t.requested_by;

            return (
              <div 
                key={t.id} 
                className={`bg-white rounded-2xl border p-5 shadow-xs transition hover:shadow-md ${
                  t.status === "DISCREPANCY" ? "border-rose-300 bg-rose-50/20" :
                  t.status === "IN_TRANSIT" ? "border-amber-300" :
                  t.status === "VALIDATED" ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                
                {/* Header row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {t.transfer_number}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 font-mono">
                      Type: {t.type}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      t.status === "VALIDATED" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                      t.status === "IN_TRANSIT" ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse" :
                      t.status === "APPROVED" ? "bg-blue-100 text-blue-800 border-blue-300" :
                      t.status === "DISCREPANCY" ? "bg-rose-100 text-rose-800 border-rose-300" :
                      t.status === "DRAFT" ? "bg-slate-100 text-slate-800 border-slate-300" : "bg-purple-100 text-purple-800 border-purple-300"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>

                {/* Source & Destination Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Expéditeur (Source) :</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">{src?.name}</div>
                    <div className="text-slate-500 font-mono">Code: {src?.code} • Type: {src?.store_type}</div>
                    {t.shipped_at && (
                      <div className="text-indigo-600 mt-1 font-medium">
                        Expédié le : {new Date(t.shipped_at).toLocaleString("fr-FR")} ({t.shipped_by_name})
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Destinataire (Contrôle à l'arrivée) :</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">{dst?.name}</div>
                    <div className="text-slate-500 font-mono">Code: {dst?.code} • Type: {dst?.store_type}</div>
                    {t.validated_at ? (
                      <div className="text-emerald-700 mt-1 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Validé le : {new Date(t.validated_at).toLocaleString("fr-FR")} ({t.validated_by_name})
                      </div>
                    ) : (
                      <div className="text-amber-700 mt-1 font-medium">
                        Stock destinataire non crédité tant que non validé
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines summary */}
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-200">
                        <th className="py-1 px-2">Réf</th>
                        <th className="py-1 px-2">Article</th>
                        <th className="py-1 px-2 text-right">Qté Expédiée</th>
                        <th className="py-1 px-2 text-right">Qté Reçue</th>
                        <th className="py-1 px-2 text-right">Qté Acceptée</th>
                        <th className="py-1 px-2 text-right text-rose-700">Écart / Rejet</th>
                        <th className="py-1 px-2">Notes / Motifs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {t.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-1.5 px-2 font-mono font-bold text-blue-700">{l.article_code}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800">{l.article_name} <span className="text-slate-500">({l.unit})</span></td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">{l.quantity_sent}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-semibold">{t.status === "DRAFT" || t.status === "APPROVED" || t.status === "IN_TRANSIT" ? "-" : l.quantity_received}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-700">{t.status === "VALIDATED" || t.status === "DISCREPANCY" ? l.quantity_accepted : "-"}</td>
                          <td className={`py-1.5 px-2 text-right font-mono font-bold ${l.quantity_rejected > 0 ? "text-rose-600 bg-rose-50" : "text-slate-400"}`}>
                            {t.status === "VALIDATED" || t.status === "DISCREPANCY" ? l.quantity_rejected : "-"}
                          </td>
                          <td className="py-1.5 px-2 text-[11px] text-slate-500">{l.note || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Discrepancy Alert Box if present */}
                {(t.has_discrepancy || t.status === "DISCREPANCY" || totalRejected > 0) && (
                  <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2 text-rose-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <div>
                        <span className="font-bold">Écart détecté : </span>
                        {totalRejected} unité(s) manquante(s) ou avariée(s).
                        {t.discrepancy_resolved ? (
                          <span className="ml-2 font-semibold text-emerald-700">
                            (Régularisé : {t.discrepancy_resolution_note})
                          </span>
                        ) : (
                          <span className="ml-2 italic text-rose-600">
                            (En attente d'arbitrage administratif)
                          </span>
                        )}
                      </div>
                    </div>

                    {!t.discrepancy_resolved && canResolveDiscrepancy && (
                      <button
                        type="button"
                        onClick={() => {
                          setResolvingTransfer(t);
                          setDiscrepancyNote("");
                        }}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs"
                      >
                        Traiter l'écart (Admin)
                      </button>
                    )}
                  </div>
                )}

                {/* Action buttons row according to life cycle */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 italic">
                    {t.note && `Observation : "${t.note}"`}
                  </div>

                  <div className="flex items-center gap-2">
                    
                    {/* Step 1 -> 2: Approve DRAFT */}
                    {t.status === "DRAFT" && canApprove && (
                      <button
                        type="button"
                        onClick={() => onApproveTransfer(t.id)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Approuver le Transfert
                      </button>
                    )}

                    {/* Step 2 -> 3: Ship APPROVED -> Sets IN_TRANSIT, deducts source stock */}
                    {t.status === "APPROVED" && canShip && (
                      <button
                        type="button"
                        onClick={() => onShipTransfer(t.id)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Expédier (Décrémenter Stock Source)
                      </button>
                    )}

                    {/* Step 3 -> 4 & 5: Reception control */}
                    {t.status === "IN_TRANSIT" && canReceive && isReceiver && (
                      <button
                        type="button"
                        onClick={() => handleOpenInspection(t)}
                        className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileCheck className="h-4 w-4" />
                        Réceptionner & Valider au Magasin
                      </button>
                    )}

                    {/* Validated info */}
                    {t.status === "VALIDATED" && (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Réception Validée & Stock Crédité ({totalAccepted} unités)
                      </span>
                    )}

                  </div>
                </div>

              </div>
            );
          })
        ) : (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 text-xs italic">
            Aucun transfert trouvé selon les critères sélectionnés.
          </div>
        )}
      </div>

      {/* CREATE TRANSFER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Initier un Nouveau Transfert</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewTransfer} className="mt-4 space-y-4">
              
              {/* Stores selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Magasin Source (Expéditeur) :
                  </label>
                  <select
                    value={sourceStoreId}
                    onChange={(e) => setSourceStoreId(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code} - {s.store_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Magasin Destinataire :
                  </label>
                  <select
                    value={destStoreId}
                    onChange={(e) => {
                      const nextDestinationStoreId = e.target.value;
                      const firstAllowedArticle = getTransferArticles(nextDestinationStoreId)[0];
                      setDestStoreId(nextDestinationStoreId);
                      setTransferLines(lines => lines.map(line => ({
                        ...line,
                        article_id: getTransferArticles(nextDestinationStoreId).some(article => article.id === line.article_id)
                          ? line.article_id
                          : firstAllowedArticle?.id || ""
                      })));
                    }}
                    className="w-full text-xs font-semibold bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code} - {s.store_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notice on stock rule */}
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-900">
                <strong>Règle GILEADA :</strong> À l'expédition, le stock du magasin source sera diminué de la quantité envoyée. 
                Le magasin destinataire ne sera crédité que des quantités qu'il aura expressément acceptées lors de son contrôle de réception.
              </div>

              {/* Transfer lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800">Articles à transférer :</label>
                  <button
                    type="button"
                    onClick={handleAddTransferLine}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {transferLines.map((line, idx) => {
                    const currentStock = getArticleStock(stocks, sourceStoreId, line.article_id);
                    const selectedArticle = articles.find(article => article.id === line.article_id);
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                        <select
                          value={line.article_id}
                          onChange={(e) => {
                            const newLines = [...transferLines];
                            newLines[idx].article_id = e.target.value;
                            setTransferLines(newLines);
                          }}
                          className="flex-1 text-xs bg-white border border-slate-300 rounded-lg p-2"
                        >
                          {getTransferArticles(destStoreId).map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.code}] {a.name} ({a.unit})
                            </option>
                          ))}
                        </select>

                        <div className="flex w-32 shrink-0 items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            aria-label={`Quantité à transférer (${selectedArticle?.unit || "unité"})`}
                            value={line.quantity}
                            onChange={(e) => {
                              const newLines = [...transferLines];
                              newLines[idx].quantity = Math.max(1, Number(e.target.value));
                              setTransferLines(newLines);
                            }}
                            className="min-w-0 flex-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg p-2 text-right"
                            placeholder="Qté"
                          />
                          <span className="max-w-16 truncate text-[10px] font-medium text-slate-600" title={selectedArticle?.unit}>{selectedArticle?.unit}</span>
                        </div>

                        <span className="min-w-0 flex-1 text-right text-[10px] text-slate-500">
                          Dispo: {currentStock} {selectedArticle?.unit}
                        </span>

                        {transferLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTransferLine(idx)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Supprimer la ligne"
                            aria-label="Supprimer la ligne"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motif / Instructions d'acheminement :
                </label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="Ex: Réapprovisionnement régulier, commande spéciale..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Créer le Transfert (DRAFT)
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* INSPECTION & RECEPTION CONTROL MODAL (Section 3 & 4) */}
      {inspectingTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Contrôle de Réception Obligatoire — {inspectingTransfer.transfer_number}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Destinataire : {getStoreName(inspectingTransfer.destination_store_id)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingTransfer(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
                <strong>Attention Règle Métier GILEADA :</strong> Seule la <strong>quantité acceptée</strong> sera créditée à votre stock.
                Toute différence entre la quantité envoyée et acceptée sera automatiquement enregistrée comme anomalie (Écart / Discrepancy) et auditée.
              </div>

              {/* Inspection lines table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2 px-2">Article</th>
                      <th className="py-2 px-2 text-right">Envoyée</th>
                      <th className="py-2 px-2 text-right">Reçue (Physique)</th>
                      <th className="py-2 px-2 text-right text-emerald-800">Acceptée (Crédit)</th>
                      <th className="py-2 px-2 text-right text-rose-800">Rejetée / Manquante</th>
                      <th className="py-2 px-2">Commentaire / Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {inspectionLines.map((line, idx) => (
                      <tr key={line.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-medium">
                          <span className="font-mono text-blue-700 font-bold">[{line.article_code}]</span> {line.article_name} <span className="text-slate-500">({line.unit})</span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-slate-700">
                          {line.quantity_sent}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity_received}
                            onChange={(e) => {
                              const rec = Number(e.target.value);
                              const newLines = [...inspectionLines];
                              newLines[idx].quantity_received = rec;
                              // Auto calculate rejected if accepted was equal to rec
                              newLines[idx].quantity_rejected = Math.max(0, line.quantity_sent - rec);
                              newLines[idx].quantity_accepted = Math.min(line.quantity_sent, rec);
                              setInspectionLines(newLines);
                            }}
                            className="w-16 text-right font-mono font-bold bg-white border border-slate-300 rounded p-1"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            max={line.quantity_sent}
                            value={line.quantity_accepted}
                            onChange={(e) => {
                              const acc = Number(e.target.value);
                              const newLines = [...inspectionLines];
                              newLines[idx].quantity_accepted = acc;
                              newLines[idx].quantity_rejected = Math.max(0, line.quantity_sent - acc);
                              setInspectionLines(newLines);
                            }}
                            className="w-16 text-right font-mono font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 rounded p-1"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                            line.quantity_rejected > 0 ? "text-rose-700 bg-rose-100" : "text-slate-400"
                          }`}>
                            {line.quantity_rejected}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            placeholder="Motif (bris, manquant...)"
                            value={line.note || ""}
                            onChange={(e) => {
                              const newLines = [...inspectionLines];
                              newLines[idx].note = e.target.value;
                              setInspectionLines(newLines);
                            }}
                            className="w-full text-xs bg-white border border-slate-300 rounded p-1"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Remarques globales du magasinier destinataire :
                </label>
                <input
                  type="text"
                  placeholder="État des cartons, transporteur, réserves..."
                  value={receiverGeneralNote}
                  onChange={(e) => setReceiverGeneralNote(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingTransfer(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmInspection}
                  className="px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Valider la Réception & Mettre à Jour les Stocks
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* DISCREPANCY RESOLUTION MODAL */}
      {resolvingTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-bold text-base text-slate-900">
                  Régularisation Administrative d'Écart
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResolvingTransfer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-slate-600">
                Transfert : <strong className="font-mono text-slate-900">{resolvingTransfer.transfer_number}</strong>
              </p>
              <p className="text-slate-600">
                Écart constaté : {resolvingTransfer.lines.reduce((acc, l) => acc + l.quantity_rejected, 0)} unité(s) rejetée(s) ou manquante(s).
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Décision administrative & régularisation comptable :
                </label>
                <textarea
                  rows={3}
                  value={discrepancyNote}
                  onChange={(e) => setDiscrepancyNote(e.target.value)}
                  placeholder="Ex: Prise en charge assurance transporteur, refacturation fournisseur, passage en perte perte d'exploitation..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingTransfer(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResolveDiscrepancy(resolvingTransfer.id, discrepancyNote || "Régularisé par l'administration");
                    setResolvingTransfer(null);
                  }}
                  className="px-4 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
                >
                  Valider la Régularisation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
