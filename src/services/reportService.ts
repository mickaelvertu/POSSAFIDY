import {
  Article,
  AuditLog,
  Category,
  GeneralFilters,
  Production,
  ReportType,
  Sale,
  StockMovement,
  StockTransfer,
  Store,
  StoreStock
} from "../types";

export interface ReportData {
  articles: Article[];
  stores: Store[];
  stocks: StoreStock[];
  transfers: StockTransfer[];
  movements: StockMovement[];
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
}

export interface ReportKpi {
  label: string;
  value: string;
}

const normalize = (value: unknown) => String(value || "").toLocaleLowerCase("fr-FR");

function isInPeriod(timestamp: number, filters: GeneralFilters): boolean {
  const date = new Date(timestamp);
  if (filters.startDate) {
    const start = new Date(`${filters.startDate}T00:00:00`).getTime();
    if (timestamp < start) return false;
  }
  if (filters.endDate) {
    const end = new Date(`${filters.endDate}T23:59:59.999`).getTime();
    if (timestamp > end) return false;
  }
  return Number.isFinite(date.getTime());
}

function matchesQuantity(quantity: number, filters: GeneralFilters): boolean {
  return (filters.minQty === undefined || quantity >= filters.minQty) &&
    (filters.maxQty === undefined || quantity <= filters.maxQty);
}

export function filterReportData(data: ReportData, filters: GeneralFilters): ReportData {
  const articleById = new Map(data.articles.map(article => [article.id, article]));
  const storeById = new Map(data.stores.map(store => [store.id, store]));
  const query = normalize(filters.searchRef?.trim());
  const articleFiltersActive = Boolean(filters.articleId || filters.categoryIds.length || (filters.articleType && filters.articleType !== "ALL"));
  const matchesArticle = (articleId: string) => {
    const article = articleById.get(articleId);
    if (filters.articleId && articleId !== filters.articleId) return false;
    if (filters.categoryIds.length && (!article || !filters.categoryIds.includes(article.category_id))) return false;
    if (filters.articleType && filters.articleType !== "ALL" && article?.article_type !== filters.articleType) return false;
    return true;
  };
  const matchesStore = (storeId: string) => filters.storeIds.length === 0 || filters.storeIds.includes(storeId);
  const matchesStatus = (status: string) => filters.statuses.length === 0 || filters.statuses.includes(status);
  const matchesQuery = (...values: Array<string | undefined>) => !query || values.some(value => normalize(value).includes(query));

  const stocks = data.stocks.filter(stock => {
    const article = articleById.get(stock.article_id);
    const store = storeById.get(stock.store_id);
    return matchesStore(stock.store_id) && isInPeriod(stock.updated_at, filters) && matchesArticle(stock.article_id) &&
      matchesQuantity(stock.quantity, filters) && matchesQuery(article?.code, article?.name, store?.name, store?.code);
  });

  const movements = data.movements.filter(movement => {
    const article = articleById.get(movement.article_id);
    const store = storeById.get(movement.store_id);
    return matchesStore(movement.store_id) && isInPeriod(movement.created_at, filters) &&
      (!filters.movementTypes.length || filters.movementTypes.includes(movement.movement_type)) &&
      matchesArticle(movement.article_id) && matchesQuantity(Math.abs(movement.quantity), filters) &&
      matchesQuery(movement.reference_number, movement.reference_type, movement.notes, article?.code, article?.name, store?.name);
  });

  const transfers = data.transfers.filter(transfer => {
    const source = storeById.get(transfer.source_store_id);
    const destination = storeById.get(transfer.destination_store_id);
    const hasSelectedStore = filters.storeIds.length === 0 || filters.storeIds.includes(transfer.source_store_id) || filters.storeIds.includes(transfer.destination_store_id);
    const linesMatch = !articleFiltersActive || transfer.lines.some(line => matchesArticle(line.article_id));
    const totalSent = transfer.lines.reduce((sum, line) => sum + line.quantity_sent, 0);
    return hasSelectedStore && isInPeriod(transfer.created_at, filters) && matchesStatus(transfer.status) && linesMatch &&
      matchesQuantity(totalSent, filters) && matchesQuery(transfer.transfer_number, source?.name, destination?.name, transfer.note, ...transfer.lines.flatMap(line => [line.article_code, line.article_name]));
  });

  const sales = data.sales.filter(sale => {
    const matchingLines = sale.lines.filter(line => matchesArticle(line.article_id));
    const lineQuantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
    return matchesStore(sale.store_id) && isInPeriod(sale.created_at, filters) && matchesStatus(sale.status) &&
      (!filters.customerName || normalize(sale.customer_name).includes(normalize(filters.customerName.trim()))) &&
      (!articleFiltersActive || matchingLines.length > 0) && matchesQuantity(lineQuantity, filters) &&
      matchesQuery(sale.sale_number, sale.customer_name, sale.seller_name, sale.notes, ...sale.lines.flatMap(line => [line.article_code, line.article_name]));
  });

  const productions = data.productions.filter(production => {
    const store = storeById.get(production.manufacturer_store_id);
    const lines = [...production.consumptions, ...production.outputs];
    const matchingLines = lines.filter(line => matchesArticle(line.article_id));
    const quantity = matchingLines.reduce((sum, line) => sum + line.quantity, 0);
    return matchesStore(production.manufacturer_store_id) && isInPeriod(production.created_at, filters) &&
      matchesStatus(production.status) && (!articleFiltersActive || matchingLines.length > 0) && matchesQuantity(quantity, filters) &&
      matchesQuery(production.production_number, production.notes, store?.name, ...lines.flatMap(line => [line.article_code, line.article_name]));
  });

  const auditLogs = data.auditLogs.filter(log => {
    const storeMatches = !log.store_id || matchesStore(log.store_id);
    return storeMatches && isInPeriod(log.created_at, filters) && matchesStatus(log.action) &&
      matchesQuery(log.action, log.entity_type, log.entity_id, log.user_name, log.device_id, log.store_id);
  });

  return { ...data, stocks, transfers, movements, sales, productions, auditLogs };
}

