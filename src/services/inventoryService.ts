import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { prepareFundDebit } from "./treasuryService";
import { transferLineDataEqual } from "./transferLineEquality";
import { transferLinesEqual } from "./transferComparison";
import { canPurchaseArticle } from "./purchaseEligibility";
import { canConfirmReceiptActors, isAssignedDepotManager, posReceiptProof } from "./transferReceipt";
import { cancellationEffects } from "./transferCancellation";
import type { AppUser } from "../types";
import { createAuditLog } from "./auditService";
import { Article, AuditLog, Category, Purchase, PurchaseLine, StockMovement, StockTransfer, Store, StoreStock, Supplier, SupplierPayment } from "../types";

const STORES_COLLECTION = "stores";
const STOCKS_COLLECTION = "stocks";
const ARTICLES_COLLECTION = "articles";
const CATEGORIES_COLLECTION = "categories";
const SUPPLIERS_COLLECTION = "suppliers";
const PURCHASES_COLLECTION = "purchases";
const MOVEMENTS_COLLECTION = "movements";
const TRANSFERS_COLLECTION = "transfers";
const USERS_COLLECTION = "users";

export async function cancelTransfer(original: StockTransfer, user: AppUser) {
  if (user.roleId !== "SUPER_ADMIN") throw new Error("Annulation réservée au Super Admin.");
  const effects = cancellationEffects(original);
  const grouped = new Map<string, typeof effects[number]>();
  for (const effect of effects) {
    const key = `${effect.storeId}:${effect.articleId}:${effect.quarantine}`;
    grouped.set(key, { ...effect, quantity: effect.quantity + (grouped.get(key)?.quantity || 0) });
  }
  const targets = await Promise.all([...grouped.values()].filter(effect => effect.quantity !== 0).map(async effect => {
    const rows = await getDocs(query(collection(db, STOCKS_COLLECTION), where("store_id", "==", effect.storeId), where("article_id", "==", effect.articleId)));
    if (rows.size > 1) throw new Error("Plusieurs stocks existent pour cet article. Corrigez les doublons avant annulation.");
    return { effect, ref: rows.docs[0]?.ref || doc(db, STOCKS_COLLECTION, `stock-${effect.storeId}-${effect.articleId}`) };
  }));
  return runOnlineTransaction(async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, original.id);
    const snapshot = await transaction.get(transferRef);
    if (!snapshot.exists()) throw new Error("Transfert introuvable.");
    const current = snapshot.data() as StockTransfer;
    if (current.status !== original.status || current.updated_at !== original.updated_at || !transferLinesEqual(current.lines, original.lines)) {
      throw new Error("Le transfert a changé. Rechargez les données avant annulation.");
    }
    cancellationEffects(current);
    const snapshots = await Promise.all(targets.map(target => transaction.get(target.ref)));
    const now = Date.now();
    const transfer = { ...current, status: "CANCELLED" as const, cancelled_by: user.uid, cancelled_by_name: user.displayName || user.email, cancelled_at: now, updated_at: now };
    const stocks: StoreStock[] = [];
    const movements: StockMovement[] = [];
    targets.forEach(({ effect, ref }, index) => {
      const stock = snapshots[index].exists() ? snapshots[index].data() as StoreStock : undefined;
      const before = (effect.quarantine ? stock?.quarantine_quantity : stock?.quantity) || 0;
      const after = before + effect.quantity;
      if (!Number.isFinite(after) || after < 0 || (!effect.quarantine && after < (stock?.reserved_quantity || 0))) {
        throw new Error(`Annulation impossible : stock disponible insuffisant pour ${effect.articleId} dans ${effect.storeId}.`);
      }
      const updated: StoreStock = { ...stock, id: ref.id, store_id: effect.storeId, article_id: effect.articleId, quantity: effect.quarantine ? stock?.quantity || 0 : after, reserved_quantity: stock?.reserved_quantity || 0, updated_at: now, ...(effect.quarantine ? { quarantine_quantity: after } : {}) };
      const movement: StockMovement = { id: `cancel-${original.id}-${index}`, store_id: effect.storeId, article_id: effect.articleId, movement_type: "INVENTORY_ADJUSTMENT", quantity: effect.quantity, reference_type: "TRANSFER", reference_id: original.id, reference_number: original.transfer_number, before_quantity: before, after_quantity: after, created_by: user.uid, created_by_name: user.displayName || user.email, created_at: now, notes: "Annulation du transfert", ...(effect.quarantine ? { stock_bucket: "QUARANTINE" as const } : {}) };
      stocks.push(updated);
      movements.push(movement);
    });
    const auditLog = createAuditLog(user, "TRANSFER_CANCELLED", "TRANSFER", original.id, current, transfer, original.source_store_id);
    stocks.forEach((stock, index) => transaction.set(targets[index].ref, omitUndefined(stock)));
    movements.forEach(movement => transaction.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement)));
    transaction.set(transferRef, omitUndefined(transfer));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
    return { transfer, stocks, movements, auditLog };
  });
}

