import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { INITIAL_ARTICLES, INITIAL_CATEGORIES, INITIAL_STORES, INITIAL_STOCKS } from "../data/initialData";
import { Article, Category, Purchase, PurchaseLine, StockMovement, Store, StoreStock, Supplier, SupplierPayment } from "../types";

const STORES_COLLECTION = "stores";
const STOCKS_COLLECTION = "stocks";
const ARTICLES_COLLECTION = "articles";
const CATEGORIES_COLLECTION = "categories";
const SUPPLIERS_COLLECTION = "suppliers";
const PURCHASES_COLLECTION = "purchases";
const MOVEMENTS_COLLECTION = "movements";
const USERS_COLLECTION = "users";
const INVENTORY_METADATA_COLLECTION = "inventoryMetadata";
const INITIAL_SEED_MARKER_ID = "initial-data-seeded";
const CATALOG_SEED_MARKER_ID = "initial-catalog-seeded";

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

export async function loadInventoryData(): Promise<{ stores: Store[]; stocks: StoreStock[]; movements: StockMovement[] }> {
  const [storesSnapshot, stocksSnapshot, movementsSnapshot] = await Promise.all([
    getDocs(collection(db, STORES_COLLECTION)),
    getDocs(collection(db, STOCKS_COLLECTION)),
    getDocs(collection(db, MOVEMENTS_COLLECTION))
  ]);

  return {
    stores: storesSnapshot.docs.map(snapshot => snapshot.data() as Store),
    stocks: stocksSnapshot.docs.map(snapshot => snapshot.data() as StoreStock),
    movements: movementsSnapshot.docs.map(snapshot => snapshot.data() as StockMovement)
  };
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

export async function seedInitialCatalogData(): Promise<void> {
  const [articlesSnapshot, categoriesSnapshot, seedMarker] = await Promise.all([
    getDocs(collection(db, ARTICLES_COLLECTION)),
    getDocs(collection(db, CATEGORIES_COLLECTION)),
    getDoc(doc(db, INVENTORY_METADATA_COLLECTION, CATALOG_SEED_MARKER_ID))
  ]);
  if (seedMarker.exists()) return;

  const batch = writeBatch(db);
  if (articlesSnapshot.empty) {
    INITIAL_ARTICLES.forEach(article => batch.set(doc(db, ARTICLES_COLLECTION, article.id), article));
  }
  if (categoriesSnapshot.empty) {
    INITIAL_CATEGORIES.forEach(category => batch.set(doc(db, CATEGORIES_COLLECTION, category.id), category));
  }
  batch.set(doc(db, INVENTORY_METADATA_COLLECTION, CATALOG_SEED_MARKER_ID), { seeded_at: Date.now() });
  await batch.commit();
}

export async function saveArticle(article: Article): Promise<void> {
  await setDoc(doc(db, ARTICLES_COLLECTION, article.id), omitUndefined(article));
}

export async function saveCategory(category: Category): Promise<void> {
  await setDoc(doc(db, CATEGORIES_COLLECTION, category.id), omitUndefined(category));
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

export async function saveSupplier(supplier: Supplier): Promise<void> {
  await setDoc(doc(db, SUPPLIERS_COLLECTION, supplier.id), omitUndefined(supplier));
}

export async function receivePurchase(purchase: Purchase, stocks: StoreStock[]): Promise<StoreStock[]> {
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

  const updatedStocks = [...stocks];
  const batch = writeBatch(db);
  batch.set(doc(db, PURCHASES_COLLECTION, purchase.id), omitUndefined(purchase));

  for (const [articleId, lines] of groupedLines) {
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const existingIndex = updatedStocks.findIndex(stock => stock.store_id === purchase.store_id && stock.article_id === articleId);
    const existingStock = updatedStocks[existingIndex];
    const updatedStock: StoreStock = existingStock
      ? { ...existingStock, quantity: existingStock.quantity + quantity, updated_at: purchase.received_at }
      : {
          id: `stock-${purchase.store_id}-${articleId}`,
          store_id: purchase.store_id,
          article_id: articleId,
          quantity,
          reserved_quantity: 0,
          updated_at: purchase.received_at
        };

    if (existingIndex >= 0) updatedStocks[existingIndex] = updatedStock;
    else updatedStocks.push(updatedStock);
    batch.set(doc(db, STOCKS_COLLECTION, updatedStock.id), omitUndefined(updatedStock));

    const firstLine = lines[0];
    const beforeQuantity = existingStock?.quantity || 0;
    const movement: StockMovement = {
      id: `movement-${purchase.id}-${articleId}`,
      store_id: purchase.store_id,
      article_id: articleId,
      movement_type: "PURCHASE",
      quantity,
      reference_type: "PURCHASE",
      reference_id: purchase.id,
      reference_number: purchase.purchase_number,
      before_quantity: beforeQuantity,
      after_quantity: beforeQuantity + quantity,
      created_by: purchase.received_by,
      created_by_name: purchase.received_by_name,
      notes: `Réception fournisseur ${purchase.supplier_name} · ${firstLine.article_code}`,
      created_at: purchase.received_at
    };
    batch.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
  }

  await batch.commit();
  return updatedStocks;
}

export async function recordSupplierPayment(purchase: Purchase, payment: SupplierPayment): Promise<Purchase> {
  const amountPaid = purchase.amount_paid + payment.amount;
  const updatedPurchase: Purchase = {
    ...purchase,
    amount_paid: amountPaid,
    payment_status: amountPaid >= purchase.total ? "PAID" : "PARTIAL",
    payments: [...purchase.payments, omitUndefined(payment)],
    updated_at: payment.paid_at
  };
  await updateDoc(doc(db, PURCHASES_COLLECTION, purchase.id), omitUndefined({
    amount_paid: updatedPurchase.amount_paid,
    payment_status: updatedPurchase.payment_status,
    payments: updatedPurchase.payments,
    updated_at: updatedPurchase.updated_at
  }));
  return updatedPurchase;
}

export async function seedInitialInventoryData(): Promise<void> {
  const [currentStores, currentStocks, seedMarker] = await Promise.all([
    getDocs(collection(db, STORES_COLLECTION)),
    getDocs(collection(db, STOCKS_COLLECTION)),
    getDoc(doc(db, INVENTORY_METADATA_COLLECTION, INITIAL_SEED_MARKER_ID))
  ]);
  if (seedMarker.exists()) return;

  const batch = writeBatch(db);

  if (currentStores.empty) {
    INITIAL_STORES.forEach(store => {
      batch.set(doc(db, STORES_COLLECTION, store.id), store);
    });
  }

  if (currentStocks.empty) {
    INITIAL_STOCKS.forEach(stock => {
      batch.set(doc(db, STOCKS_COLLECTION, stock.id), stock);
    });
  }

  batch.set(doc(db, INVENTORY_METADATA_COLLECTION, INITIAL_SEED_MARKER_ID), { seeded_at: Date.now() });
  await batch.commit();
}

export async function saveStore(store: Store): Promise<void> {
  await setDoc(doc(db, STORES_COLLECTION, store.id), omitUndefined(store));
}

export async function deleteStore(storeId: string): Promise<void> {
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

  await deleteDoc(doc(db, STORES_COLLECTION, storeId));
}

export async function saveStockAdjustment(
  stock: StoreStock,
  quantity: number,
  movement: StockMovement
): Promise<StoreStock> {
  const updatedStock: StoreStock = {
    ...stock,
    quantity: Math.max(0, quantity),
    updated_at: Date.now()
  };
  const batch = writeBatch(db);
  batch.set(doc(db, STOCKS_COLLECTION, updatedStock.id), omitUndefined(updatedStock), { merge: true });
  batch.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
  await batch.commit();
  return updatedStock;
}
