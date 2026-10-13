import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
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

  await runTransaction(db, async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, original.id);
    const snapshot = await transaction.get(transferRef);
    if (!snapshot.exists()) throw new Error("Ce transfert n'existe plus.");
    const current = snapshot.data() as StockTransfer;
    if (
      current.status !== "DRAFT" ||
      current.requested_by !== original.requested_by ||
      current.updated_at !== original.updated_at ||
      JSON.stringify(current.lines) !== JSON.stringify(original.lines)
    ) {
      throw new Error("Le transfert a changé depuis son ouverture. Rechargez les données avant de le modifier.");
    }
    transaction.set(transferRef, omitUndefined(updated));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function deleteDraftTransfer(transfer: StockTransfer, auditLog: AuditLog): Promise<void> {
  await runTransaction(db, async transaction => {
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

  await runTransaction(db, async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const storeRef = doc(db, STORES_COLLECTION, transfer.destination_store_id);
    const [transferSnapshot, storeSnapshot] = await Promise.all([
      transaction.get(transferRef),
      transaction.get(storeRef)
    ]);
    if (!transferSnapshot.exists() || (transferSnapshot.data() as StockTransfer).status !== "IN_TRANSIT") {
      throw new Error("Ce transfert n'est plus en attente de réception.");
    }
    if (!storeSnapshot.exists() || (storeSnapshot.data() as Store).store_type !== "CENTRAL_WAREHOUSE") {
      throw new Error("La double confirmation s'applique uniquement aux entrées du dépôt central.");
    }
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
  await runTransaction(db, async transaction => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transfer.id);
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) throw new Error("Transfert introuvable.");
    const currentTransfer = transferSnapshot.data() as StockTransfer;
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
          && currentTransfer.received_by !== transfer.validated_by
          && currentTransfer.received_by === transfer.received_by
          && JSON.stringify(currentTransfer.lines) === JSON.stringify(transfer.lines);
    if (!validTransition) throw new Error("Le statut du transfert a changé. Rechargez les données.");
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
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: target.movement.store_id,
        article_id: target.movement.article_id,
        quantity: quarantine ? current?.quantity || 0 : after,
        ...(quarantine || current?.quarantine_quantity !== undefined
          ? { quarantine_quantity: quarantine ? after : current?.quarantine_quantity }
          : {}),
        reserved_quantity: current?.reserved_quantity || 0,
        updated_at: transfer.updated_at
      };
      const movement = { ...target.movement, before_quantity: before, after_quantity: after };
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

export async function loadProcurementData(): Promise<{ suppliers: Supplier[]; purchases: Purchase[] }> {
  const [suppliersSnapshot, purchasesSnapshot] = await Promise.all([
    getDocs(collection(db, SUPPLIERS_COLLECTION)),
    getDocs(collection(db, PURCHASES_COLLECTION))
  ]);

  return {
    suppliers: suppliersSnapshot.docs.map(snapshot => snapshot.data() as Supplier),
    purchases: purchasesSnapshot.docs.map(snapshot => snapshot.data() as Purchase)
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

export async function saveDraftPurchase(purchase: Purchase, auditLog: AuditLog): Promise<void> {
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
  if (articleSnapshots.some(snapshot => !snapshot.exists() || snapshot.data().article_type !== "RAW_MATERIAL" || snapshot.data().is_active !== true)) {
    throw new Error("Un achat fournisseur ne peut contenir que des matières premières actives.");
  }
  await runTransaction(db, async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    if ((await transaction.get(purchaseRef)).exists()) throw new Error("Cet achat existe déjà.");
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
    purchase.created_by === updatedPurchase.approved_by ||
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
  if (articleSnapshots.some(snapshot => !snapshot.exists() || snapshot.data().article_type !== "RAW_MATERIAL")) {
    throw new Error("Un achat fournisseur ne peut contenir que des matières premières.");
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

  await runTransaction(db, async transaction => {
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

export async function recordSupplierPayment(purchase: Purchase, payment: SupplierPayment, auditLog?: AuditLog): Promise<Purchase> {
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error("Le montant du paiement doit être positif.");
  let updatedPurchase: Purchase | undefined;
  await runTransaction(db, async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const snapshot = await transaction.get(purchaseRef);
    if (!snapshot.exists()) throw new Error("Achat fournisseur introuvable.");
    const current = snapshot.data() as Purchase;
    if (current.status === "DRAFT") throw new Error("Un achat doit être approuvé avant son règlement.");
    if (current.payments.some(item => item.id === payment.id)) throw new Error("Ce paiement existe déjà.");
    const amountPaid = current.amount_paid + payment.amount;
    if (amountPaid > current.total) throw new Error("Le paiement dépasse le solde de la facture.");
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