function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => omitUndefined(item)).filter(item => item !== undefined) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, omitUndefined(fieldValue)])
    ) as T;
  }
  return value;
}

export async function loadStores(): Promise<Store[]> {
  return (await getDocs(collection(db, STORES_COLLECTION))).docs.map(snapshot => snapshot.data() as Store);
}

export async function loadInventoryData(storeIds?: string[]): Promise<{ stores: Store[]; stocks: StoreStock[]; movements: StockMovement[]; transfers: StockTransfer[] }> {
  const restricted = storeIds !== undefined;
  const loadRestricted = async <T>(collectionName: string, field: string): Promise<T[]> => {
    if (!restricted) return (await getDocs(collection(db, collectionName))).docs.map(item => item.data() as T);
    if (storeIds.length === 0) return [];
    const snapshots = await Promise.all(storeIds.map(storeId =>
      getDocs(query(collection(db, collectionName), where(field, "==", storeId)))
    ));
    return [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(item => [item.id, item.data() as T])).values()];
  };
  const [storesSnapshot, stocks, movements, sourceTransfers, destinationTransfers] = await Promise.all([
    getDocs(collection(db, STORES_COLLECTION)),
    loadRestricted<StoreStock>(STOCKS_COLLECTION, "store_id"),
    loadRestricted<StockMovement>(MOVEMENTS_COLLECTION, "store_id"),
    loadRestricted<StockTransfer>(TRANSFERS_COLLECTION, "source_store_id"),
    restricted ? loadRestricted<StockTransfer>(TRANSFERS_COLLECTION, "destination_store_id") : Promise.resolve([])
  ]);

  return {
    stores: storesSnapshot.docs.map(snapshot => snapshot.data() as Store),
    stocks,
    movements,
    transfers: [...new Map([...sourceTransfers, ...destinationTransfers].map(item => [item.id, item])).values()]
  };
}

export async function saveTransfer(transfer: StockTransfer, auditLog?: AuditLog): Promise<void> {
  if (transfer.status !== "DRAFT") {
    await runOnlineTransaction(async transaction => {
      transaction.set(doc(db, TRANSFERS_COLLECTION, transfer.id), omitUndefined(transfer));
      if (auditLog) transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
    });
    return;
  }
  if (!auditLog) {
    await setDoc(doc(db, TRANSFERS_COLLECTION, transfer.id), omitUndefined(transfer));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, TRANSFERS_COLLECTION, transfer.id), omitUndefined(transfer));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function updateDraftTransfer(
  original: StockTransfer,
  updated: StockTransfer,
  auditLog: AuditLog
): Promise<void> {
  if (
    original.status !== "DRAFT" ||
    updated.status !== "DRAFT" ||
    original.requested_by !== updated.requested_by ||
    original.id !== updated.id ||
    original.transfer_number !== updated.transfer_number ||
    original.created_at !== updated.created_at
  ) {
    throw new Error("Seul le demandeur peut modifier un transfert encore en brouillon.");
  }

  await runOnlineTransaction(async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, original.id);
    const snapshot = await transaction.get(transferRef);
    if (!snapshot.exists()) throw new Error("Ce transfert n'existe plus.");
    const current = snapshot.data() as StockTransfer;
    if (
      current.status !== "DRAFT" ||
      current.requested_by !== original.requested_by ||
      current.updated_at !== original.updated_at ||
      !transferLinesEqual(current.lines, original.lines)
    ) {
      throw new Error("Le transfert a changé depuis son ouverture. Rechargez les données avant de le modifier.");
    }
    transaction.set(transferRef, omitUndefined(updated));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function deleteDraftTransfer(transfer: StockTransfer, auditLog: AuditLog): Promise<void> {
  await runOnlineTransaction(async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const snapshot = await transaction.get(transferRef);
    const current = snapshot.exists() ? snapshot.data() as StockTransfer : undefined;
    // An approved transfer has not moved any stock yet, so deleting it only releases its reservation.
    if (!current || !["DRAFT", "APPROVED"].includes(current.status) || (current.status === "APPROVED" && current.purchase_id)) {
      throw new Error("Seul un transfert en brouillon ou approuvé (non expédié) peut être supprimé.");
    }
    transaction.delete(transferRef);
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({
      ...auditLog,
      old_value: snapshot.data()
    }));
  });
}