const money = (amount: number) => `${Math.round(amount).toLocaleString("fr-FR")} Ar`;

export function getReportKpis(reportType: ReportType, data: ReportData, categories: Category[], filters: GeneralFilters): ReportKpi[] {
  const stockValue = data.stocks.reduce((sum, stock) => {
    const article = data.articles.find(item => item.id === stock.article_id);
    return sum + stock.quantity * (article?.prix_normal || 0);
  }, 0);
  const saleLines = data.sales.flatMap(sale => sale.lines.filter(line => {
    const article = data.articles.find(item => item.id === line.article_id);
    return (!filters.articleId || filters.articleId === line.article_id) &&
      (!filters.categoryIds.length || Boolean(article && filters.categoryIds.includes(article.category_id))) &&
      (!filters.articleType || filters.articleType === "ALL" || article?.article_type === filters.articleType) &&
      (filters.minQty === undefined || line.quantity >= filters.minQty) &&
      (filters.maxQty === undefined || line.quantity <= filters.maxQty);
  }));
  const salesByArticleRevenue = saleLines.reduce((sum, line) => sum + line.total, 0);
  const salesByArticleQuantity = saleLines.reduce((sum, line) => sum + line.quantity, 0);
  const revenue = reportType === "SALES_BY_ARTICLE" || reportType === "SALES_BY_CATEGORY"
    ? salesByArticleRevenue
    : data.sales.reduce((sum, sale) => sum + sale.total, 0);
  const soldUnits = reportType === "SALES_BY_ARTICLE" || reportType === "SALES_BY_CATEGORY"
    ? salesByArticleQuantity
    : data.sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const movementEntries = data.movements.filter(movement => movement.quantity > 0).length;
  const movementExits = data.movements.filter(movement => movement.quantity < 0).length;
  const discrepancies = data.transfers.filter(transfer => transfer.has_discrepancy || transfer.status === "DISCREPANCY").length;
  const validatedTransfers = data.transfers.filter(transfer => transfer.status === "VALIDATED").length;
  const completedProduction = data.productions.filter(production => production.status === "COMPLETED").length;
  const allSalesLines = data.sales.flatMap(sale => sale.lines);

  switch (reportType) {
    case "STOCK_STATUS":
      return [
        { label: "Lignes de stock", value: String(data.stocks.length) },
        { label: "Valeur estimée", value: money(stockValue) },
        { label: "Articles concernés", value: String(new Set(data.stocks.map(stock => stock.article_id)).size) },
        { label: "Magasins concernés", value: String(new Set(data.stocks.map(stock => stock.store_id)).size) }
      ];
    case "STOCK_MOVEMENTS":
      return [
        { label: "Mouvements", value: String(data.movements.length) },
        { label: "Entrées", value: String(movementEntries) },
        { label: "Sorties", value: String(movementExits) },
        { label: "Magasins concernés", value: String(new Set(data.movements.map(movement => movement.store_id)).size) }
      ];
    case "TRANSFERS":
    case "RECEIPTS":
    case "DISCREPANCIES":
    case "RETURNS":
      {
        const scopedTransfers = reportType === "RETURNS"
          ? data.transfers.filter(transfer => transfer.type === "RETURN")
          : reportType === "RECEIPTS"
            ? data.transfers.filter(transfer => transfer.status === "RECEIVED" || transfer.status === "VALIDATED")
            : reportType === "DISCREPANCIES"
              ? data.transfers.filter(transfer => transfer.has_discrepancy || transfer.status === "DISCREPANCY" || transfer.lines.some(line => line.quantity_rejected > 0))
              : data.transfers;
        return [
          { label: reportType === "RETURNS" ? "Retours" : reportType === "RECEIPTS" ? "Réceptions" : reportType === "DISCREPANCIES" ? "Transferts avec écart" : "Transferts", value: String(scopedTransfers.length) },
          { label: "Lignes d'articles", value: String(scopedTransfers.reduce((sum, transfer) => sum + transfer.lines.length, 0)) },
          { label: "Réceptions validées", value: String(scopedTransfers.filter(transfer => transfer.status === "VALIDATED").length) },
          { label: "Avec écart", value: String(scopedTransfers.filter(transfer => transfer.has_discrepancy || transfer.status === "DISCREPANCY").length) }
        ];
      }
    case "SALES":
    case "SALES_BY_CUSTOMER":
    case "SALES_BY_ARTICLE":
    case "SALES_BY_CATEGORY":
      return [
        { label: "Chiffre d'affaires", value: money(revenue) },
        { label: "Ventes", value: String(data.sales.length) },
        { label: "Panier moyen", value: money(data.sales.length ? revenue / data.sales.length : 0) },
        { label: "Articles vendus", value: String(soldUnits) }
      ];
    case "RAW_MATERIAL_CONSUMPTION":
      return [
        { label: "Ordres de production", value: String(data.productions.length) },
        { label: "Lignes consommées", value: String(data.productions.reduce((sum, production) => sum + production.consumptions.length, 0)) },
        { label: "Productions terminées", value: String(completedProduction) },
        { label: "Ateliers concernés", value: String(new Set(data.productions.map(production => production.manufacturer_store_id)).size) }
      ];
    case "PRODUCTION":
      return [
        { label: "Ordres de production", value: String(data.productions.length) },
        { label: "Terminées", value: String(completedProduction) },
        { label: "En cours", value: String(data.productions.filter(production => production.status === "IN_PROGRESS").length) },
        { label: "Produits fabriqués", value: String(data.productions.reduce((sum, production) => sum + production.outputs.reduce((lineSum, line) => lineSum + line.quantity, 0), 0)) }
      ];
    case "AUDIT_LOG":
      return [
        { label: "Événements", value: String(data.auditLogs.length) },
        { label: "Utilisateurs concernés", value: String(new Set(data.auditLogs.map(log => log.user_id)).size) },
        { label: "Actions distinctes", value: String(new Set(data.auditLogs.map(log => log.action)).size) },
        { label: "Entités concernées", value: String(new Set(data.auditLogs.map(log => log.entity_type)).size) }
      ];
    default:
      return [
        { label: "Enregistrements", value: String(data.stocks.length + data.transfers.length + data.movements.length + data.sales.length + data.productions.length + data.auditLogs.length) },
        { label: "Catégories", value: String(categories.length) },
        { label: "Ventes", value: String(data.sales.length) },
        { label: "Lignes de vente", value: String(allSalesLines.length) }
      ];
  }
}