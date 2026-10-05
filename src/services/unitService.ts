import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { AppUser, Article, AuditLog, UnitOfMeasure } from "../types";
import { createAuditLog } from "./auditService";

const UNITS_COLLECTION = "units";

function unitDocumentId(name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `unit-${slug || crypto.randomUUID()}`;
}

export async function loadUnits(
  articles: Article[],
  actor?: AppUser,
  onAuditLogs?: (entries: AuditLog[]) => void
): Promise<UnitOfMeasure[]> {
  const snapshot = await getDocs(collection(db, UNITS_COLLECTION));
  const units = snapshot.docs.map(item => item.data() as UnitOfMeasure);
  const knownNames = new Set(units.map(unit => unit.name.trim().toLocaleLowerCase("fr-FR")));
  const missingNames = [...new Set(articles.map(article => article.unit.trim()).filter(Boolean))]
    .filter(name => !knownNames.has(name.toLocaleLowerCase("fr-FR")));

  if (missingNames.length > 0) {
    const timestamp = Date.now();
    const batch = writeBatch(db);
    const addedUnits = missingNames.map(name => ({
      id: unitDocumentId(name),
      name,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    }));
    addedUnits.forEach(unit => batch.set(doc(db, UNITS_COLLECTION, unit.id), unit));
    const auditLogs = actor
      ? addedUnits.map(unit => createAuditLog(actor, "UNIT_CREATED_FROM_CATALOG", "UNIT", unit.id, undefined, unit))
      : [];
    auditLogs.forEach(auditLog => batch.set(doc(db, "auditLogs", auditLog.id), auditLog));
    await batch.commit();
    units.push(...addedUnits);
    if (auditLogs.length > 0) onAuditLogs?.(auditLogs);
  }

  return units.sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export async function saveUnit(unit: UnitOfMeasure, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await setDoc(doc(db, UNITS_COLLECTION, unit.id), unit);
    return;
  }
  const batch = writeBatch(db);
  batch.set(doc(db, UNITS_COLLECTION, unit.id), unit);
  batch.set(doc(db, "auditLogs", auditLog.id), auditLog);
  await batch.commit();
}

export async function deleteUnit(unitId: string, auditLog?: AuditLog): Promise<void> {
  if (!auditLog) {
    await deleteDoc(doc(db, UNITS_COLLECTION, unitId));
    return;
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, UNITS_COLLECTION, unitId));
  batch.set(doc(db, "auditLogs", auditLog.id), auditLog);
  await batch.commit();
}