export async function recordTransferReceipt(transfer: StockTransfer, auditLog: AuditLog): Promise<void> {
  if (
    transfer.status !== "RECEIVED" ||
    !transfer.received_by ||
    transfer.validated_by ||
    !Array.isArray(transfer.lines)
  ) {
    throw new Error("La réception doit être enregistrée avant sa confirmation.");
  }

  await runOnlineTransaction(async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const storeRef = doc(db, STORES_COLLECTION, transfer.destination_store_id);
    const [transferSnapshot, storeSnapshot] = await Promise.all([
      transaction.get(transferRef),
      transaction.get(storeRef)
    ]);
    if (!transferSnapshot.exists() || (transferSnapshot.data() as StockTransfer).status !== "IN_TRANSIT") {
      throw new Error("Ce transfert n'est plus en attente de réception.");
    }
    if (!storeSnapshot.exists()) throw new Error("Le magasin destinataire est introuvable.");
    transaction.set(transferRef, omitUndefined(transfer));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

// Persists a transfer status change together with the stock/movement side effects it triggers (ship or receive).
export async function saveTransferWithStockEffects(
  transfer: StockTransfer,
  updatedStocks: StoreStock[],
  movements: StockMovement[],
  auditLog?: AuditLog,
  purchaseAuditLog?: AuditLog,
  options: { recyclingDecision?: boolean } = {}
): Promise<{ stocks: StoreStock[]; movements: StockMovement[] }> {
  const persistedStocks: StoreStock[] = [];
  const persistedMovements: StockMovement[] = [];
  const groupedMovements = new Map<string, StockMovement>();
  movements.forEach(movement => {
    const key = `${movement.store_id}:${movement.article_id}:${movement.stock_bucket || ""}`;
    const existing = groupedMovements.get(key);
    groupedMovements.set(key, existing
      ? { ...existing, quantity: existing.quantity + movement.quantity }
      : movement);
  });
  await runOnlineTransaction(async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) throw new Error("Transfert introuvable.");
    const currentTransfer = transferSnapshot.data() as StockTransfer;
    let receiptActorsAllowed = false;
    if (currentTransfer.status === "RECEIVED" && transfer.validated_by) {
      const [profileSnapshot, destinationSnapshot] = await Promise.all([
        transaction.get(doc(db, USERS_COLLECTION, transfer.validated_by)),
        transaction.get(doc(db, STORES_COLLECTION, currentTransfer.destination_store_id))
      ]);
      const profile = profileSnapshot.data();
      const depotManagerConfirmation = profile?.status === "ACTIVE" &&
        isAssignedDepotManager({ roleId: profile.role, storeIds: profile.assignedStores || [] }, destinationSnapshot.data() as Store | undefined);
      receiptActorsAllowed = canConfirmReceiptActors(
        currentTransfer, transfer.validated_by, destinationSnapshot.data() as Store | undefined,
        depotManagerConfirmation || (profile?.status === "ACTIVE" && profile.role === "SUPER_ADMIN")
      );
    }
    const validTransition = options.recyclingDecision
      ? currentTransfer.type === "RECYCLING"
        && ["VALIDATED", "DISCREPANCY"].includes(currentTransfer.status)
        && currentTransfer.status === transfer.status
        && !transfer.lines.some(line => {
          const persisted = currentTransfer.lines.find(item => item.id === line.id);
          return Boolean(persisted?.recycling_decision) && persisted?.recycling_decided_at !== line.recycling_decided_at;
        })
      : currentTransfer.status === "APPROVED" && transfer.status === "IN_TRANSIT" && currentTransfer.type !== "DIRECT_DEPOSIT"
        || currentTransfer.status === "APPROVED" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status) && currentTransfer.type === "DIRECT_DEPOSIT"
        || currentTransfer.status === "IN_TRANSIT" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status)
        || currentTransfer.status === "RECEIVED" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status)
          && Boolean(currentTransfer.received_by)
          && receiptActorsAllowed
          && currentTransfer.received_by === transfer.received_by
          && transferLineDataEqual(currentTransfer.lines, transfer.lines);
    if (!validTransition) throw new Error("Le statut du transfert a changé. Rechargez les données.");
    if (currentTransfer.status === "APPROVED" && transfer.status === "IN_TRANSIT") {
      if (!transferLinesEqual(currentTransfer.lines, transfer.lines) || [...groupedMovements.values()].some(movement =>
        movement.store_id !== currentTransfer.source_store_id ||
        movement.reference_type !== "TRANSFER" || movement.reference_id !== currentTransfer.id ||
        movement.quantity !== -currentTransfer.lines.find(line => line.article_id === movement.article_id)?.quantity_sent
      ) || groupedMovements.size !== currentTransfer.lines.length) {
        throw new Error("Les mouvements d'expédition doivent correspondre exactement aux lignes approuvées.");
      }
    }
    let purchaseRef: ReturnType<typeof doc> | undefined;
    let updatedPurchase: Purchase | undefined;
    if (currentTransfer.type === "SUPPLIER_TO_STORE") {
      if (
        !currentTransfer.purchase_id ||
        !["VALIDATED", "DISCREPANCY"].includes(transfer.status) ||
        !purchaseAuditLog
      ) {
        throw new Error("La livraison fournisseur doit être liée à un achat approuvé et auditée à la réception.");
      }
      purchaseRef = doc(db, PURCHASES_COLLECTION, currentTransfer.purchase_id);
      const purchaseSnapshot = await transaction.get(purchaseRef);
      if (!purchaseSnapshot.exists()) throw new Error("L'achat lié à cette livraison est introuvable.");
      const currentPurchase = purchaseSnapshot.data() as Purchase;
      if (
        currentPurchase.status !== "APPROVED" ||
        currentPurchase.transfer_id !== currentTransfer.id ||
        currentPurchase.store_id !== currentTransfer.destination_store_id
      ) {
        throw new Error("L'achat a déjà été réceptionné ou ne correspond plus à cette livraison.");
      }
      updatedPurchase = {
        ...currentPurchase,
        status: "RECEIVED",
        received_by: transfer.received_by,
        received_by_name: transfer.received_by_name,
        received_at: transfer.received_at,
        updated_at: transfer.updated_at
      };
    }

    const targets = [...groupedMovements.values()].map(movement => {
      const fallback = updatedStocks.find(stock => stock.store_id === movement.store_id && stock.article_id === movement.article_id);
      return { movement, fallback, reference: doc(db, STOCKS_COLLECTION, fallback?.id || `stock-${movement.store_id}-${movement.article_id}`) };
    });
    const stockSnapshots = await Promise.all(targets.map(target => transaction.get(target.reference)));
    targets.forEach((target, index) => {
      const current = stockSnapshots[index].exists() ? stockSnapshots[index].data() as StoreStock : undefined;
      const quarantine = target.movement.stock_bucket === "QUARANTINE";
      const before = (quarantine ? current?.quarantine_quantity : current?.quantity) || 0;
      const after = before + target.movement.quantity;
      if (after < 0) throw new Error(`Stock insuffisant pour l'article ${target.movement.article_id}. Disponible : ${before}.`);
      // A shipped, approved transfer provides one shared authorization document
      // for large POS receipts instead of one rules lookup per catalog article.
      const transferReceipt = posReceiptProof(currentTransfer, transfer, target.movement);
      const shipmentIndex = currentTransfer.lines.findIndex(line => line.article_id === target.movement.article_id);
      const shipment = currentTransfer.status === "APPROVED" && transfer.status === "IN_TRANSIT"
        && currentTransfer.type !== "RECYCLING" && !quarantine && current
        && target.movement.store_id === currentTransfer.source_store_id
        && target.movement.quantity === -currentTransfer.lines[shipmentIndex]?.quantity_sent
        ? { transfer_shipment: { transfer_id: currentTransfer.id, line_index: shipmentIndex } } : {};
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: target.movement.store_id,
        article_id: target.movement.article_id,
        quantity: quarantine ? current?.quantity || 0 : after,
        ...(quarantine || current?.quarantine_quantity !== undefined
          ? { quarantine_quantity: quarantine ? after : current?.quarantine_quantity }
          : {}),
        reserved_quantity: current?.reserved_quantity || 0,
        ...transferReceipt,
        ...shipment,
        updated_at: transfer.updated_at
      };
      const movement = { ...target.movement, ...transferReceipt, ...shipment, before_quantity: before, after_quantity: after };
      persistedStocks.push(stock);
      persistedMovements.push(movement);
      transaction.set(target.reference, omitUndefined(stock));
      transaction.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
    });
    transaction.set(transferRef, omitUndefined(transfer));
    if (purchaseRef && updatedPurchase) {
      transaction.set(purchaseRef, omitUndefined(updatedPurchase));
      transaction.set(doc(db, "auditLogs", purchaseAuditLog!.id), omitUndefined({
        ...purchaseAuditLog,
        new_value: updatedPurchase
      }));
    }
    if (auditLog) transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return { stocks: persistedStocks, movements: persistedMovements };
}

