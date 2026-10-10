// Format court « Nom (CODE) », ex. « REX (POS-03) ».
export function storeLabel(store: { name: string; code?: string; store_type?: string }): string {
  const name = store.name.trim();
  return store.code ? `${name} (${store.code})` : name;
}
