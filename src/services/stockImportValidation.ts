import { Article, Store, StoreStock } from "../types";

const MAX_IMPORT_ROWS = 5000;

export interface InitialStockImportRow {
  id: string;
  store_id: string;
  article_id: string;
  quantity: number;
}

export interface InitialStockImportValidation {
  rows: InitialStockImportRow[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateInitialStockImport(
  input: unknown,
  stores: Store[],
  articles: Article[],
  stocks: StoreStock[]
): InitialStockImportValidation {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { rows: [], errors: ["Le fichier doit contenir un objet JSON."] };
  }

  if (!isRecord(input.review) || input.review.ready_to_apply !== true) {
    errors.push("Le fichier n'est pas approuvé : review.ready_to_apply doit être true après rapprochement métier.");
  }
  const data = input.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { rows: [], errors: [...errors, "Le fichier doit contenir un tableau data non vide."] };
  }
  if (data.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [...errors, `Le fichier dépasse la limite de ${MAX_IMPORT_ROWS} lignes.`] };
  }

  const storeById = new Map(stores.map(store => [store.id, store]));
  const articleById = new Map(articles.map(article => [article.id, article]));
  const existingStocks = new Map(stocks.map(stock => [`${stock.store_id}\u0000${stock.article_id}`, stock]));
  const seenPairs = new Set<string>();
  const rows: InitialStockImportRow[] = [];

  data.forEach((value, index) => {
    const rowNumber = index + 1;
    if (!isRecord(value)) {
      errors.push(`Ligne ${rowNumber} : format invalide.`);
      return;
    }

    const storeId = value.store_id;
    const articleId = value.article_id;
    const quantity = value.quantity;
    if (typeof storeId !== "string" || !storeId.trim() || storeId.includes("/") ||
      typeof articleId !== "string" || !articleId.trim() || articleId.includes("/")) {
      errors.push(`Ligne ${rowNumber} : magasin ou article manquant/invalide.`);
      return;
    }
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) {
      errors.push(`Ligne ${rowNumber} : la quantité doit être un nombre fini positif ou nul.`);
      return;
    }
    if (value.reserved_quantity !== undefined &&
      (typeof value.reserved_quantity !== "number" || value.reserved_quantity !== 0)) {
      errors.push(`Ligne ${rowNumber} : un stock initial ne peut pas importer de quantité réservée.`);
      return;
    }

    const store = storeById.get(storeId);
    const article = articleById.get(articleId);
    if (!store || !store.is_active) {
      errors.push(`Ligne ${rowNumber} : magasin absent ou inactif (${storeId}).`);
      return;
    }
    if (!article || !article.is_active) {
      errors.push(`Ligne ${rowNumber} : article absent ou inactif (${articleId}).`);
      return;
    }
    if ((store.store_type === "POS" || store.store_type === "RESELLER") && article.article_type !== "RESALE") {
      errors.push(`Ligne ${rowNumber} : un magasin ${store.store_type} ne peut pas recevoir de matière première.`);
      return;
    }

    const pair = `${storeId}\u0000${articleId}`;
    if (seenPairs.has(pair)) {
      errors.push(`Ligne ${rowNumber} : doublon pour le magasin ${storeId} et l'article ${articleId}.`);
      return;
    }
    const existingStock = existingStocks.get(pair);
    if (existingStock && existingStock.id !== `stock-${storeId}-${articleId}`) {
      errors.push(`Ligne ${rowNumber} : un stock existe déjà pour le magasin ${storeId} et l'article ${articleId}.`);
      return;
    }

    seenPairs.add(pair);
    rows.push({
      id: `stock-${storeId}-${articleId}`,
      store_id: storeId,
      article_id: articleId,
      quantity
    });
  });

  return { rows, errors };
}