export async function loadCatalogData(articleTypes?: Article["article_type"][]): Promise<{ articles: Article[]; categories: Category[] }> {
  const [articlesSnapshot, categoriesSnapshot] = await Promise.all([
    articleTypes === undefined
      ? getDocs(collection(db, ARTICLES_COLLECTION))
      : articleTypes.length === 0
        ? Promise.resolve(undefined)
        : getDocs(query(collection(db, ARTICLES_COLLECTION), where("article_type", "in", articleTypes))),
    getDocs(collection(db, CATEGORIES_COLLECTION))
  ]);

  return {
    articles: articlesSnapshot?.docs.map(snapshot => snapshot.data() as Article) || [],
    categories: categoriesSnapshot.docs.map(snapshot => snapshot.data() as Category)
  };
}

export async function saveArticle(article: Article, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, ARTICLES_COLLECTION, article.id), omitUndefined(article));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, ARTICLES_COLLECTION, article.id), omitUndefined(article));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function saveCategory(category: Category, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, CATEGORIES_COLLECTION, category.id), omitUndefined(category));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, CATEGORIES_COLLECTION, category.id), omitUndefined(category));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function loadProcurementData(storeIds?: string[]): Promise<{ suppliers: Supplier[]; purchases: Purchase[] }> {
  const [suppliersSnapshot, purchases] = await Promise.all([
    getDocs(collection(db, SUPPLIERS_COLLECTION)),
    storeIds === undefined
      ? getDocs(collection(db, PURCHASES_COLLECTION)).then(snapshot => snapshot.docs.map(item => item.data() as Purchase))
      : storeIds.length === 0
        ? Promise.resolve([] as Purchase[])
        : Promise.all(storeIds.map(storeId =>
            getDocs(query(collection(db, PURCHASES_COLLECTION), where("store_id", "==", storeId)))
          )).then(snapshots => [...new Map(snapshots.flatMap(snapshot => snapshot.docs)
            .map(item => [item.id, item.data() as Purchase])).values()])
  ]);

  return {
    suppliers: suppliersSnapshot.docs.map(snapshot => snapshot.data() as Supplier),
    purchases
  };
}

