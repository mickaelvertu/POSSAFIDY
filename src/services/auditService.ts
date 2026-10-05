import { AppUser, AuditLog } from "../types";

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .map(([key, field]) => [key, omitUndefined(field)]));
  }
  return value;
}

export function createAuditLog(
  actor: AppUser,
  action: string,
  entityType: string,
  entityId: string,
  oldValue?: unknown,
  newValue?: unknown,
  storeId?: string
): AuditLog {
  return omitUndefined({
    id: `audit-${crypto.randomUUID()}`,
    user_id: actor.uid,
    user_name: actor.displayName,
    store_id: storeId,
    device_id: "POS-WEB-CLIENT",
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_value: oldValue,
    new_value: newValue,
    created_at: Date.now()
  }) as AuditLog;
}
