import { useState, FormEvent } from "react";
import DeliveryNote from "./DeliveryNote";
import SearchableSelect from "./SearchableSelect";
import { 
  StockTransfer, 
  StockTransferLine, 
  Store, 
  Article, 
  StoreStock, 
  UserProfile, 
  TransferStatus,
  TransferTypeCode,
  ReturnReason,
  RETURN_REASON_LABELS,
  StockMovementType 
} from "../types";
import { generateRef, getArticleStock, getQuarantineStock } from "../services/stockService";
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
  HelpCircle,
  Pencil
} from "lucide-react";

interface TransfersViewProps {
  transfers: StockTransfer[];
  stores: Store[];
  articles: Article[];
  stocks: StoreStock[];
  currentUser: UserProfile;
  onCreateTransfer: (transfer: StockTransfer) => Promise<boolean>;
  onUpdateTransfer: (originalTransfer: StockTransfer, transfer: StockTransfer) => Promise<boolean>;
  onDeleteTransfer: (transfer: StockTransfer) => Promise<void>;
  onApproveTransfer: (transferId: string) => void;
  onRejectTransfer: (transferId: string, rejectionNote: string) => Promise<boolean>;
  onShipTransfer: (transferId: string) => void;
  onReceiveAndValidateTransfer: (
    transferId: string, 
    updatedLines: StockTransferLine[], 
    receiverNote?: string
  ) => void;
  onResolveDiscrepancy: (transferId: string, resolutionNote: string) => void;
  canCreate: boolean;
  canApprove: boolean;
  canReject: boolean;
  canShip: boolean;
  canReceive: boolean;
  canResolveDiscrepancy: boolean;
}

interface StoreAllocation {
  store: Store;
  currentStock: number;
  quantity: number;
}

interface StockDistributionPlan {
  article: Article;
  centralStock: number;
  pendingStock: number;
  distributableStock: number;
  allocations: StoreAllocation[];
}

const getQuantityStep = (unit: string) => (/piece|unité|unite/i.test(unit) ? 1 : 0.01);

const formatQuantity = (quantity: number, unit: string) => quantity.toLocaleString("fr-FR", {
  maximumFractionDigits: getQuantityStep(unit) === 1 ? 0 : 2
});

