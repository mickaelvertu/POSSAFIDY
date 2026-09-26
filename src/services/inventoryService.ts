import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { INITIAL_STORES, INITIAL_STOCKS } from "../data/initialData";
import { Store, StoreStock } from "../types";

const STORES_COLLECTION = "stores";
const STOCKS_COLLECTION = "stocks";

export async function loadInventoryData(): Promise<{ stores: Store[]; stocks: StoreStock[] }> {
  const [storesSnapshot, stocksSnapshot] = await Promise.all([
    getDocs(collection(db, STORES_COLLECTION)),
    getDocs(collection(db, STOCKS_COLLECTION))
  ]);

  return {
    stores: storesSnapshot.docs.map(snapshot => snapshot.data() as Store),
    stocks: stocksSnapshot.docs.map(snapshot => snapshot.data() as StoreStock)
  };
}

export async function seedInitialInventoryData(): Promise<void> {
  const currentStores = await getDocs(collection(db, STORES_COLLECTION));
  const currentStocks = await getDocs(collection(db, STOCKS_COLLECTION));
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

  if (currentStores.empty || currentStocks.empty) {
    await batch.commit();
  }
}

export async function saveStockAdjustment(
  stock: StoreStock,
  quantity: number
): Promise<StoreStock> {
  const updatedStock: StoreStock = {
    ...stock,
    quantity: Math.max(0, quantity),
    updated_at: Date.now()
  };
  await setDoc(doc(db, STOCKS_COLLECTION, updatedStock.id), updatedStock, { merge: true });
  return updatedStock;
}
