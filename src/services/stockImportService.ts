import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { AppUser, AuditLog, StockMovement, StoreStock } from "../types";
import type { InitialStockImportRow } from "./stockImportValidation";

const STOCKS_COLLECTION = "stocks";
const MOVEMENTS_COLLECTION = "movements";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const IMPORTS_COLLECTION = "inventoryMetadata";
const CHUNK_SIZE = 150;
const MAX_IMPORT_ROWS = 5000;

async function hashRows(rows: InitialStockImportRow[]): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Le navigateur ne permet pas de sécuriser l'identifiant de cet import. Utilisez une connexion HTTPS.");
  }
  const canonicalRows = [...rows]
    .sort((left, right) => `${left.store_id}\u0000${left.article_id}`.localeCompare(`${right.store_id}\u0000${right.article_id}`))
    .map(({ store_id, article_id, quantity }) => ({ store_id, article_id, quantity }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonicalRows)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function importInitialStocks(
  rows: InitialStockImportRow[],
  actor: AppUser
): Promise<{ stocks: StoreStock[]; movements: StockMovement[]; auditLogs: AuditLog[] }> {
  if (actor.roleId !== "ADMIN" && actor.roleId !== "SUPER_ADMIN") {
    throw new Error("Seuls les administrateurs peuvent importer l'inventaire initial.");
  }
  if (rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    throw new Error("Le nombre de lignes à importer est invalide.");
  }

  const orderedRows = [...rows].sort((left, right) => {
    const leftKey = `${left.store_id}\u0000${left.article_id}`;
    const rightKey = `${right.store_id}\u0000${right.article_id}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const importHash = await hashRows(orderedRows);
  const runId = `initial-stock-${importHash.slice(0, 40)}`;
  const runRef = doc(db, IMPORTS_COLLECTION, runId);
  const chunkCount = Math.ceil(rows.length / CHUNK_SIZE);
  const timestamp = Date.now();
  const referenceNumber = `INV-${importHash.slice(0, 8).toUpperCase()}`;
  const preparedRows = orderedRows.map((row, index) => {
    const stock: StoreStock = { ...row, reserved_quantity: 0, updated_at: timestamp };
    const movement: StockMovement = {
      id: `movement-${runId}-${Math.floor(index / CHUNK_SIZE)}-${index % CHUNK_SIZE}`,
      store_id: row.store_id,
      article_id: row.article_id,
      movement_type: "INVENTORY_ADJUSTMENT",
      quantity: row.quantity,
      reference_type: "INITIAL_STOCK_IMPORT",
      reference_id: runId,
      reference_number: referenceNumber,
      before_quantity: 0,
      after_quantity: row.quantity,
      created_by: actor.id,
      created_by_name: actor.displayName,
      notes: "Inventaire physique initial importé",
      created_at: timestamp
    };
    const auditLog: AuditLog = {
      id: `audit-${runId}-${Math.floor(index / CHUNK_SIZE)}-${index % CHUNK_SIZE}`,
      user_id: actor.id,
      user_name: actor.displayName,
      store_id: row.store_id,
      device_id: "POS-WEB-CLIENT",
      action: "INITIAL_STOCK_IMPORTED",
      entity_type: "STOCK",
      entity_id: row.id,
      new_value: stock,
      created_at: timestamp
    };
    return { stock, movement, auditLog };
  });

  if (!(await getDoc(runRef)).exists()) {
    for (let start = 0; start < orderedRows.length; start += CHUNK_SIZE) {
      const stockRefs = orderedRows.slice(start, start + CHUNK_SIZE)
        .map(row => doc(db, STOCKS_COLLECTION, row.id));
      const existingSnapshots = await Promise.all(stockRefs.map(reference => getDoc(reference)));
      const existingIndex = existingSnapshots.findIndex(snapshot => snapshot.exists());
      if (existingIndex >= 0) {
        const row = orderedRows[start + existingIndex];
        throw new Error(`Import annulé avant écriture : le stock ${row.store_id}/${row.article_id} existe déjà.`);
      }
    }
  }

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(runRef);
    if (snapshot.exists()) {
      const current = snapshot.data();
      if (current.import_hash !== importHash) throw new Error("Un import différent utilise déjà cette référence.");
      if (current.status === "COMPLETED") throw new Error("Cet inventaire initial a déjà été importé.");
      return;
    }
    transaction.set(runRef, {
      import_hash: importHash,
      status: "IN_PROGRESS",
      total_rows: rows.length,
      chunk_count: chunkCount,
      completed_chunks: [],
      created_by: actor.id,
      created_at: timestamp,
      updated_at: timestamp
    });
  });

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const chunk = preparedRows.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE);
    await runTransaction(db, async transaction => {
      const runSnapshot = await transaction.get(runRef);
      if (!runSnapshot.exists()) throw new Error("Le suivi de l'import est introuvable.");
      const run = runSnapshot.data();
      if (run.status === "COMPLETED") return;
      const completedChunks = Array.isArray(run.completed_chunks) ? run.completed_chunks as number[] : [];
      if (completedChunks.includes(chunkIndex)) return;

      const stockRefs = chunk.map(({ stock }) => doc(db, STOCKS_COLLECTION, stock.id));
      const stockSnapshots = await Promise.all(stockRefs.map(reference => transaction.get(reference)));
      const existingIndex = stockSnapshots.findIndex(snapshot => snapshot.exists());
      if (existingIndex >= 0) {
        const row = chunk[existingIndex].stock;
        throw new Error(`Import interrompu : le stock ${row.store_id}/${row.article_id} existe déjà. Les lots précédents, s'il y en a, restent enregistrés ; rechargez et relancez le même fichier pour reprendre.`);
      }

      chunk.forEach(({ stock, movement, auditLog }, index) => {
        transaction.set(stockRefs[index], stock);
        transaction.set(doc(db, MOVEMENTS_COLLECTION, movement.id), movement);
        transaction.set(doc(db, AUDIT_LOGS_COLLECTION, auditLog.id), auditLog);
      });

      const nextCompletedChunks = [...completedChunks, chunkIndex].sort((left, right) => left - right);
      transaction.update(runRef, {
        completed_chunks: nextCompletedChunks,
        status: nextCompletedChunks.length === chunkCount ? "COMPLETED" : "IN_PROGRESS",
        updated_at: timestamp
      });
    });
  }

  return {
    stocks: preparedRows.map(row => row.stock),
    movements: preparedRows.map(row => row.movement),
    auditLogs: preparedRows.map(row => row.auditLog)
  };
}