export async function saveSupplier(supplier: Supplier, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, SUPPLIERS_COLLECTION, supplier.id), omitUndefined(supplier));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, SUPPLIERS_COLLECTION, supplier.id), omitUndefined(supplier));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function removeSupplier(supplier: Supplier, actor: AppUser): Promise<void> {
  await runOnlineTransaction(async transaction => {
    const ref = doc(db, SUPPLIERS_COLLECTION, supplier.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().deleted_at) throw new Error("Ce fournisseur a déjà été supprimé.");
    const previous = snapshot.data() as Supplier;
    const timestamp = Date.now();
    const removed: Supplier = { ...previous, is_active: false, deleted_at: timestamp, deleted_by: actor.uid, updated_at: timestamp };
    const auditLog = createAuditLog(actor, "SUPPLIER_DELETED", "SUPPLIER", supplier.id, previous, removed);
    transaction.set(ref, omitUndefined(removed));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function saveDraftPurchase(purchase: Purchase, auditLog: AuditLog, previous?: Purchase): Promise<void> {
  if (
    purchase.status !== "DRAFT" ||
    purchase.lines.length === 0 ||
    !Number.isFinite(purchase.total) ||
    purchase.total < 0 ||
    purchase.lines.some(line =>
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.unit_cost) ||
      line.unit_cost < 0 ||
      line.total !== line.quantity * line.unit_cost
    )
  ) {
    throw new Error("L'achat doit être complet et enregistré en brouillon.");
  }
  const [storeSnapshot, supplierSnapshot, articleSnapshots] = await Promise.all([
    getDoc(doc(db, STORES_COLLECTION, purchase.store_id)),
    getDoc(doc(db, SUPPLIERS_COLLECTION, purchase.supplier_id)),
    Promise.all(purchase.lines.map(line => getDoc(doc(db, ARTICLES_COLLECTION, line.article_id))))
  ]);
  if (
    !storeSnapshot.exists() ||
    !["CENTRAL_WAREHOUSE", "MANUFACTURER"].includes(storeSnapshot.data().store_type) ||
    storeSnapshot.data().is_active !== true
  ) {
    throw new Error("Les achats de matières premières doivent être destinés à un dépôt central ou un magasin fabricant actif.");
  }
  if (!supplierSnapshot.exists() || supplierSnapshot.data().is_active !== true) {
    throw new Error("Le fournisseur sélectionné n'existe pas ou n'est plus actif.");
  }
  if (articleSnapshots.some(snapshot => !snapshot.exists() || !canPurchaseArticle(storeSnapshot.data() as Store, snapshot.data() as Article))) {
    throw new Error("Articles inactifs ou incompatibles : revente au dépôt, matières premières au dépôt ou fabricant.");
  }
  await runOnlineTransaction(async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const snapshot = await transaction.get(purchaseRef);
    if (previous) {
      if (!snapshot.exists() || snapshot.data().status !== "DRAFT" || snapshot.data().updated_at !== previous.updated_at) throw new Error("Cet achat a change. Actualisez avant de reessayer.");
    } else if (snapshot.exists()) throw new Error("Cet achat existe deja.");
    transaction.set(purchaseRef, omitUndefined(purchase));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function approvePurchase(
  purchase: Purchase,
  updatedPurchase: Purchase,
  transfer: StockTransfer,
  purchaseAuditLog: AuditLog,
  transferAuditLog: AuditLog
): Promise<void> {
  if (
    purchase.status !== "DRAFT" ||
    !purchase.created_by ||
    updatedPurchase.status !== "APPROVED" ||
    updatedPurchase.transfer_id !== transfer.id ||
    transfer.type !== "SUPPLIER_TO_STORE" ||
    transfer.status !== "IN_TRANSIT" ||
    transfer.purchase_id !== purchase.id ||
    transfer.destination_store_id !== purchase.store_id ||
    transfer.requested_by !== purchase.created_by ||
    transfer.approved_by !== updatedPurchase.approved_by ||
    transfer.lines.length !== purchase.lines.length
  ) {
    throw new Error("L'achat ou la livraison ne peut pas être approuvé dans son état actuel.");
  }
  if (new Set(purchase.lines.map(line => line.article_id)).size > 248) {
    throw new Error("Une réception ne peut pas contenir plus de 248 articles différents.");
  }

  const [storeSnapshot, articleSnapshots] = await Promise.all([
    getDoc(doc(db, STORES_COLLECTION, purchase.store_id)),
    Promise.all(purchase.lines.map(line => getDoc(doc(db, ARTICLES_COLLECTION, line.article_id))))
  ]);
  if (
    !storeSnapshot.exists() ||
    !storeSnapshot.data().is_active ||
    !["CENTRAL_WAREHOUSE", "MANUFACTURER"].includes(storeSnapshot.data().store_type)
  ) {
    throw new Error("Le magasin destinataire n'est plus un dépôt autorisé pour ces matières premières.");
  }
  if (articleSnapshots.some(snapshot => !snapshot.exists() || !canPurchaseArticle(storeSnapshot.data() as Store, snapshot.data() as Article))) {
    throw new Error("Articles inactifs ou incompatibles : revente au dépôt, matières premières au dépôt ou fabricant.");
  }
  if (transfer.lines.some(line =>
    !purchase.lines.some(purchaseLine =>
      purchaseLine.article_id === line.article_id &&
      purchaseLine.quantity === line.quantity_sent &&
      purchaseLine.id === line.id
    )
  )) {
    throw new Error("Les lignes du transfert doivent correspondre à l'achat approuvé.");
  }

  await runOnlineTransaction(async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const [purchaseSnapshot, transferSnapshot] = await Promise.all([
      transaction.get(purchaseRef),
      transaction.get(transferRef)
    ]);
    if (!purchaseSnapshot.exists() || (purchaseSnapshot.data() as Purchase).status !== "DRAFT") {
      throw new Error("L'achat a déjà été traité ou n'existe plus.");
    }
    if (transferSnapshot.exists()) throw new Error("La livraison de cet achat existe déjà.");
    transaction.set(purchaseRef, omitUndefined(updatedPurchase));
    transaction.set(transferRef, omitUndefined(transfer));
    transaction.set(doc(db, "auditLogs", purchaseAuditLog.id), omitUndefined(purchaseAuditLog));
    transaction.set(doc(db, "auditLogs", transferAuditLog.id), omitUndefined(transferAuditLog));
  });
}

export async function deletePurchase(purchase: Purchase, actor: AppUser): Promise<void> {
  if (actor.roleId !== "SUPER_ADMIN") throw new Error("Suppression réservée au super administrateur.");
  await runOnlineTransaction(async transaction => {
    const ref = doc(db, PURCHASES_COLLECTION, purchase.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Achat introuvable ou déjà supprimé.");
    const current = snapshot.data() as Purchase;
    if (!["DRAFT", "APPROVED"].includes(current.status || "") || current.amount_paid !== 0 || current.payments.length || current.received_at) throw new Error("Seuls les achats sans paiement ni réception peuvent être supprimés.");
    const transferRef = current.transfer_id ? doc(db, TRANSFERS_COLLECTION, current.transfer_id) : null;
    const transferSnapshot = transferRef ? await transaction.get(transferRef) : null;
    if (transferSnapshot?.exists()) {
      const transfer = transferSnapshot.data() as StockTransfer;
      if (transfer.purchase_id !== current.id || transfer.type !== "SUPPLIER_TO_STORE" || transfer.status !== "IN_TRANSIT") throw new Error("La livraison a déjà été traitée : suppression impossible.");
    }
    const audit = createAuditLog(actor, "PURCHASE_DELETED", "PURCHASE", current.id, current, undefined, current.store_id);
    transaction.delete(ref);
    if (transferRef && transferSnapshot?.exists()) transaction.delete(transferRef);
    transaction.set(doc(db, "auditLogs", audit.id), omitUndefined(audit));
  });
}

export async function recordSupplierPayment(purchase: Purchase, payment: SupplierPayment, auditLog?: AuditLog): Promise<Purchase> {
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error("Le montant du paiement doit être positif.");
  if (!payment.paid_by || !payment.paid_by_name) throw new Error("L'utilisateur qui enregistre le paiement doit être identifié.");
  let updatedPurchase: Purchase | undefined;
  await runOnlineTransaction(async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const snapshot = await transaction.get(purchaseRef);
    if (!snapshot.exists()) throw new Error("Achat fournisseur introuvable.");
    const current = snapshot.data() as Purchase;
    if (current.status === "CANCELLED") throw new Error("Cet achat est annulé : aucun nouveau paiement autorisé.");
    if (current.status === "DRAFT") throw new Error("Un achat doit être approuvé avant son règlement.");
    if (current.payments.some(item => item.id === payment.id)) throw new Error("Ce paiement existe déjà.");
    const amountPaid = current.amount_paid + payment.amount;
    if (amountPaid > current.total) throw new Error("Le paiement dépasse le solde de la facture.");
    const allocations = payment.fund_allocations;
    if (allocations && (payment.treasury_fund_id || allocations.length < 1 || allocations.length > 3 ||
      new Set(allocations.map(item => item.fund_id)).size !== allocations.length ||
      allocations.some(item => !item.fund_id || !Number.isSafeInteger(item.amount) || item.amount <= 0) ||
      allocations.reduce((total, item) => total + item.amount, 0) !== payment.amount)) {
      throw new Error("Répartition invalide : choisissez jusqu'à trois fonds distincts dont le total correspond au paiement.");
    }
    const sources = allocations || (payment.treasury_fund_id ? [{ fund_id: payment.treasury_fund_id, amount: payment.amount }] : []);
    const debits = [];
    for (const source of sources) {
      const debit = await prepareFundDebit(transaction, source.fund_id, payment.paid_by!, source.amount);
      if (debit.fund.handover_id && debits.some(item => item.debit.fund.handover_id === debit.fund.handover_id)) throw new Error("Deux fonds proviennent de la même remise : paiement impossible.");
      debits.push({ source, debit });
    }
    if (allocations && debits.filter(item => item.debit.fund.handover_id).length > 2) throw new Error("Utilisez au maximum deux remises POS / DEP dans un même paiement.");
    debits.forEach(({ source, debit }, index) => debit.apply({ id: allocations ? payment.id + '-' + index : payment.id, kind: "PURCHASE", fund_id: source.fund_id, destination_fund_id: "", from_user: payment.paid_by!, to_user: "", amount: source.amount, reference: purchase.purchase_number, purchase_id: purchase.id, created_by: payment.paid_by!, created_at: payment.paid_at }));
    updatedPurchase = {
      ...current,
      amount_paid: amountPaid,
      payment_status: amountPaid >= current.total ? "PAID" : "PARTIAL",
      payments: [...current.payments, omitUndefined(payment)],
      updated_at: payment.paid_at
    };
    transaction.set(purchaseRef, omitUndefined(updatedPurchase));
    if (auditLog) {
      transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({
        ...auditLog,
        old_value: current,
        new_value: updatedPurchase
      }));
    }
  });
  if (!updatedPurchase) throw new Error("Le paiement n'a pas pu être enregistré.");
  return updatedPurchase;
}

export async function saveStore(store: Store, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, STORES_COLLECTION, store.id), omitUndefined(store));
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, STORES_COLLECTION, store.id), omitUndefined(store));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function deleteStore(storeId: string, auditLog?: AuditLog): Promise<void> {
  const [stocksSnapshot, usersSnapshot] = await Promise.all([
    getDocs(query(collection(db, STOCKS_COLLECTION), where("store_id", "==", storeId))),
    getDocs(query(collection(db, USERS_COLLECTION), where("assignedStores", "array-contains", storeId)))
  ]);

  for (let start = 0; start < stocksSnapshot.docs.length; start += 500) {
    const batch = writeBatch(db);
    stocksSnapshot.docs.slice(start, start + 500).forEach(stock => batch.delete(stock.ref));
    await batch.commit();
  }

  for (let start = 0; start < usersSnapshot.docs.length; start += 500) {
    const batch = writeBatch(db);
    usersSnapshot.docs.slice(start, start + 500).forEach(user => {
      const assignedStores = user.data().assignedStores as string[];
      batch.update(user.ref, { assignedStores: assignedStores.filter(id => id !== storeId) });
    });
    await batch.commit();
  }

  if (!auditLog) {
    await deleteDoc(doc(db, STORES_COLLECTION, storeId));
    return;
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, STORES_COLLECTION, storeId));
  batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
}

export async function saveStockAdjustment(
  stock: StoreStock,
  quantity: number,
  movement: StockMovement,
  auditLog?: AuditLog
): Promise<StoreStock> {
  const updatedStock: StoreStock = {
    ...stock,
    quantity: Math.max(0, quantity),
    updated_at: Date.now()
  };
  const batch = writeBatch(db);
  batch.set(doc(db, STOCKS_COLLECTION, updatedStock.id), omitUndefined(updatedStock), { merge: true });
  batch.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
  if (auditLog) batch.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  await batch.commit();
  return updatedStock;
}
