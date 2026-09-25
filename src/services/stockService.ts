import { 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  StockTransfer, 
  StockMovement, 
  Sale, 
  Production, 
  AuditLog, 
  GeneralFilters,
  TransferStatus,
  StockMovementType,
  SaleStatus
} from "../types";

// Helper for generating sequential human-readable codes
export function generateRef(prefix: string, count: number): string {
  const year = new Date().getFullYear();
  const num = String(count + 1).padStart(4, "0");
  return `${prefix}-${year}-${num}`;
}

// Check stock balance for a store & article
export function getArticleStock(stocks: StoreStock[], storeId: string, articleId: string): number {
  const item = stocks.find(s => s.store_id === storeId && s.article_id === articleId);
  return item ? item.quantity : 0;
}

// Apply stock modification (immutable return of new stocks list)
export function updateStockQuantity(
  stocks: StoreStock[], 
  storeId: string, 
  articleId: string, 
  delta: number
): { newStocks: StoreStock[]; beforeQty: number; afterQty: number } {
  const existingIndex = stocks.findIndex(s => s.store_id === storeId && s.article_id === articleId);
  let beforeQty = 0;
  let afterQty = 0;
  let newStocks = [...stocks];

  if (existingIndex >= 0) {
    beforeQty = stocks[existingIndex].quantity;
    afterQty = beforeQty + delta;
    newStocks[existingIndex] = {
      ...stocks[existingIndex],
      quantity: Math.max(0, afterQty),
      updated_at: Date.now()
    };
  } else {
    beforeQty = 0;
    afterQty = Math.max(0, delta);
    newStocks.push({
      id: `stock-${storeId}-${articleId}-${Date.now()}`,
      store_id: storeId,
      article_id: articleId,
      quantity: afterQty,
      reserved_quantity: 0,
      updated_at: Date.now()
    });
  }

  return { newStocks, beforeQty, afterQty };
}

// Filter stocks, movements, sales, transfers according to Section 12 criteria
export function filterItems<T>(
  items: T[],
  filters: GeneralFilters,
  extractors: {
    getDate?: (item: T) => number;
    getStoreId?: (item: T) => string | undefined;
    getStatus?: (item: T) => string | undefined;
    getMovementType?: (item: T) => StockMovementType | undefined;
    getArticleId?: (item: T) => string | undefined;
    getCategoryId?: (item: T) => string | undefined;
    getArticleType?: (item: T) => string | undefined;
    getRefText?: (item: T) => string;
    getQuantity?: (item: T) => number;
    getCustomerName?: (item: T) => string | undefined;
    getSellerId?: (item: T) => string | undefined;
  }
): T[] {
  return items.filter(item => {
    // 1. Date Range
    if (extractors.getDate) {
      const itemTime = extractors.getDate(item);
      if (filters.startDate) {
        const startTs = new Date(filters.startDate).setHours(0, 0, 0, 0);
        if (itemTime < startTs) return false;
      }
      if (filters.endDate) {
        const endTs = new Date(filters.endDate).setHours(23, 59, 59, 999);
        if (itemTime > endTs) return false;
      }
    }

    // 2. Stores (multi-select)
    if (filters.storeIds.length > 0 && extractors.getStoreId) {
      const sid = extractors.getStoreId(item);
      if (sid && !filters.storeIds.includes(sid)) return false;
    }

    // 3. Statuses (multi-select)
    if (filters.statuses.length > 0 && extractors.getStatus) {
      const st = extractors.getStatus(item);
      if (st && !filters.statuses.includes(st)) return false;
    }

    // 4. Movement Types (multi-select)
    if (filters.movementTypes.length > 0 && extractors.getMovementType) {
      const mt = extractors.getMovementType(item);
      if (mt && !filters.movementTypes.includes(mt)) return false;
    }

    // 5. Categories (multi-select)
    if (filters.categoryIds.length > 0 && extractors.getCategoryId) {
      const cat = extractors.getCategoryId(item);
      if (cat && !filters.categoryIds.includes(cat)) return false;
    }

    // 6. Article Type
    if (filters.articleType && filters.articleType !== "ALL" && extractors.getArticleType) {
      const at = extractors.getArticleType(item);
      if (at && at !== filters.articleType) return false;
    }

    // 7. Search Ref / Number
    if (filters.searchRef && filters.searchRef.trim() !== "" && extractors.getRefText) {
      const q = filters.searchRef.toLowerCase().trim();
      const text = extractors.getRefText(item).toLowerCase();
      if (!text.includes(q)) return false;
    }

    // 8. Min / Max Quantity
    if (extractors.getQuantity) {
      const q = extractors.getQuantity(item);
      if (filters.minQty !== undefined && q < filters.minQty) return false;
      if (filters.maxQty !== undefined && q > filters.maxQty) return false;
    }

    // 9. Specific Article
    if (filters.articleId && extractors.getArticleId) {
      const aid = extractors.getArticleId(item);
      if (aid && aid !== filters.articleId) return false;
    }

    // 10. Customer
    if (filters.customerName && filters.customerName.trim() !== "" && extractors.getCustomerName) {
      const c = extractors.getCustomerName(item)?.toLowerCase() || "";
      if (!c.includes(filters.customerName.toLowerCase().trim())) return false;
    }

    // 11. Seller
    if (filters.sellerId && extractors.getSellerId) {
      const s = extractors.getSellerId(item);
      if (s && s !== filters.sellerId) return false;
    }

    return true;
  });
}
