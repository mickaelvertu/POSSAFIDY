import { useEffect, useState } from "react";
import { where, type Query, type DocumentData } from "firebase/firestore";
import type { User } from "../types/auth";
import type { AppRoleId, Article, Category, CreditCustomer, InventoryCount, Production, Purchase, Sale, StockTransfer, Store, StoreStock, Supplier, UnitOfMeasure, Expense, CashHandover } from "../types";
import { authorizationKey, describeReadError, isRetryableReadError, sessionReadAccess } from "../services/dataSyncPolicy";
import { collectionQuery, scopedQueries, subscribeRows } from "../services/liveDataService";
import { DEFAULT_ARTICLE_VISIBILITY } from "../services/authService";
import { loadCreditCustomerForUser } from "../services/creditService";

interface Data {
  articles: Article[]; categories: Category[]; stores: Store[]; stocks: StoreStock[];
  transfers: StockTransfer[]; sales: Sale[]; productions: Production[]; counts: InventoryCount[];
  suppliers: Supplier[]; purchases: Purchase[]; customers: CreditCustomer[]; units: UnitOfMeasure[];
  expenses: Expense[]; cashHandovers: CashHandover[];
}
type Setters = { [K in keyof Data]: (rows: Data[K]) => void };

export function useSessionSync(user: User | null, setters: Setters, initializeUnits?: (articles: Article[]) => Promise<unknown>) {
  const scope = authorizationKey(user);
  const [retryVersion, setRetryVersion] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});

  // Clear data only when authorization changes, never for an ordinary retry or name edit.
  useEffect(() => {
    Object.values(setters).forEach(setter => setter([]));
  }, [scope]);

  useEffect(() => {
    if (!user || user.status !== "ACTIVE") return;
    let active = true;
    const stops: (() => void)[] = [];
    const timers: number[] = [];
    setErrors({}); setStatus({});
    const { admin, storeIds, permitted, salesAllowed, salesStoreIds } = sessionReadAccess(user);
    const state = (label: string, value: string) => {
      if (active) setStatus(current => current[label] === value ? current : ({ ...current, [label]: value }));
    };
    const fail = (label: string, error: unknown) => {
      console.error(label + " synchronization failed:", error);
      if (!active) return;
      state(label, "error");
      setErrors(current => ({ ...current, [label]: describeReadError(error) }));
    };
    const ready = (label: string, cached = false) => {
      if (!active) return;
      state(label, cached ? "cached" : "ready");
      setErrors(current => {
        if (!(label in current)) return current;
        const next = { ...current }; delete next[label]; return next;
      });
    };
    const watch = <T extends { id: string }>(label: string, queries: Query<DocumentData>[], setter: (rows: T[]) => void) => {
      state(label, "loading");
      stops.push(subscribeRows<T>(queries, rows => { if (active) setter(rows); }, error => fail(label, error), cached => ready(label, cached)));
    };
    const read = <T,>(label: string, task: () => Promise<T>, receive: (value: T) => void, attempt = 0) => {
      state(label, "loading");
      void task().then(value => {
        if (!active) return;
        receive(value); ready(label);
      }).catch(error => {
        if (!active) return;
        if (isRetryableReadError(error) && attempt < 2) {
          timers.push(window.setTimeout(() => read(label, task, receive, attempt + 1), 1000 * 2 ** attempt));
        } else fail(label, error);
      });
    };
    const articleTypes = [...new Set([
      ...(user.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[user.role as AppRoleId] ?? []),
      ...(permitted("procurement.manage") ? ["RAW_MATERIAL" as const] : []),
    ])];
    let resellerStores: Store[] | undefined;
    let resellerArticles: Article[] | undefined;
    let resellerScope = "";
    let unitsInitialized = false;
    let stopResellerStocks = () => {};
    stops.push(() => stopResellerStocks());
    const refreshResellerStocks = () => {
      if (user.role !== "REVENDEUR" || !resellerStores || !resellerArticles) return;
      const targets = resellerStores.filter(store => store.is_active && store.store_type === "CENTRAL_WAREHOUSE")
        .flatMap(store => resellerArticles!.filter(article => article.is_active && article.article_type === "RESALE").map(article => [store.id, article.id]));
      const key = JSON.stringify(targets);
      if (key === resellerScope) return;
      resellerScope = key;
      stopResellerStocks();
      state("Stocks", "loading");
      stopResellerStocks = subscribeRows<StoreStock>(targets.map(([storeId, articleId]) => collectionQuery("stocks", where("store_id", "==", storeId), where("article_id", "==", articleId))),
        rows => { if (active) setters.stocks(rows); }, error => fail("Stocks", error), cached => ready("Stocks", cached));
    };
    watch<Store>("Magasins", [collectionQuery("stores")], rows => {
      setters.stores(rows); resellerStores = rows; refreshResellerStocks();
    });
    watch<Article>("Articles", articleTypes.length ? [collectionQuery("articles", where("article_type", "in", articleTypes))] : [], rows => {
      setters.articles(rows); resellerArticles = rows; refreshResellerStocks();
      if (admin && initializeUnits && rows.length && !unitsInitialized) {
        unitsInitialized = true;
        read("Initialisation des unités", () => initializeUnits(rows), () => {});
      }
    });
    watch<Category>("Catégories", [collectionQuery("categories")], setters.categories);
    if (user.role !== "REVENDEUR") watch<StoreStock>("Stocks", scopedQueries("stocks", ["store_id"], storeIds), setters.stocks);
    watch<StockTransfer>("Transferts", scopedQueries("transfers", ["source_store_id", "destination_store_id"], storeIds), setters.transfers);
    watch<Sale>("Ventes", salesAllowed ? scopedQueries("sales", ["store_id"], salesStoreIds) : [], setters.sales);
    watch<Production>("Productions", permitted("production.view") ? scopedQueries("productions", ["manufacturer_store_id"], storeIds) : [], setters.productions);
    watch<InventoryCount>("Inventaires", scopedQueries("inventoryCounts", ["store_id"], storeIds), setters.counts);
    if (permitted("procurement.manage")) {
      watch<Supplier>("Fournisseurs", [collectionQuery("suppliers")], setters.suppliers);
      watch<Purchase>("Achats", scopedQueries("purchases", ["store_id"], storeIds), setters.purchases);
    }
    if (admin) watch<UnitOfMeasure>("Unités", [collectionQuery("units")], setters.units);
    if (permitted("expenses.view") || permitted("expenses.create")) {
      watch<Expense>("Dépenses", admin ? [collectionQuery("expenses")] : [
        ...scopedQueries("expenses", ["store_id"], user.assignedStores),
        collectionQuery("expenses", where("created_by", "==", user.id)),
      ], setters.expenses);
    }
    if (admin || user.permissions.some(permission => permission.startsWith("cash_handover."))) {
      watch<CashHandover>("Remises de caisse", scopedQueries("cashHandovers", ["store_id"], storeIds), setters.cashHandovers);
    }
    if (user.role === "REVENDEUR") {
      read("Compte revendeur", () => loadCreditCustomerForUser(user.id), customer => setters.customers(customer ? [customer] : []));
    } else if (permitted("credit.sales") || permitted("credit.manage")) {
      watch<CreditCustomer>("Comptes crédit", [collectionQuery("creditCustomers")], setters.customers);
    }
    return () => { active = false; stops.forEach(stop => stop()); timers.forEach(timer => window.clearTimeout(timer)); };
  }, [scope, retryVersion]);

  return { errors, status, retry: () => setRetryVersion(version => version + 1), retryVersion, scope };
}
