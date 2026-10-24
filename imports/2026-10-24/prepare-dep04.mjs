import fs from 'node:fs';
const dir = new URL('./', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const write = (p, data) => fs.writeFileSync(new URL(p, dir), JSON.stringify(data, null, 2) + '\n');
const draft = read(new URL('stock-initial-DEP-04-brouillon.json', dir));
const catalog = read('C:/Users/Administrator/Downloads/catalogue-2026-10-22.json');
const units = read('C:/Users/Administrator/Downloads/unit-s-2026-10-24.json');
const timestamp = Date.now();
const slug = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const names = {KG: 'Kg', L: 'Litre', PIECE: 'Piece', G: 'Gramme', ML: 'Millilitre', GONY: 'GONY', KPK: 'KPK', PACK: 'PACK', FEUILLE: 'FEUILLE', BOTY: 'BOTY', FATORANA: 'FATORANA', BOUTEILLE: 'BOUTEILLE'};
const categories = catalog.data.categories.filter(c => c.id === 'cat-mp');
if (categories.length !== 1) throw Error('Categorie MP introuvable');
const addedUnits = [];
const addedArticles = [];
const stocks = [];
const unresolved = [];
const gramOverrides = new Set(['hibiscus', 'nico', 'stevia', 'sucre-glace', 'vaseline']);
for (const row of draft.source_rows) {
  const unit = gramOverrides.has(slug(row.article_name)) ? 'Gramme' : names[row.unit];
  if (!unit) { unresolved.push({...row, reason: 'Unite absente dans le classeur'}); continue; }
  if (![...units.data, ...addedUnits].some(u => u.name === unit)) {
    addedUnits.push({id: `unit-${slug(unit)}`, name: unit, is_active: true, created_at: timestamp, updated_at: timestamp});
  }
  const name = row.article_name.trim();
  const existing = catalog.data.articles.filter(a => a.article_type === 'RAW_MATERIAL' && slug(a.name) === slug(name) && a.unit === unit);
  if (existing.length > 1) throw Error(`Doublon: ${name}`);
  const article = existing[0] ?? {id: `article-raw-material-dep04-${slug(name)}`, code: `MP04-${String(row.source_row - 2).padStart(3, '0')}`, name, category_id: 'cat-mp', article_type: 'RAW_MATERIAL', unit, prix_achat: 0, prix_normal: 0, prix_revendeur: 0, min_alert_stock: 0, is_active: true, created_at: timestamp, updated_at: timestamp};
  if (!existing.length) addedArticles.push(article);
  stocks.push({id: `stock-MAG-046-${article.id}`, store_id: 'MAG-046', store_code: 'DEP-04', store_name: 'Matiere Premiere', article_id: article.id, article_code: article.code, article_name: article.name, unit, quantity: row.quantity});
}
for (const [label, items] of [['articles', [...catalog.data.articles, ...addedArticles]], ['units', [...units.data, ...addedUnits]]]) {
  if (new Set(items.map(x => x.id)).size !== items.length) throw Error(`IDs dupliques: ${label}`);
}
if (new Set([...catalog.data.articles, ...addedArticles].map(a => a.code)).size !== catalog.data.articles.length + addedArticles.length) throw Error('Codes articles dupliques');
const envelope = data => ({version: 1, exportedAt: new Date(timestamp).toISOString(), data});
write('unites-completes-DEP-04.json', envelope([...units.data, ...addedUnits]));
write('catalogue-complet-DEP-04.json', envelope({articles: [...catalog.data.articles, ...addedArticles], categories: catalog.data.categories}));
write('catalogue-ajouts-DEP-04.json', envelope({articles: addedArticles, categories}));
if (unresolved.length || stocks.length !== 126 || stocks.some((s, i) => s.quantity !== draft.source_rows[i].quantity)) throw Error('Rapprochement incomplet');
const stockDocument = {...envelope(stocks), review: {ready_to_apply: true, reason: 'Unites confirmees par utilisateur : HIBISCUS, NICO, STEVIA, sucre glace et vaseline en grammes. Quantites du solde final conservees. Importer auparavant les unites et le catalogue.'}, unresolved};
write('stock-initial-DEP-04.json', stockDocument);
write('stock-initial-DEP-04-a-verifier.json', stockDocument);
write('preparation-DEP-04-resume.json', {store_id: 'MAG-046', store_code: 'DEP-04', source_rows: draft.source_rows.length, articles_created: addedArticles.length, categories_reused: categories.map(c => ({id:c.id, name:c.name})), units_created: addedUnits.map(u => u.name), stock_rows: stocks.length, unresolved, checks: {unique_ids:true, unique_article_codes:true, stock_article_references:stocks.every(s => [...catalog.data.articles,...addedArticles].some(a=>a.id===s.article_id)), quantities_preserved:true}, unit_alerts:stocks.filter(s=>['Sucre glace','VASELINE'].includes(s.article_name))});
console.log(JSON.stringify({articles: addedArticles.length, units:addedUnits.map(u=>u.name), stocks:stocks.length, unresolved:unresolved.map(r=>r.article_name)}));
