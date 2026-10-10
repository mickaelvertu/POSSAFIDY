import type { Article, InventoryCount, InventoryCountLine, InventoryReasonDecision, Store, StoreStock } from "../types";

export const SIGNIFICANT_VARIANCE_RATE = 0.1;
export const HIGH_VALUE_VARIANCE = 50000;
const MIN_REASON_LENGTH = 5;

// Valeur retenue d'un article : prix de vente normal, à défaut prix revendeur puis prix d'achat.
export function articleUnitCost(article: Article): number {
  return article.prix_normal || article.prix_revendeur || article.prix_achat || 0;
}

// Comptages en attente de contrôle : la valeur est recalculée au prix de vente actuel de l'article.
export function repriceCount(count: InventoryCount, articles: Article[]): InventoryCount {
  const byId = new Map(articles.map(article => [article.id, article]));
  return {
    ...count,
    lines: count.lines.map(line => {
      const article = byId.get(line.article_id);
      if (!article) return line;
      const unitCost = articleUnitCost(article);
      return { ...line, unit_cost: unitCost, variance_value: line.variance * unitCost };
    })
  };
}

export function buildCountLine(article: Article, systemQuantity: number, countedQuantity: number, reason?: string): InventoryCountLine {
  const variance = countedQuantity - systemQuantity;
  const unitCost = articleUnitCost(article);
  const line: InventoryCountLine = {
    article_id: article.id,
    article_code: article.code,
    article_name: article.name,
    unit: article.unit,
    system_quantity: systemQuantity,
    counted_quantity: countedQuantity,
    variance,
    unit_cost: unitCost,
    variance_value: variance * unitCost
  };
  const trimmed = reason?.trim();
  if (trimmed) line.reason = trimmed;
  return line;
}

