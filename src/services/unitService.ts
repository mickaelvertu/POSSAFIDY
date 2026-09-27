import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { Article, UnitOfMeasure } from "../types";

const UNITS_COLLECTION = "units";

function unitDocumentId(name: string): string {
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `unit-${slug || crypto.randomUUID()}`;
}

export async function loadUnits(articles: Article[]): Promise<UnitOfMeasure[]> {
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
    await batch.commit();
    units.push(...addedUnits);
  }

  return units.sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export async function saveUnit(unit: UnitOfMeasure): Promise<void> {
  await setDoc(doc(db, UNITS_COLLECTION, unit.id), unit);
}

export async function deleteUnit(unitId: string): Promise<void> {
  await deleteDoc(doc(db, UNITS_COLLECTION, unitId));
}