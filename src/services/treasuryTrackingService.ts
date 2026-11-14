import { collection, doc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { db, runOnlineTransaction } from '../firebase';
import type { AppUser, TreasuryFund } from '../types';
export interface TreasuryCheck { id: string; owner_id: string; owner_name: string; expected: number; counted: number; difference: number; reason: string; created_at: number; fund_ids: string[] }
export interface TreasuryAttachment { id: string; movement_id: string; name: string; data: string; created_by: string; created_at: number }
export async function recordTreasuryCheck(user: AppUser, counted: number, reason: string) {
  if (!Number.isSafeInteger(counted) || counted < 0) throw new Error('Indiquez un montant entier positif ou nul.');
  const funds = await getDocs(query(collection(db, 'treasuryFunds'), where('owner_id', '==', user.uid)));
  const ref = doc(collection(db, 'treasuryChecks'));
  await runOnlineTransaction(async tx => {
    const snapshots = await Promise.all(funds.docs.map(f => tx.get(f.ref)));
    const expected = snapshots.reduce((sum, f) => sum + (f.exists() ? (f.data() as TreasuryFund).balance : 0), 0);
    if (expected !== counted && !reason.trim()) throw new Error('Expliquez l’écart constaté.');
    tx.set(ref, { id: ref.id, owner_id: user.uid, owner_name: user.displayName, expected, counted, difference: counted - expected, reason: reason.trim(), created_at: Date.now(), fund_ids: funds.docs.map(f => f.id) } satisfies TreasuryCheck);
  });
}
export async function attachTreasuryDocument(user: AppUser, movementId: string, file: File) {
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 350000) throw new Error('Choisissez un PDF ou une image JPG, PNG, WebP de 350 Ko maximum.');
  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(file); });
  const ref = doc(collection(db, 'treasuryAttachments'));
  await setDoc(ref, { id: ref.id, movement_id: movementId, name: file.name, data, created_by: user.uid, created_at: Date.now() } satisfies TreasuryAttachment);
}