export function countableArticles(store: Store, articles: Article[], stocks: StoreStock[]): Article[] {
  const stockedIds = new Set(stocks.filter(stock => stock.store_id === store.id).map(stock => stock.article_id));
  return articles
    .filter(article => article.is_active || stockedIds.has(article.id))
    .filter(article => store.store_type !== "POS" || article.article_type !== "RAW_MATERIAL")
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export function anomalyLines(lines: InventoryCountLine[]): InventoryCountLine[] {
  return lines.filter(line => line.variance !== 0);
}

export function missingReasons(lines: InventoryCountLine[]): InventoryCountLine[] {
  return anomalyLines(lines).filter(line => !line.reason || line.reason.trim().length < MIN_REASON_LENGTH);
}

export function isValidCountedQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

// Shortages whose reason is rejected are withheld from the store manager at selling price.
export function chargedAmount(line: InventoryCountLine, decision: InventoryReasonDecision | undefined): number {
  if (decision !== "REJECTED" || line.variance >= 0) return 0;
  return Math.abs(line.variance) * line.unit_cost;
}

export function applyDecisions(
  count: InventoryCount,
  decisions: Record<string, InventoryReasonDecision>
): { lines: InventoryCountLine[]; totalCharged: number } {
  let totalCharged = 0;
  const lines = count.lines.map(line => {
    if (line.variance === 0) return line;
    const decision = decisions[line.article_id] ?? "ACCEPTED";
    const charged = chargedAmount(line, decision);
    totalCharged += charged;
    return { ...line, decision, charged_amount: charged };
  });
  return { lines, totalCharged };
}

export interface InventorySuggestion {
  level: "info" | "warning" | "critical";
  title: string;
  detail: string;
  articleId?: string;
}

// Suggests which articles to count first: past anomalies, high-value stock, then least recently counted.
export function suggestCountPriorities(
  store: Store,
  articles: Article[],
  stocks: StoreStock[],
  history: InventoryCount[]
): InventorySuggestion[] {
  const suggestions: InventorySuggestion[] = [];
  const validated = history.filter(count => count.store_id === store.id && count.status === "VALIDATED");
  const anomalyCounts = new Map<string, number>();
  const lastCounted = new Map<string, number>();
  validated.forEach(count => count.lines.forEach(line => {
    lastCounted.set(line.article_id, Math.max(lastCounted.get(line.article_id) || 0, count.reviewed_at || count.created_at));
    if (line.variance !== 0) anomalyCounts.set(line.article_id, (anomalyCounts.get(line.article_id) || 0) + 1);
  }));

  const candidates = countableArticles(store, articles, stocks);
  const byId = new Map(candidates.map(article => [article.id, article]));

  [...anomalyCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .forEach(([articleId, occurrences]) => {
      const article = byId.get(articleId);
      if (article) suggestions.push({
        level: "warning",
        title: `Compter en priorité : ${article.name}`,
        detail: `${occurrences} anomalie${occurrences > 1 ? "s" : ""} déjà constatée${occurrences > 1 ? "s" : ""} sur cet article dans ce magasin.`,
        articleId
      });
    });

  const stockValue = (article: Article) => (stocks.find(stock => stock.store_id === store.id && stock.article_id === article.id)?.quantity || 0) * (article.prix_achat || 0);
  candidates
    .filter(article => stockValue(article) > 0 && !anomalyCounts.has(article.id))
    .sort((left, right) => stockValue(right) - stockValue(left))
    .slice(0, 3)
    .forEach(article => suggestions.push({
      level: "info",
      title: `Forte valeur en stock : ${article.name}`,
      detail: `${stockValue(article).toLocaleString("fr-FR")} Ar immobilisés, à contrôler régulièrement.`,
      articleId: article.id
    }));

  const staleCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const stale = candidates.filter(article => {
    const hasStock = (stocks.find(stock => stock.store_id === store.id && stock.article_id === article.id)?.quantity || 0) > 0;
    return hasStock && (lastCounted.get(article.id) || 0) < staleCutoff;
  });
  if (stale.length > 0) {
    suggestions.push({
      level: "info",
      title: `${stale.length} article${stale.length > 1 ? "s" : ""} non contrôlé${stale.length > 1 ? "s" : ""} depuis plus de 30 jours`,
      detail: stale.slice(0, 4).map(article => article.name).join(", ") + (stale.length > 4 ? "…" : "")
    });
  }
  return suggestions;
}

// Live hints while counting: recount large gaps, flag missing reasons.
export function suggestForLines(lines: InventoryCountLine[]): InventorySuggestion[] {
  const suggestions: InventorySuggestion[] = [];
  anomalyLines(lines).forEach(line => {
    const rate = line.system_quantity === 0 ? 1 : Math.abs(line.variance) / line.system_quantity;
    if (rate >= SIGNIFICANT_VARIANCE_RATE || Math.abs(line.variance_value) >= HIGH_VALUE_VARIANCE) {
      suggestions.push({
        level: "warning",
        title: `Recompter ${line.article_name}`,
        detail: `Écart de ${line.variance > 0 ? "+" : ""}${line.variance} ${line.unit} (${Math.round(rate * 100)} %). Un second comptage évite les erreurs de saisie.`,
        articleId: line.article_id
      });
    }
  });
  const missing = missingReasons(lines);
  if (missing.length > 0) {
    suggestions.push({
      level: "critical",
      title: `${missing.length} motif${missing.length > 1 ? "s" : ""} manquant${missing.length > 1 ? "s" : ""}`,
      detail: `Indiquez un motif d'au moins ${MIN_REASON_LENGTH} caractères pour chaque anomalie avant de soumettre.`
    });
  }
  return suggestions;
}

// Hints for the administrator reviewing a submitted count.
export function suggestForReview(count: InventoryCount, allCounts: InventoryCount[]): Map<string, InventorySuggestion[]> {
  const hints = new Map<string, InventorySuggestion[]>();
  const previous = allCounts.filter(other => other.id !== count.id && other.store_id === count.store_id && other.status === "VALIDATED");
  const managerPast = allCounts.filter(other => other.id !== count.id && (other.charged_to || other.created_by) === (count.manager_signed_by || count.created_by) && other.status === "VALIDATED");
  const pastCharges = managerPast.reduce((sum, other) => sum + (other.total_charged_amount || 0), 0);

  anomalyLines(count.lines).forEach(line => {
    const lineHints: InventorySuggestion[] = [];
    const reason = line.reason?.trim() || "";
    if (line.variance > 0) {
      lineHints.push({ level: "info", title: "Excédent", detail: "Vérifier une réception ou un transfert non enregistré avant d'accepter." });
    }
    if (reason.length < 15) {
      lineHints.push({ level: "warning", title: "Motif peu détaillé", detail: "Le motif est très court : demander une justification plus précise." });
    }
    const repeated = previous.filter(other => other.lines.some(item => item.article_id === line.article_id && item.variance < 0)).length;
    if (line.variance < 0 && repeated >= 1) {
      lineHints.push({ level: "critical", title: "Manque récurrent", detail: `Manque déjà constaté sur cet article lors de ${repeated} inventaire${repeated > 1 ? "s" : ""} précédent${repeated > 1 ? "s" : ""}.` });
    }
    if (Math.abs(line.variance_value) >= HIGH_VALUE_VARIANCE) {
      lineHints.push({ level: "warning", title: "Écart de forte valeur", detail: `${Math.abs(line.variance_value).toLocaleString("fr-FR")} Ar : demander une preuve ou un second comptage.` });
    }
    if (pastCharges > 0 && line.variance < 0) {
      lineHints.push({ level: "info", title: "Historique du responsable", detail: `${pastCharges.toLocaleString("fr-FR")} Ar déjà retenus lors d'inventaires précédents.` });
    }
    if (lineHints.length > 0) hints.set(line.article_id, lineHints);
  });
  return hints;
}

export interface ChargeDetail {
  count_id: string;
  count_number: string;
  store_name: string;
  reviewed_at: number;
  reviewed_by_name: string;
  article_code: string;
  article_name: string;
  unit: string;
  system_quantity: number;
  counted_quantity: number;
  missing_quantity: number;
  unit_cost: number;
  amount: number;
  reason: string;
  settled: boolean;
  settlement_date?: number;
  settlement_reference?: string;
}

export interface ManagerCharges {
  manager_id: string;
  manager_name: string;
  total: number;
  pending_total: number;
  settled_total: number;
  pending_count_ids: string[];
  counts: number;
  details: ChargeDetail[];
}

export interface ChargesFilter {
  startDate?: string; // yyyy-mm-dd
  endDate?: string;
  managerId?: string;
  storeId?: string;
  settlement?: "ALL" | "PENDING" | "SETTLED";
}

// Groups the amounts withheld on validated counts by the manager who made the count.
export function buildChargesReport(counts: InventoryCount[], filter: ChargesFilter = {}): { managers: ManagerCharges[]; total: number } {
  const start = filter.startDate ? new Date(filter.startDate).setHours(0, 0, 0, 0) : undefined;
  const end = filter.endDate ? new Date(filter.endDate).setHours(23, 59, 59, 999) : undefined;
  const byManager = new Map<string, ManagerCharges>();

  counts
    .filter(count => count.status === "VALIDATED" && (count.total_charged_amount || 0) > 0)
    .filter(count => !filter.managerId || (count.charged_to || count.created_by) === filter.managerId)
    .filter(count => !filter.storeId || count.store_id === filter.storeId)
    .filter(count => !filter.settlement || filter.settlement === "ALL" || (filter.settlement === "SETTLED") === Boolean(count.charge_settlement))
    .filter(count => {
      const date = count.reviewed_at || count.updated_at;
      return (start === undefined || date >= start) && (end === undefined || date <= end);
    })
    .forEach(count => {
      const chargedId = count.charged_to || count.created_by;
      const group = byManager.get(chargedId) || { manager_id: chargedId, manager_name: count.charged_to_name || count.created_by_name, total: 0, pending_total: 0, settled_total: 0, pending_count_ids: [], counts: 0, details: [] };
      group.counts += 1;
            const settled = Boolean(count.charge_settlement);
            if (!settled) group.pending_count_ids.push(count.id);
            count.lines.filter(line => (line.charged_amount || 0) > 0).forEach(line => {
              group.total += line.charged_amount || 0;
              if (settled) group.settled_total += line.charged_amount || 0;
              else group.pending_total += line.charged_amount || 0;
        group.details.push({
          count_id: count.id,
          count_number: count.count_number,
          store_name: count.store_name,
          reviewed_at: count.reviewed_at || count.updated_at,
          reviewed_by_name: count.reviewed_by_name || "",
          article_code: line.article_code,
          article_name: line.article_name,
          unit: line.unit,
          system_quantity: line.system_quantity,
          counted_quantity: line.counted_quantity,
          missing_quantity: Math.abs(line.variance),
          unit_cost: line.unit_cost,
          amount: line.charged_amount || 0,
          reason: line.reason || "",
          settled,
          settlement_date: count.charge_settlement?.settled_at,
          settlement_reference: count.charge_settlement?.reference
        });
      });
      byManager.set(chargedId, group);
    });

  const managers = [...byManager.values()]
    .map(group => ({ ...group, details: group.details.sort((a, b) => b.reviewed_at - a.reviewed_at) }))
    .sort((a, b) => b.total - a.total);
  return { managers, total: managers.reduce((sum, group) => sum + group.total, 0) };
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Prefix formula triggers so spreadsheets do not execute user-entered reasons.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function chargesToCsv(managers: ManagerCharges[]): string {
  const header = ["Responsable", "Inventaire", "Magasin", "Date validation", "Validé par", "Code article", "Article", "Unité", "Théorique", "Compté", "Manquant", "Coût unitaire (Ar)", "Montant retenu (Ar)", "Motif refusé", "Statut", "Date déduction", "Référence"];
  const rows = managers.flatMap(group => group.details.map(detail => [
    group.manager_name, detail.count_number, detail.store_name, new Date(detail.reviewed_at).toLocaleDateString("fr-FR"), detail.reviewed_by_name,
    detail.article_code, detail.article_name, detail.unit, detail.system_quantity, detail.counted_quantity, detail.missing_quantity, detail.unit_cost,     detail.amount, detail.reason,
        detail.settled ? "Déduit" : "À déduire", detail.settlement_date ? new Date(detail.settlement_date).toLocaleDateString("fr-FR") : "", detail.settlement_reference || ""
      ]));
  return "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}

export function summarizeCount(count: Pick<InventoryCount, "lines">) {
  const anomalies = anomalyLines(count.lines);
  return {
    counted: count.lines.length,
    anomalies: anomalies.length,
    shortageValue: anomalies.filter(line => line.variance < 0).reduce((sum, line) => sum + Math.abs(line.variance_value), 0),
    surplusValue: anomalies.filter(line => line.variance > 0).reduce((sum, line) => sum + line.variance_value, 0)
  };
}
