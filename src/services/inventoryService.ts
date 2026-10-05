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

// Persists a transfer status change together with the stock/movement side effects it triggers (ship or receive).
export async function saveTransferWithStockEffects(
  transfer: StockTransfer,
  updatedStocks: StoreStock[],
  movements: StockMovement[],
  auditLog?: AuditLog
): Promise<{ stocks: StoreStock[]; movements: StockMovement[] }> {
  const persistedStocks: StoreStock[] = [];
  const persistedMovements: StockMovement[] = [];
  const groupedMovements = new Map<string, StockMovement>();
  movements.forEach(movement => {
    const key = `${movement.store_id}:${movement.article_id}`;
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
    const validTransition = currentTransfer.status === "APPROVED" && transfer.status === "IN_TRANSIT"
      || currentTransfer.status === "IN_TRANSIT" && ["VALIDATED", "DISCREPANCY"].includes(transfer.status);
    if (!validTransition) throw new Error("Le statut du transfert a changé. Rechargez les données.");

    const targets = [...groupedMovements.values()].map(movement => {
      const fallback = updatedStocks.find(stock => stock.store_id === movement.store_id && stock.article_id === movement.article_id);
      return { movement, fallback, reference: doc(db, STOCKS_COLLECTION, fallback?.id || `stock-${movement.store_id}-${movement.article_id}`) };
    });
    const stockSnapshots = await Promise.all(targets.map(target => transaction.get(target.reference)));
    targets.forEach((target, index) => {
      const current = stockSnapshots[index].exists() ? stockSnapshots[index].data() as StoreStock : undefined;
      const before = current?.quantity || 0;
      const after = before + target.movement.quantity;
      if (after < 0) throw new Error(`Stock insuffisant pour l'article ${target.movement.article_id}. Disponible : ${before}.`);
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: target.movement.store_id,
        article_id: target.movement.article_id,
        quantity: after,
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
    if (auditLog) transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return { stocks: persistedStocks, movements: persistedMovements };
}

export async function loadCatalogData(): Promise<{ articles: Article[]; categories: Category[] }> {
  const [articlesSnapshot, categoriesSnapshot] = await Promise.all([
    getDocs(collection(db, ARTICLES_COLLECTION)),
    getDocs(collection(db, CATEGORIES_COLLECTION))
  ]);

  return {
    articles: articlesSnapshot.docs.map(snapshot => snapshot.data() as Article),
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

export async function receivePurchase(purchase: Purchase, stocks: StoreStock[], auditLog?: AuditLog): Promise<StoreStock[]> {
  const [storeSnapshot, articleSnapshots] = await Promise.all([
    getDoc(doc(db, STORES_COLLECTION, purchase.store_id)),
    Promise.all(purchase.lines.map(line => getDoc(doc(db, ARTICLES_COLLECTION, line.article_id))))
  ]);
  if (!storeSnapshot.exists() || storeSnapshot.data().store_type !== "CENTRAL_WAREHOUSE") {
    throw new Error("La réception d'un achat fournisseur est autorisée uniquement dans un dépôt central.");
  }
  if (articleSnapshots.some(snapshot => !snapshot.exists() || snapshot.data().article_type !== "RAW_MATERIAL")) {
    throw new Error("Un achat fournisseur ne peut contenir que des matières premières.");
  }

  const groupedLines = new Map<string, PurchaseLine[]>();
  purchase.lines.forEach(line => {
    const lines = groupedLines.get(line.article_id) || [];
    lines.push(line);
    groupedLines.set(line.article_id, lines);
  });

  if (groupedLines.size > 249) {
    throw new Error("Une réception ne peut pas contenir plus de 249 articles différents.");
  }

  const targets = [...groupedLines].map(([articleId, lines]) => {
    const known = stocks.find(stock => stock.store_id === purchase.store_id && stock.article_id === articleId);
    return {
      articleId,
      lines,
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      reference: doc(db, STOCKS_COLLECTION, known?.id || `stock-${purchase.store_id}-${articleId}`)
    };
  });
  const persistedStocks: StoreStock[] = [];
  await runTransaction(db, async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const purchaseSnapshot = await transaction.get(purchaseRef);
    if (purchaseSnapshot.exists()) throw new Error("Cette réception fournisseur existe déjà.");
    const stockSnapshots = await Promise.all(targets.map(target => transaction.get(target.reference)));
    targets.forEach((target, index) => {
      const existing = stockSnapshots[index].exists() ? stockSnapshots[index].data() as StoreStock : undefined;
      const beforeQuantity = existing?.quantity || 0;
      if (!Number.isFinite(target.quantity) || target.quantity <= 0) throw new Error("Les quantités reçues doivent être positives.");
      const updatedStock: StoreStock = {
        id: existing?.id || target.reference.id,
        store_id: purchase.store_id,
        article_id: target.articleId,
        quantity: beforeQuantity + target.quantity,
        reserved_quantity: existing?.reserved_quantity || 0,
        updated_at: purchase.received_at
      };
      const movement: StockMovement = {
        id: `movement-${purchase.id}-${target.articleId}`,
        store_id: purchase.store_id,
        article_id: target.articleId,
        movement_type: "PURCHASE",
        quantity: target.quantity,
        reference_type: "PURCHASE",
        reference_id: purchase.id,
        reference_number: purchase.purchase_number,
        before_quantity: beforeQuantity,
        after_quantity: updatedStock.quantity,
        created_by: purchase.received_by,
        created_by_name: purchase.received_by_name,
        notes: `Réception fournisseur ${purchase.supplier_name} · ${target.lines[0].article_code}`,
        created_at: purchase.received_at
      };
      persistedStocks.push(updatedStock);
      transaction.set(target.reference, omitUndefined(updatedStock));
      transaction.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
    });
    transaction.set(purchaseRef, omitUndefined(purchase));
    if (auditLog) transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return stocks.map(stock => persistedStocks.find(updated => updated.id === stock.id) || stock)
    .concat(persistedStocks.filter(updated => !stocks.some(stock => stock.id === updated.id)));
}

export async function recordSupplierPayment(purchase: Purchase, payment: SupplierPayment, auditLog?: AuditLog): Promise<Purchase> {
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error("Le montant du paiement doit être positif.");
  let updatedPurchase: Purchase | undefined;
  await runTransaction(db, async transaction => {
    const purchaseRef = doc(db, PURCHASES_COLLECTION, purchase.id);
    const snapshot = await transaction.get(purchaseRef);
    if (!snapshot.exists()) throw new Error("Achat fournisseur introuvable.");
    const current = snapshot.data() as Purchase;
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
