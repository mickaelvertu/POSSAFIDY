const TYPE_LABELS: Record<string, string> = {
  POS: "POS",
  RESELLER: "Revendeur",
  CENTRAL_WAREHOUSE: "Entrepôt",
  MANUFACTURER: "Production",
};

// Distinguishes stores sharing the same name (e.g. a POS and a reseller both called "Mahamasina").
export function storeLabel(store: { name: string; code?: string; store_type?: string }): string {
  const type = store.store_type ? TYPE_LABELS[store.store_type] ?? store.store_type : "";
  const suffix = [type, store.code].filter(Boolean).join(" · ");
  return suffix ? `${store.name.trim()} — ${suffix}` : store.name.trim();
}
