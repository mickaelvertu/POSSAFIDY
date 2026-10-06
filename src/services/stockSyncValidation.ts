import { Article, Store, StoreStock } from "../types";

export const MAX_SYNC_ROWS = 5000;

export interface StockSyncRow {
  id: string;
  store_id: string;
  article_id: string;
  before: number;
  quantity: number;
}

export interface StockSyncValidation {
  rows: StockSyncRow[];
  unchanged: number;
  errors: string[];
}

export const STOCK_EXPORT_HEADERS = [
  "store_id", "store_code", "store_name", "article_id", "article_code", "article_name", "unit", "quantity"
] as const;

type RawRecord = Record<string, unknown>;

export function articlesAllowedInStore(store: Store, articles: Article[]): Article[] {
  return store.store_type === "POS" || store.store_type === "RESELLER"
    ? articles.filter(article => article.article_type === "RESALE")
    : articles;
}

export function buildStockExportRecords(stores: Store[], articles: Article[], stocks: StoreStock[]) {
  const stockByPair = new Map(stocks.map(stock => [`${stock.store_id}\u0000${stock.article_id}`, stock.quantity]));
  return stores.flatMap(store =>
    articlesAllowedInStore(store, articles).map(article => ({
      store_id: store.id,
      store_code: store.code,
      store_name: store.name,
      article_id: article.id,
      article_code: article.code,
      article_name: article.name,
      unit: article.unit || "",
      quantity: stockByPair.get(`${store.id}\u0000${article.id}`) ?? 0
    }))
  );
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toStockCsv(records: ReturnType<typeof buildStockExportRecords>): string {
  const lines = [STOCK_EXPORT_HEADERS.join(";")];
  records.forEach(record => lines.push(STOCK_EXPORT_HEADERS.map(header => escapeCsv(record[header])).join(";")));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function parseCsv(text: string): RawRecord[] {
  const content = text.replace(/^\uFEFF/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"' && content[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else if (char === '"') inQuotes = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      table.push(row); row = [];
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); table.push(row); }

  const [header, ...body] = table.filter(line => line.some(value => value.trim() !== ""));
  if (!header) return [];
  const keys = header.map(key => key.trim().toLowerCase());
  return body.map(line => Object.fromEntries(keys.map((key, index) => [key, (line[index] ?? "").trim()])));
}

export function parseStockSyncFile(fileName: string, text: string): RawRecord[] {
  if (fileName.toLowerCase().endsWith(".json")) {
    const parsed: unknown = JSON.parse(text);
    const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RawRecord).data : parsed;
    if (!Array.isArray(data)) throw new Error("Le fichier JSON doit contenir un tableau data.");
    return data.map(item => (item && typeof item === "object" ? item as RawRecord : {}));
  }
  return parseCsv(text);
}

function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export function validateStockSync(
  records: RawRecord[],
  stores: Store[],
  articles: Article[],
  stocks: StoreStock[],
  allowedStoreIds?: string[]
): StockSyncValidation {
  const errors: string[] = [];
  if (records.length === 0) return { rows: [], unchanged: 0, errors: ["Le fichier ne contient aucune ligne."] };
  if (records.length > MAX_SYNC_ROWS) {
    return { rows: [], unchanged: 0, errors: [`Le fichier dépasse la limite de ${MAX_SYNC_ROWS} lignes.`] };
  }

  const storeById = new Map(stores.map(store => [store.id, store]));
  const storeByCode = new Map(stores.map(store => [store.code.toLowerCase(), store]));
  const articleById = new Map(articles.map(article => [article.id, article]));
  const articleByCode = new Map(articles.map(article => [article.code.toLowerCase(), article]));
  const currentByPair = new Map(stocks.map(stock => [`${stock.store_id}\u0000${stock.article_id}`, stock.quantity]));
  const seen = new Set<string>();
  const rows: StockSyncRow[] = [];
  let unchanged = 0;

  records.forEach((record, index) => {
    const line = index + 1;
    const store = storeById.get(text(record.store_id)) || storeByCode.get(text(record.store_code).toLowerCase());
    const article = articleById.get(text(record.article_id)) || articleByCode.get(text(record.article_code).toLowerCase());
    const quantity = parseQuantity(record.quantity);

    if (!store || !store.is_active) { errors.push(`Ligne ${line} : magasin absent ou inactif.`); return; }
    if (allowedStoreIds && !allowedStoreIds.includes(store.id)) {
      errors.push(`Ligne ${line} : magasin ${store.name} hors du périmètre sélectionné.`);
      return;
    }
    if (!article || !article.is_active) { errors.push(`Ligne ${line} : article absent ou inactif.`); return; }
    if (quantity === null || quantity < 0) { errors.push(`Ligne ${line} : quantité invalide (nombre ≥ 0 requis).`); return; }
    if ((store.store_type === "POS" || store.store_type === "RESELLER") && article.article_type !== "RESALE") {
      errors.push(`Ligne ${line} : un magasin ${store.store_type} ne peut pas contenir de matière première.`);
      return;
    }
    const pair = `${store.id}\u0000${article.id}`;
    if (seen.has(pair)) { errors.push(`Ligne ${line} : doublon ${store.code} / ${article.code}.`); return; }
    seen.add(pair);

    const before = currentByPair.get(pair) ?? 0;
    if (before === quantity) { unchanged++; return; }
    rows.push({ id: `stock-${store.id}-${article.id}`, store_id: store.id, article_id: article.id, before, quantity });
  });

  return { rows, unchanged, errors };
}
