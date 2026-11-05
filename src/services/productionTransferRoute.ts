import type { Store } from "../types";

export function productionTransferAllowed(source?: Store, destination?: Store): boolean {
  if (!source?.is_active || !destination?.is_active) return false;
  if (source.store_type === "MANUFACTURER") {
    return ["MANUFACTURER", "CENTRAL_WAREHOUSE"].includes(destination.store_type);
  }
  if (destination.store_type === "MANUFACTURER") return source.store_type === "CENTRAL_WAREHOUSE";
  return true;
}
