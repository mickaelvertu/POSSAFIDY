import fs from 'node:fs';
import assert from 'node:assert/strict';

const folder = new URL('./', import.meta.url);
const books = JSON.parse(fs.readFileSync(new URL('source-excel.json', folder), 'utf8').replace(/^\uFEFF/, ''));
const source = books[0].sheets;
const timestamp = Date.now();
const issues = [];
const base = row => ({ id: row.id, name: row.name, is_active: true, created_at: timestamp, updated_at: timestamp });
const metadata = row => ({ legacy_source: row });
function unique(rows, field) {
  assert(rows.every(row => typeof row[field] === 'string' && row[field].trim()), `Missing ${field}`);
  assert.equal(new Set(rows.map(row => row[field])).size, rows.length, `Duplicate ${field}`);
}
function write(name, data) {
  fs.writeFileSync(new URL(name, folder), JSON.stringify({ version: 1, exportedAt: new Date(timestamp).toISOString(), data }, null, 2) + '\n');
}
for (const key of ['stores', 'articles', 'categories', 'units', 'suppliers']) unique(source[key], 'id');
const storeTypes = { depot: 'CENTRAL_WAREHOUSE', retail: 'POS', revendeur: 'RESELLER', manufacture: 'MANUFACTURER' };
const stores = source.stores.map(row => {
  assert(storeTypes[row.type], `Unknown store type ${row.type}`);
  return { ...base(row), code: row.id, store_type: storeTypes[row.type], location: row.address || '', ...metadata(row) };
});
const otherStores = books[1].sheets.Magasins;
assert.equal(otherStores.length, stores.length);
for (const row of otherStores) {
  const original = source.stores.find(store => store.id === row.Identifiant);
  assert(original && original.name === row.Nom, `Store mismatch ${row.Identifiant}`);
}
const units = source.units.map(row => ({ ...base(row), ...metadata(row) }));
const suppliers = source.suppliers.map(row => ({ ...base(row), address: row.address || '', phone: row.phone || '', email: row.email || '', ...metadata(row) }));
const categories = source.categories.map(row => ({ ...base(row), code: row.id, ...metadata(row) }));
const unitNames = new Map(units.map(row => [row.id, row.name]));
const categoryIds = new Set(categories.map(row => row.id));
const blankCategoryId = 'migration-category-unclassified';
const articleTypes = { achat: 'RESALE', raw: 'RAW_MATERIAL' };
const codeCounts = new Map();
for (const row of source.articles) if (row.barcode) codeCounts.set(row.barcode, (codeCounts.get(row.barcode) || 0) + 1);
const articles = source.articles.map(row => {
  assert(articleTypes[row.type], `Unknown article type ${row.type}`);
  const missing = [];
  let categoryId = row.category;
  if (!categoryIds.has(categoryId)) {
    missing.push(categoryId ? `Catégorie introuvable : ${categoryId}` : 'Catégorie absente');
    categoryId = blankCategoryId;
  }
  const unit = unitNames.get(row.saleUnit) || '';
  if (!unit) missing.push('Unité de vente absente ou introuvable : à compléter');
  const number = (field, label) => {
    if (row[field] === undefined || row[field] === '') {
      missing.push(`${label} absent : valeur technique 0, à vérifier`);
      return 0;
    }
    const value = Number(row[field]);
    assert(Number.isFinite(value) && value >= 0, `Invalid ${field}: ${row.id}`);
    return value;
  };
  const result = {
    ...base(row), code: row.barcode && codeCounts.get(row.barcode) === 1 ? row.barcode : row.id, category_id: categoryId,
    article_type: articleTypes[row.type], unit,
    prix_achat: number('cost', "Prix d'achat"),
    prix_normal: number('salePrice', 'Prix de vente'),
    prix_revendeur: number('resellerPrice', 'Prix revendeur'),
    ...(row.min !== undefined && row.min !== '' ? { min_alert_stock: number('min', 'Seuil de stock') } : {}),
    ...metadata(row)
  };
  if (!row.barcode) missing.push("Code absent : identifiant d'origine utilisé");
  if (row.barcode && codeCounts.get(row.barcode) > 1) missing.push(`Code partagé ${row.barcode} : identifiant d'origine utilisé, à vérifier`);
  if (missing.length) issues.push({ id: row.id, name: row.name, points: missing });
  return result;
});
if (articles.some(row => row.category_id === blankCategoryId)) {
  categories.push({ ...base({ id: blankCategoryId, name: 'À classer' }), code: blankCategoryId });
}
unique(articles, 'code');
unique(categories, 'code');
unique(stores, 'code');
assert(articles.every(row => categories.some(category => category.id === row.category_id)));
assert.equal(source.stock.length, 0);
write('magasins.json', stores);
write('unites.json', units);
write('fournisseurs.json', suppliers);
write('catalogue-a-verifier.json', { articles, categories });
write('points-a-verifier.json', issues);
const summary = {
  magasins: stores.length, fournisseurs: suppliers.length, unites: units.length,
  articles: articles.length, categoriesSource: source.categories.length,
  categoriesSortie: categories.length,
  articlesSansUnite: articles.filter(row => !row.unit).length,
  articlesSansCategorie: articles.filter(row => row.category_id === blankCategoryId).length,
  prixAchatAbsents: source.articles.filter(row => !row.cost).length,
  stocks: source.stock.length
};
fs.writeFileSync(new URL('resume.json', folder), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