export default function TransfersView({
  transfers,
  stores,
  articles,
  stocks,
  currentUser,
  onCreateTransfer,
  onUpdateTransfer,
  onDeleteTransfer,
  onApproveTransfer,
  onRejectTransfer,
  onShipTransfer,
  onReceiveAndValidateTransfer,
  onResolveDiscrepancy,
  canCreate,
  canApprove,
  canReject,
  canShip,
  canReceive,
  canResolveDiscrepancy
}: TransfersViewProps) {
  // UI states
  const [deliveryTransfer, setDeliveryTransfer] = useState<StockTransfer | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<StockTransfer | null>(null);
  const [isDistributionModalOpen, setIsDistributionModalOpen] = useState(false);
  const [rejectingTransfer, setRejectingTransfer] = useState<StockTransfer | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [distributionArticleId, setDistributionArticleId] = useState(articles.find(article => article.article_type === "RESALE")?.id || "");
  const [distributionPlan, setDistributionPlan] = useState<StockDistributionPlan | null>(null);
  const [inspectingTransfer, setInspectingTransfer] = useState<StockTransfer | null>(null);
  const [resolvingTransfer, setResolvingTransfer] = useState<StockTransfer | null>(null);
  const [discrepancyNote, setDiscrepancyNote] = useState("");

  // New transfer form state
  const [sourceStoreId, setSourceStoreId] = useState(stores[0]?.id || "");
  const [destStoreId, setDestStoreId] = useState(stores[1]?.id || "");
  const [transferLines, setTransferLines] = useState<Array<{ article_id: string; quantity: number; query?: string; return_reason?: ReturnReason; batch_number?: string; expiry_date?: string }>>([
    { article_id: articles[0]?.id || "", quantity: 10 }
  ]);
  const [transferKind, setTransferKind] = useState<"STANDARD" | "STORE_RETURN" | "RECYCLING">("STANDARD");
  const [transferNote, setTransferNote] = useState("");

  // Inspection form state for reception
  const [inspectionLines, setInspectionLines] = useState<StockTransferLine[]>([]);
  const [receiverGeneralNote, setReceiverGeneralNote] = useState("");

  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || id;
  const centralStores = stores.filter(store => store.store_type === "CENTRAL_WAREHOUSE" && store.is_active);
  const primaryCentralStore = centralStores.find(store => store.code === "DEP-01") || centralStores[0];
  const resellerStores = stores.filter(store => store.store_type === "RESELLER" && store.is_active);
  const activeStores = stores.filter(store => store.is_active);
  const sourceStores = currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN"
    ? activeStores
    : activeStores.filter(store => currentUser.storeIds.includes(store.id));
  const getTransferArticles = (destinationStoreId: string) => {
    if (transferKind !== "STANDARD") return articles.filter(article => article.article_type === "RESALE");
    const destination = stores.find(store => store.id === destinationStoreId);
    return destination?.store_type === "POS" || destination?.store_type === "RESELLER"
      ? articles.filter(article => article.article_type === "RESALE")
      : articles;
  };
  const getDispatchableStock = (storeId: string, articleId: string, excludeTransferId?: string) => {
    const stock = transferKind === "RECYCLING" ? getQuarantineStock(stocks, storeId, articleId) : getArticleStock(stocks, storeId, articleId);
    const pending = transfers
      .filter(transfer => transfer.id !== excludeTransferId && transfer.source_store_id === storeId && ["DRAFT", "APPROVED"].includes(transfer.status))
      .flatMap(transfer => transfer.lines)
      .filter(line => line.article_id === articleId)
      .reduce((total, line) => total + line.quantity_sent, 0);
    return Math.max(0, stock - pending);
  };
  const storeOptions = activeStores.map(store => ({
    value: store.id,
    label: `${store.name} (${store.code})`,
    description: ({
      CENTRAL_WAREHOUSE: "Entrepôt central",
      POS: "Point de vente",
      RESELLER: "Revendeur",
      MANUFACTURER: "Fabricant"
    }[store.store_type])
  }));
  const sourceStoreOptions = storeOptions.filter(option => sourceStores.some(store => store.id === option.value));

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

  const calculateStockDistribution = (articleId: string): StockDistributionPlan | null => {
    if (!primaryCentralStore) return null;
    const article = articles.find(item => item.id === articleId);
    const pointOfSales = stores.filter(store => store.store_type === "POS" && store.is_active);
    if (!article || pointOfSales.length === 0) return null;

    const centralStock = getArticleStock(stocks, primaryCentralStore.id, articleId);
    const pendingStock = transfers
      .filter(transfer => transfer.source_store_id === primaryCentralStore.id && ["DRAFT", "APPROVED"].includes(transfer.status))
      .flatMap(transfer => transfer.lines)
      .filter(line => line.article_id === articleId)
      .reduce((total, line) => total + line.quantity_sent, 0);
    const quantityStep = getQuantityStep(article.unit);
    const rawDistributableStock = Math.max(0, centralStock - pendingStock);
    const distributableStock = Math.floor(rawDistributableStock / quantityStep + 1e-9) * quantityStep;
    const orderedStores = pointOfSales
      .map(store => ({ store, currentStock: getArticleStock(stocks, store.id, articleId), quantity: 0 }))
      .sort((left, right) => left.currentStock - right.currentStock);

    let remaining = distributableStock;
    let balancedStores = 1;
    while (balancedStores < orderedStores.length && remaining > 0) {
      const gap = orderedStores[balancedStores].currentStock - orderedStores[balancedStores - 1].currentStock;
      const stockToLevel = gap * balancedStores;
      if (stockToLevel > remaining) break;
      remaining -= stockToLevel;
      balancedStores += 1;
    }

    const targetStock = orderedStores[balancedStores - 1].currentStock + remaining / balancedStores;
    for (const allocation of orderedStores) {
      allocation.quantity = Math.floor(Math.max(0, targetStock - allocation.currentStock) / quantityStep + 1e-9) * quantityStep;
    }
    let unallocatedStock = distributableStock - orderedStores.reduce((total, allocation) => total + allocation.quantity, 0);
    const leastStockedFirst = [...orderedStores].sort((left, right) =>
      left.currentStock + left.quantity - right.currentStock - right.quantity
    );
    for (const allocation of leastStockedFirst) {
      if (unallocatedStock + 1e-9 < quantityStep) break;
      allocation.quantity += quantityStep;
      unallocatedStock -= quantityStep;
    }

    return {
      article,
      centralStock,
      pendingStock,
      distributableStock,
      allocations: orderedStores.filter(allocation => allocation.quantity > 0)
    };
  };

  const handleCreateDistributionDrafts = async () => {
    const plan = calculateStockDistribution(distributionArticleId);
    if (!plan || plan.allocations.length === 0) {
      alert("Aucun stock disponible à répartir après déduction des transferts en attente.");
      return;
    }

    const timestamp = Date.now();
    for (const [index, allocation] of plan.allocations.entries()) {
      const transferId = `trf-${crypto.randomUUID()}`;
      const transfer: StockTransfer = {
        id: transferId,
        transfer_number: generateRef("TRF", transfers.length + index),
        type: "CENTRAL_TO_POS",
        source_store_id: primaryCentralStore!.id,
        destination_store_id: allocation.store.id,
        status: "DRAFT",
        requested_by: currentUser.uid,
        requested_by_name: currentUser.displayName || currentUser.email,
        lines: [{
          id: `line-${crypto.randomUUID()}`,
          transfer_id: transferId,
          article_id: plan.article.id,
          article_code: plan.article.code,
          article_name: plan.article.name,
          unit: plan.article.unit,
          quantity_sent: allocation.quantity,
          quantity_received: 0,
          quantity_accepted: 0,
          quantity_rejected: 0
        }],
        note: "Répartition sur demande, équilibrée selon le stock de chaque point de vente.",
        has_discrepancy: false,
        created_at: timestamp,
        updated_at: timestamp
      };
      if (!await onCreateTransfer(transfer)) return;
    }

    setIsDistributionModalOpen(false);
    setDistributionPlan(null);
  };

  // Filter transfers
  const returnsByStore = Object.values(
    transfers
      .filter(transfer => transfer.type === "STORE_RETURN" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status))
      .flatMap(transfer => transfer.lines.map(line => ({ transfer, line })))
      .filter(({ line }) => line.quantity_accepted > 0)
      .reduce<Record<string, { key: string; storeName: string; reasonLabel: string; quantity: number; value: number }>>((rows, { transfer, line }) => {
        const key = `${transfer.source_store_id}:${line.return_reason || ""}`;
        const row = rows[key] || {
          key,
          storeName: getStoreName(transfer.source_store_id),
          reasonLabel: line.return_reason ? RETURN_REASON_LABELS[line.return_reason] : "Non précisé",
          quantity: 0,
          value: 0
        };
        row.quantity += line.quantity_accepted;
        row.value += line.quantity_accepted * (articles.find(article => article.id === line.article_id)?.prix_achat || 0);
        rows[key] = row;
        return rows;
      }, {})
  );
  const filteredTransfers = transfers.filter(t => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchNum = t.transfer_number.toLowerCase().includes(q);
      const matchSrc = (t.source_name || getStoreName(t.source_store_id)).toLowerCase().includes(q);
      const matchDst = getStoreName(t.destination_store_id).toLowerCase().includes(q);
      if (!matchNum && !matchSrc && !matchDst) return false;
    }
    return true;
  });

  const manufacturerStores = stores.filter(store => store.store_type === "MANUFACTURER" && store.is_active);
  const changeTransferKind = (kind: "STANDARD" | "STORE_RETURN" | "RECYCLING") => {
    setTransferKind(kind);
    if (kind === "STORE_RETURN" && primaryCentralStore) setDestStoreId(primaryCentralStore.id);
    if (kind === "RECYCLING") {
      if (manufacturerStores[0]) setDestStoreId(manufacturerStores[0].id);
      if (primaryCentralStore && sourceStores.some(store => store.id === primaryCentralStore.id)) setSourceStoreId(primaryCentralStore.id);
    }
    setTransferLines(lines => lines.map(line => ({ ...line, article_id: "", query: undefined })));
  };

  const handleOpenCreateModal = () => {
    setEditingTransfer(null);
    setTransferKind("STANDARD");
    const sourceStoreId = currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN"
      ? primaryCentralStore?.id || sourceStores[0]?.id || ""
      : sourceStores[0]?.id || "";
    const destinationStoreId = resellerStores.find(store => store.id !== sourceStoreId)?.id
      || stores.find(store => store.id !== sourceStoreId)?.id
      || "";
    setSourceStoreId(sourceStoreId);
    setDestStoreId(destinationStoreId);
    setTransferLines([{ article_id: "", quantity: 1 }]);
    setTransferNote("");
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (transfer: StockTransfer) => {
    if (transfer.status !== "DRAFT" || transfer.requested_by !== currentUser.uid) return;
    setEditingTransfer(transfer);
    setTransferKind(transfer.type === "STORE_RETURN" || transfer.type === "RECYCLING" ? transfer.type : "STANDARD");
    setSourceStoreId(transfer.source_store_id);
    setDestStoreId(transfer.destination_store_id);
    setTransferLines(transfer.lines.map(line => ({
      article_id: line.article_id,
      quantity: line.quantity_sent,
      return_reason: line.return_reason,
      batch_number: line.batch_number,
      expiry_date: line.expiry_date
    })));
    setTransferNote(transfer.note || "");
    setIsCreateModalOpen(true);
  };

  const formatArticleLabel = (a: Article) => `[${a.code}] ${a.name}${a.unit ? ` (${a.unit})` : ""}`;

  const findTransferArticle = (text: string) => {
    const t = text.trim().toLowerCase();
    if (!t) return undefined;
    return getTransferArticles(destStoreId).find(a =>
      formatArticleLabel(a).toLowerCase() === t || a.code.toLowerCase() === t || a.name.toLowerCase() === t
    );
  };

  const handleAddTransferLine = (focusNew = false) => {
    setTransferLines([...transferLines, { article_id: "", quantity: 1, query: "" }]);
    if (focusNew) {
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>("input[data-transfer-article]");
        inputs[inputs.length - 1]?.focus();
      }, 0);
    }
  };

  const handleRemoveTransferLine = (index: number) => {
    if (!window.confirm("Supprimer cette ligne de transfert ?")) return;
    setTransferLines(transferLines.filter((_, idx) => idx !== index));
  };

  const handleSaveNewTransfer = async (e: FormEvent) => {
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
    const sourceStore = stores.find(store => store.id === sourceStoreId);
    if (transferKind === "STORE_RETURN") {
      if (destinationStore?.store_type !== "CENTRAL_WAREHOUSE" || sourceStore?.store_type === "CENTRAL_WAREHOUSE") {
        alert("Un retour doit être envoyé d'un magasin vers un entrepôt.");
        return;
      }
      if (transferLines.some(line => !line.return_reason)) {
        alert("Indiquez le motif de retour de chaque article.");
        return;
      }
    }
    if (transferKind === "RECYCLING" && (sourceStore?.store_type !== "CENTRAL_WAREHOUSE" || destinationStore?.store_type !== "MANUFACTURER")) {
      alert("Un transfert de recyclage doit aller d'un entrepôt vers un magasin de production.");
      return;
    }
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
      const availableQuantity = getDispatchableStock(sourceStoreId, line.article_id, editingTransfer?.id);
      const requestedForArticle = transferLines
        .filter(item => item.article_id === line.article_id)
        .reduce((total, item) => total + Number(item.quantity), 0);
      return !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || requestedForArticle > availableQuantity;
    });
    if (invalidLine) {
      const article = articles.find(item => item.id === invalidLine.article_id);
      const requestedQuantity = Number(invalidLine.quantity);
      const dispatchable = getDispatchableStock(sourceStoreId, invalidLine.article_id, editingTransfer?.id);
      alert(`Stock insuffisant pour ${article?.name || "cet article"}. Demandé : ${requestedQuantity}. Répartissable : ${dispatchable}.`);
      return;
    }

    const type = transferKind === "STANDARD" ? getTransferTypeCode(sourceStoreId, destStoreId) : transferKind;
    const transferNumber = generateRef("TRF", transfers.length);
    const transferId = editingTransfer?.id || `trf-${crypto.randomUUID()}`;

    const lines: StockTransferLine[] = transferLines.map((line, idx) => {
      const art = articles.find(a => a.id === line.article_id);
      return {
        id: `line-${Date.now()}-${idx}`,
        transfer_id: transferId,
        article_id: line.article_id,
        article_code: art?.code || "REF",
        article_name: art?.name || "Article",
        unit: art?.unit || "Unité",
        quantity_sent: Number(line.quantity),
        quantity_received: 0,
        quantity_accepted: 0,
        quantity_rejected: 0,
        ...(transferKind !== "STANDARD" && line.return_reason ? { return_reason: line.return_reason } : {}),
        ...(transferKind !== "STANDARD" && line.batch_number?.trim() ? { batch_number: line.batch_number.trim() } : {}),
        ...(transferKind !== "STANDARD" && line.expiry_date ? { expiry_date: line.expiry_date } : {})
      };
    });

    const newTransfer: StockTransfer = {
      id: transferId,
      transfer_number: editingTransfer?.transfer_number || transferNumber,
      type,
      source_store_id: sourceStoreId,
      destination_store_id: destStoreId,
      status: "DRAFT",
      requested_by: editingTransfer?.requested_by || currentUser.uid,
      requested_by_name: editingTransfer?.requested_by_name || currentUser.displayName || currentUser.email,
      lines: lines.map((line, index) => ({
        ...line,
        id: editingTransfer?.lines[index]?.id || line.id,
        transfer_id: transferId
      })),
      note: transferNote,
      has_discrepancy: false,
      created_at: editingTransfer?.created_at || Date.now(),
      updated_at: editingTransfer ? Math.max(Date.now(), editingTransfer.updated_at + 1) : Date.now(),
    };

    const saved = editingTransfer
      ? await onUpdateTransfer(editingTransfer, newTransfer)
      : await onCreateTransfer(newTransfer);
    if (saved) {
      setIsCreateModalOpen(false);
      setEditingTransfer(null);
    }
  };

  const transferFormIssue = sourceStoreId === destStoreId
    ? "Choisissez deux magasins différents pour créer le transfert."
    : transferKind === "STORE_RETURN" && transferLines.some(line => !line.return_reason)
      ? "Indiquez le motif de retour de chaque article."
      : transferLines.some(line => !line.article_id)
      ? "Sélectionnez un article dans chaque ligne avant de continuer."
      : transferLines.some(line => {
        const requested = transferLines
          .filter(item => item.article_id === line.article_id)
          .reduce((total, item) => total + Number(item.quantity), 0);
        return !Number.isFinite(Number(line.quantity))
          || Number(line.quantity) <= 0
          || requested > getDispatchableStock(sourceStoreId, line.article_id, editingTransfer?.id);
      })
        ? "Le stock disponible ne couvre pas toutes les quantités demandées."
        : transferLines.some(line => !getTransferArticles(destStoreId).some(article => article.id === line.article_id))
          ? "Un article n'est pas autorisé pour le magasin destinataire."
          : "";

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

        {canCreate && sourceStores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(currentUser.roleId === "ADMIN" || currentUser.roleId === "SUPER_ADMIN")
              && primaryCentralStore
              && stores.some(store => store.store_type === "POS" && store.is_active) && (
              <button
                type="button"
                onClick={() => {
                  setDistributionArticleId(articles.find(article => article.article_type === "RESALE")?.id || "");
                  setDistributionPlan(null);
                  setIsDistributionModalOpen(true);
                }}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                Répartition sur demande
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nouveau Transfert
            </button>
          </div>
        )}
      </div>

      {/* Workflow Steps Indicator Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xs overflow-x-auto">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
          Cycle de Vie d'un Transfert GILEADA (Section 3 & 4) :
        </div>
        <div className="flex items-center gap-2 text-xs font-mono min-w-max">
          <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700">1. Demande</span>
          <span className="text-slate-500">→</span>
          <span className="bg-blue-950 text-blue-300 px-2.5 py-1 rounded-md border border-blue-800">2. Approbation (Admin)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-indigo-950 text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-800">3. Expédition (stock source débité)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-amber-950 text-amber-300 px-2.5 py-1 rounded-md border border-amber-800">4. En transit</span>
          <span className="text-slate-500">→</span>
          <span className="bg-purple-950 text-purple-300 px-2.5 py-1 rounded-md border border-purple-800">5. Réception (magasin destinataire)</span>
          <span className="text-slate-500">→</span>
          <span className="bg-emerald-950 text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-800">6. Validé (stock accepté crédité)</span>
          <span className="text-slate-500">/</span>
          <span className="bg-rose-950 text-rose-300 px-2.5 py-1 rounded-md border border-rose-800">Écart à traiter</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {[
            ["ALL", "Tous"],
            ["DRAFT", "En attente"],
            ["APPROVED", "Approuvés"],
            ["REJECTED", "Refusés"],
            ["IN_TRANSIT", "En transit"],
            ["RECEIVED", "Reçus"],
            ["VALIDATED", "Validés"],
            ["DISCREPANCY", "Avec écart"]
          ].map(([st, label]) => (
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
              {label}
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

      {returnsByStore.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Retours reçus par magasin source</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-1.5">Magasin</th>
                <th className="py-1.5">Motif</th>
                <th className="py-1.5 text-right">Quantité</th>
                <th className="py-1.5 text-right">Valeur (prix d'achat, Ar)</th>
              </tr>
            </thead>
            <tbody>
              {returnsByStore.map(row => (
                <tr key={row.key} className="border-b border-slate-50">
                  <td className="py-1.5 font-semibold text-slate-800">{row.storeName}</td>
                  <td className="py-1.5">{row.reasonLabel}</td>
                  <td className="py-1.5 text-right font-mono">{row.quantity}</td>
                  <td className="py-1.5 text-right font-mono">{row.value.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transfers List */}
      <div className="space-y-4">
        {filteredTransfers.length > 0 ? (
          filteredTransfers.map((t) => {
            const src = stores.find(s => s.id === t.source_store_id);
            const dst = stores.find(s => s.id === t.destination_store_id);
            const totalSent = t.lines.reduce((acc, l) => acc + l.quantity_sent, 0);
            const totalAccepted = t.lines.reduce((acc, l) => acc + l.quantity_accepted, 0);
            const totalRejected = t.lines.reduce((acc, l) => acc + l.quantity_rejected, 0);

            const isReceiver = currentUser.storeIds.includes(t.destination_store_id)
              && currentUser.uid !== t.requested_by
              && currentUser.uid !== t.approved_by;
            const isSupplierDelivery = t.type === "SUPPLIER_TO_STORE";
            const isSourceOperator = currentUser.roleId === "ADMIN"
              || currentUser.roleId === "SUPER_ADMIN"
              || (!isSupplierDelivery && currentUser.storeIds.includes(t.source_store_id));

            return (
              <div 
                key={t.id} 
                className={`bg-white rounded-2xl border p-5 shadow-xs transition hover:shadow-md ${
                  t.status === "DISCREPANCY" ? "border-rose-300 bg-rose-50/20" :
                  t.status === "IN_TRANSIT" ? "border-amber-300" :
                  t.status === "VALIDATED" ? "border-emerald-200" :
                  t.status === "REJECTED" ? "border-rose-200 bg-rose-50/20" : "border-slate-200"
                }`}
              >
                
                {/* Header row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {t.transfer_number}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 font-mono">
                      Type: {isSupplierDelivery ? "Achat fournisseur" : ({ STORE_RETURN: "Retour magasin", RECYCLING: "Recyclage" }[t.type as string] || t.type)}
                    </span>
                    {isSupplierDelivery && t.purchase_number && <span className="text-xs font-medium text-teal-700">Achat {t.purchase_number}</span>}
                    <span className="text-xs text-slate-400">
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Demandeur : {t.requested_by_name}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      t.status === "VALIDATED" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                      t.status === "IN_TRANSIT" ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse" :
                      t.status === "APPROVED" ? "bg-blue-100 text-blue-800 border-blue-300" :
                      t.status === "DISCREPANCY" ? "bg-rose-100 text-rose-800 border-rose-300" :
                      t.status === "REJECTED" ? "bg-rose-100 text-rose-800 border-rose-300" :
                      t.status === "DRAFT" ? "bg-slate-100 text-slate-800 border-slate-300" : "bg-purple-100 text-purple-800 border-purple-300"
                    }`}>
                      {{
                        DRAFT: "En attente d'approbation",
                        APPROVED: "Approuvé",
                        SHIPPED: "Expédié",
                        IN_TRANSIT: "En transit",
                        RECEIVED: "Reçu",
                        VALIDATED: "Réception validée",
                        DISCREPANCY: "Écart à traiter",
                        REJECTED: "Refusé",
                        CANCELLED: "Annulé"
                      }[t.status]}
                    </span>
                  </div>
                </div>

                {/* Source & Destination Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500">{isSupplierDelivery ? "Fournisseur :" : "Expéditeur (Source) :"}</span>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">{t.source_name || src?.name || t.source_store_id}</div>
                    {src && <div className="text-slate-500 font-mono">Code: {src.code} • Type: {src.store_type}</div>}
                    {t.shipped_at && (
                      <div className="text-indigo-600 mt-1 font-medium">
                        Expédié le : {new Date(t.shipped_at).toLocaleString("fr-FR")} ({t.shipped_by_name})
                      </div>
                    )}
                    {t.approved_by_name && (
                      <div className="mt-1 font-medium text-blue-700">
                        Approuvé par {t.approved_by_name}
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
                        <th className="py-1 px-2 text-right">{isSupplierDelivery ? "Qté commandée" : "Qté expédiée"}</th>
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
                  {t.status === "REJECTED" && t.rejection_note && (
                    <p className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      Motif du refus : {t.rejection_note}
                      {t.rejected_by_name && <span className="ml-1 text-rose-600">— {t.rejected_by_name}</span>}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    
                    {["IN_TRANSIT", "RECEIVED", "VALIDATED", "DISCREPANCY"].includes(t.status) && (
                      <button type="button" onClick={() => setDeliveryTransfer(t)} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-800">
                        Bon de livraison
                      </button>
                    )}
                    {t.status === "DRAFT" && t.requested_by === currentUser.uid && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(t)}
                        className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                    )}
                    {t.status === "DRAFT" && currentUser.roleId === "SUPER_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Supprimer le brouillon ${t.transfer_number} ?`)) {
                            void onDeleteTransfer(t);
                          }
                        }}
                        className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                        title="Supprimer le brouillon (super administrateur)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    )}
                    {/* Step 1 -> 2: Approve DRAFT */}
                    {t.status === "DRAFT" && canApprove && currentUser.uid !== t.requested_by && (
                      <button
                        type="button"
                        onClick={() => onApproveTransfer(t.id)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Approuver le Transfert
                      </button>
                    )}
                    {t.status === "DRAFT" && canReject && currentUser.uid !== t.requested_by && (
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingTransfer(t);
                          setRejectionNote("");
                        }}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Refuser
                      </button>
                    )}

                    {/* Step 2 -> 3: Ship APPROVED -> Sets IN_TRANSIT, deducts source stock */}
                    {t.status === "APPROVED" && canShip && isSourceOperator && (
                      <button
                        type="button"
                        onClick={() => onShipTransfer(t.id)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Expédier depuis le magasin source
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
                        {isSupplierDelivery ? "Réceptionner l'achat au Magasin" : "Réceptionner & Valider au Magasin"}
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

      {/* ON-DEMAND STOCK DISTRIBUTION MODAL */}
      {isDistributionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Répartition sur demande</h3>
                <p className="text-xs text-slate-500 mt-1">Le calcul favorise les points de vente les moins approvisionnés.</p>
              </div>
              <button type="button" onClick={() => setIsDistributionModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="distribution-article">Article à répartir</label>
                <select
                  id="distribution-article"
                  value={distributionArticleId}
                  onChange={event => {
                    setDistributionArticleId(event.target.value);
                    setDistributionPlan(null);
                  }}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5"
                >
                  {articles.filter(article => article.article_type === "RESALE").map(article => (
                    <option key={article.id} value={article.id}>[{article.code}] {article.name} ({article.unit})</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Les transferts déjà en brouillon ou approuvés sont déduits avant le calcul.
              </div>

              <button
                type="button"
                onClick={() => setDistributionPlan(calculateStockDistribution(distributionArticleId))}
                disabled={!distributionArticleId}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
              >
                Calculer la répartition
              </button>

              {distributionPlan && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                    <span>Stock central : <strong>{formatQuantity(distributionPlan.centralStock, distributionPlan.article.unit)} {distributionPlan.article.unit}</strong></span>
                    <span>Déjà engagé : <strong>{formatQuantity(distributionPlan.pendingStock, distributionPlan.article.unit)} {distributionPlan.article.unit}</strong></span>
                    <span>À répartir : <strong>{formatQuantity(distributionPlan.distributableStock, distributionPlan.article.unit)} {distributionPlan.article.unit}</strong></span>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr><th className="px-3 py-2">Point de vente</th><th className="px-3 py-2 text-right">Stock actuel</th><th className="px-3 py-2 text-right">À transférer</th><th className="px-3 py-2 text-right">Après transfert</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {distributionPlan.allocations.map(allocation => (
                          <tr key={allocation.store.id}>
                            <td className="px-3 py-2 font-medium text-slate-800">{allocation.store.name}</td>
                            <td className="px-3 py-2 text-right">{formatQuantity(allocation.currentStock, distributionPlan.article.unit)} {distributionPlan.article.unit}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-800">{formatQuantity(allocation.quantity, distributionPlan.article.unit)} {distributionPlan.article.unit}</td>
                            <td className="px-3 py-2 text-right">{formatQuantity(allocation.currentStock + allocation.quantity, distributionPlan.article.unit)} {distributionPlan.article.unit}</td>
                          </tr>
                        ))}
                        {distributionPlan.allocations.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Aucun stock disponible après réserve et transferts en attente.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button type="button" onClick={() => setIsDistributionModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Fermer</button>
                <button
                  type="button"
                  onClick={handleCreateDistributionDrafts}
                  disabled={!distributionPlan?.allocations.length}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl"
                >
                  Créer les transferts brouillons
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectingTransfer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={event => {
              event.preventDefault();
              const note = rejectionNote.trim();
              if (!note) return;
              void onRejectTransfer(rejectingTransfer.id, note).then(rejected => {
                if (rejected) {
                  setRejectingTransfer(null);
                  setRejectionNote("");
                }
              });
            }}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
          >
            <h3 className="text-base font-bold">Refuser la demande {rejectingTransfer.transfer_number}</h3>
            <p className="mt-1 text-sm text-slate-600">Le demandeur verra ce motif. Un refus ne modifie pas le stock.</p>
            <label className="mt-4 block text-xs font-bold text-slate-700" htmlFor="transfer-rejection-note">Motif du refus</label>
            <textarea
              id="transfer-rejection-note"
              required
              autoFocus
              rows={3}
              value={rejectionNote}
              onChange={event => setRejectionNote(event.target.value)}
              placeholder="Indiquez pourquoi la demande est refusée…"
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingTransfer(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!rejectionNote.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Confirmer le refus
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE TRANSFER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl max-h-[90vh] overflow-y-auto w-full p-5 sm:p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{editingTransfer ? `Modifier le brouillon ${editingTransfer.transfer_number}` : "Nouveau transfert"}</h3>
                  <p className="text-xs text-slate-500">{editingTransfer ? "Modifiez le trajet, les articles, les quantités ou les instructions avant approbation." : "Demandez un transfert depuis votre magasin vers un autre magasin."}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                aria-label="Fermer le formulaire de transfert"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewTransfer} className="mt-5 space-y-5">
              <section aria-labelledby="transfer-kind-heading">
                <h4 id="transfer-kind-heading" className="mb-2 text-sm font-bold text-slate-800">Nature du transfert</h4>
                <select
                  value={transferKind}
                  disabled={Boolean(editingTransfer)}
                  onChange={event => changeTransferKind(event.target.value as "STANDARD" | "STORE_RETURN" | "RECYCLING")}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  <option value="STANDARD">Transfert standard</option>
                  <option value="STORE_RETURN">Retour magasin → entrepôt (défaut, péremption, étiquette usée)</option>
                  <option value="RECYCLING">Entrepôt → magasin de production (recyclage)</option>
                </select>
                {transferKind === "STORE_RETURN" && (
                  <p className="mt-2 text-xs text-slate-500">L'entrepôt réceptionne les articles, puis les envoie en production, qui décide : recycler ou détruire.</p>
                )}
              </section>

              <section aria-labelledby="transfer-route-heading">
                <div className="mb-2">
                  <h4 id="transfer-route-heading" className="text-sm font-bold text-slate-800">1. Trajet</h4>
                  <p className="text-xs text-slate-500">Recherchez par nom ou code magasin.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Magasin expéditeur</label>
                    <SearchableSelect
                      value={sourceStoreId}
                      options={sourceStoreOptions}
                      onChange={setSourceStoreId}
                      placeholder="Rechercher un magasin source…"
                      className="w-full"
                    />
                  </div>
                  <ArrowRightLeft className="hidden h-5 w-5 text-slate-400 sm:block sm:mb-2.5" aria-hidden="true" />
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">Magasin destinataire</label>
                    <SearchableSelect
                      value={destStoreId}
                      options={storeOptions}
                      onChange={nextDestinationStoreId => {
                        setDestStoreId(nextDestinationStoreId);
                        const allowedArticles = getTransferArticles(nextDestinationStoreId);
                        setTransferLines(lines => lines.map(line => ({
                          ...line,
                          article_id: allowedArticles.some(article => article.id === line.article_id) ? line.article_id : "",
                          query: undefined
                        })));
                      }}
                      placeholder="Rechercher un magasin destinataire…"
                      className="w-full"
                    />
                  </div>
                </div>
                {sourceStoreId === destStoreId && (
                  <p className="mt-2 text-xs font-medium text-amber-700" role="alert">
                    Le magasin expéditeur et le destinataire doivent être différents.
                  </p>
                )}
              </section>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                <strong>À savoir :</strong> le stock source est débité à l'expédition. Le destinataire est crédité uniquement des quantités acceptées après son contrôle de réception. Les transferts en attente sont déjà déduits du stock disponible.
              </div>

              <section aria-labelledby="transfer-items-heading">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <h4 id="transfer-items-heading" className="text-sm font-bold text-slate-800">2. Articles</h4>
                    <p className="text-xs text-slate-500">Le stock disponible est vérifié automatiquement.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddTransferLine(true)}
                    className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                  </button>
                </div>

                <datalist id="transfer-article-options">
                  {getTransferArticles(destStoreId).map((a) => (
                    <option key={a.id} value={formatArticleLabel(a)} />
                  ))}
                </datalist>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {transferLines.map((line, idx) => {
                    const selectedArticle = articles.find(article => article.id === line.article_id);
                    const availableStock = selectedArticle ? getDispatchableStock(sourceStoreId, selectedArticle.id, editingTransfer?.id) : 0;
                    const requestedForArticle = selectedArticle
                      ? transferLines
                        .filter(item => item.article_id === selectedArticle.id)
                        .reduce((total, item) => total + Number(item.quantity), 0)
                      : 0;
                    const stockIsSufficient = Boolean(selectedArticle) && requestedForArticle <= availableStock;
                    const quantityStep = getQuantityStep(selectedArticle?.unit || "");
                    return (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
                        <input
                          type="text"
                          list="transfer-article-options"
                          data-transfer-article
                          aria-label={`Article de la ligne ${idx + 1}`}
                          autoComplete="off"
                          placeholder="Rechercher par code ou nom d'article…"
                          value={line.query ?? (selectedArticle ? formatArticleLabel(selectedArticle) : "")}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const text = e.target.value;
                            const match = findTransferArticle(text);
                            setTransferLines(lines => lines.map((l, i) => i === idx
                              ? { ...l, query: text, article_id: match?.id || "" }
                              : l));
                          }}
                          onBlur={() => setTransferLines(lines => lines.map((l, i) => i === idx ? { ...l, query: undefined } : l))}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={quantityStep}
                            step={quantityStep}
                            aria-label={`Quantité à transférer (${selectedArticle?.unit || "unité"})`}
                            value={line.quantity}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddTransferLine(true);
                              }
                            }}
                            onChange={(e) => {
                              const nextQuantity = Number(e.target.value);
                              setTransferLines(lines => lines.map((item, i) => i === idx
                                ? { ...item, quantity: Math.max(quantityStep, nextQuantity || quantityStep) }
                                : item));
                            }}
                            className="min-w-0 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-right font-mono text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            placeholder="Qté"
                          />
                          <span className="max-w-16 shrink-0 truncate text-xs font-medium text-slate-600" title={selectedArticle?.unit}>{selectedArticle?.unit || "Unité"}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          {selectedArticle ? (
                            <p className={`text-xs font-semibold ${stockIsSufficient ? "text-emerald-700" : "text-rose-700"}`} role="status">
                              {stockIsSufficient
                                ? `${formatQuantity(availableStock, selectedArticle.unit)} ${selectedArticle.unit} disponible`
                                : `Stock insuffisant : ${formatQuantity(availableStock, selectedArticle.unit)} disponible pour ${formatQuantity(requestedForArticle, selectedArticle.unit)} demandé`}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-500">Choisissez un article dans la liste.</p>
                          )}
                          {transferLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTransferLine(idx)}
                            className="shrink-0 rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                            title="Supprimer la ligne"
                            aria-label={`Supprimer la ligne ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          )}
                        </div>
                        {transferKind !== "STANDARD" && (
                          <div className="grid grid-cols-1 gap-2 sm:col-span-3 sm:grid-cols-3">
                            <select
                              aria-label={`Motif de la ligne ${idx + 1}`}
                              value={line.return_reason || ""}
                              onChange={event => setTransferLines(lines => lines.map((item, i) => i === idx
                                ? { ...item, return_reason: (event.target.value || undefined) as ReturnReason | undefined }
                                : item))}
                              className="rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
                            >
                              <option value="">Motif{transferKind === "STORE_RETURN" ? " (obligatoire)" : ""}…</option>
                              {(Object.keys(RETURN_REASON_LABELS) as ReturnReason[]).map(reason => (
                                <option key={reason} value={reason}>{RETURN_REASON_LABELS[reason]}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              aria-label={`Lot de la ligne ${idx + 1}`}
                              placeholder="N° de lot (optionnel)"
                              value={line.batch_number || ""}
                              onChange={event => setTransferLines(lines => lines.map((item, i) => i === idx ? { ...item, batch_number: event.target.value } : item))}
                              className="rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
                            />
                            <input
                              type="date"
                              aria-label={`Date de péremption de la ligne ${idx + 1}`}
                              value={line.expiry_date || ""}
                              onChange={event => setTransferLines(lines => lines.map((item, i) => i === idx ? { ...item, expiry_date: event.target.value } : item))}
                              className="rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  3. Motif ou instructions <span className="font-normal text-slate-500">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="Ex. : réapprovisionnement régulier, commande spéciale…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                <div aria-live="polite">
                  {transferFormIssue && (
                    <p className="text-xs font-medium text-rose-700">{transferFormIssue}</p>
                  )}
                  {!transferFormIssue && (
                    <p className="text-xs text-slate-500">La demande sera envoyée à l'administration pour approbation.</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={Boolean(transferFormIssue)}
                  className="cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {editingTransfer ? "Enregistrer les modifications" : "Envoyer la demande"}
                </button>
                </div>
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

      {deliveryTransfer && <DeliveryNote transfer={deliveryTransfer} stores={stores} onClose={() => setDeliveryTransfer(null)} />}
    </div>
  );
}
