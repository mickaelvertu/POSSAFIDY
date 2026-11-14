import type { PosOrderLine } from './posOrderTypes';
export function validatePosLines(lines: PosOrderLine[]) {
  if (!lines.length || lines.length > 100) throw new Error('La commande doit contenir entre 1 et 100 articles.');
  const ids = new Set<string>();
  lines.forEach(line => {
    if (!line.article_id || ids.has(line.article_id) || !Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('Choisissez des articles distincts avec des quantités positives.');
    ids.add(line.article_id);
  });
}
