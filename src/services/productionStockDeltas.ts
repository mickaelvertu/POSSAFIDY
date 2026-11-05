import type { Production } from "../types";

export function productionStockDeltas(production: Production) {
  const deltas = new Map<string, { storeId: string; articleId: string; normal: number; recycled: number }>();
  if (production.status !== "COMPLETED") return [];
  const add = (storeId: string, articleId: string, bucket: "normal" | "recycled", quantity: number) => {
    const key = JSON.stringify([storeId, articleId]);
    const delta = deltas.get(key) || { storeId, articleId, normal: 0, recycled: 0 };
    delta[bucket] += quantity;
    deltas.set(key, delta);
  };
  production.consumptions.forEach(line => add(production.manufacturer_store_id, line.article_id,
    line.source === "RECYCLED" ? "recycled" : "normal", -line.quantity));
  production.outputs.forEach(line => add(production.manufacturer_store_id, line.article_id, "normal", line.quantity));
  return [...deltas.values()];
}
