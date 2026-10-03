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
function slug(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sans-nom';
}
function nameIdentifiers(rows, idPrefix, codePrefix) {
  const idCounts = new Map();
  const codeCounts = new Map();
  const identifiers = new Map();
  const ordered = [...rows].sort((left, right) => {
    const legacyOrder = Number(!left.legacy_source) - Number(!right.legacy_source);
    if (legacyOrder) return legacyOrder;
    const leftKey = String(left.legacy_source?.id || left.id);
    const rightKey = String(right.legacy_source?.id || right.id);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const nextValue = (base, counts) => {
    const occurrence = (counts.get(base) || 0) + 1;
    counts.set(base, occurrence);
    return occurrence === 1 ? base : `${base}-${String(occurrence).padStart(2, '0')}`;
  };
  for (const row of ordered) {
    const normalized = slug(row.name);
    identifiers.set(row, {
      id: nextValue(`${idPrefix(row)}${normalized}`, idCounts),
      code: nextValue(`${codePrefix(row)}${normalized.toUpperCase()}`, codeCounts)
    });
  }
  return identifiers;
}
function nameInitials(name) {
  const ignoredWords = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'et']);
  const words = slug(name).split('-').filter(word => !ignoredWords.has(word));
  if (words.length > 1) return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return (words[0] || 'PR').slice(0, 2).toUpperCase();
}
function articleInitials(article) {
  return nameInitials(article.name);
}
function articleCodes(rows) {
  const preferredNames = new Map([['aloe-noni', 0], ['aloe-miel', 1]]);
  const groups = new Map();
  rows.forEach((article, index) => {
    const nameKey = slug(article.name);
    const group = groups.get(nameKey) || { nameKey, articles: [], firstIndex: index };
    group.articles.push(article);
    groups.set(nameKey, group);
  });
  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftRank = preferredNames.get(left.nameKey) ?? 2;
    const rightRank = preferredNames.get(right.nameKey) ?? 2;
    return leftRank - rightRank || left.firstIndex - right.firstIndex;
  });
  const result = new Map();
  orderedGroups.forEach((group, index) => {
    const baseCode = `${articleInitials(group.articles[0])}${String(index + 1).padStart(3, '0')}`;
    const duplicates = [...group.articles].sort((left, right) =>
      Number(right.created_at || 0) - Number(left.created_at || 0)
    );
    duplicates.forEach((article, duplicateIndex) => {
      result.set(article, duplicateIndex === 0
        ? baseCode
        : `${baseCode}-${String(duplicateIndex + 1).padStart(2, '0')}`);
    });
  });
  return result;
}
function categoryCodes(rows) {
  const groups = new Map();
  rows.forEach((category, index) => {
    const nameKey = slug(category.name);
    const group = groups.get(nameKey) || { nameKey, categories: [], firstIndex: index };
    group.categories.push(category);
    groups.set(nameKey, group);
  });
  const orderedGroups = [...groups.values()].sort((left, right) => left.firstIndex - right.firstIndex);
  const result = new Map();
  orderedGroups.forEach((group, index) => {
    const baseCode = `${nameInitials(group.categories[0].name)}${String(index + 1).padStart(3, '0')}`;
    group.categories.forEach((category, duplicateIndex) => {
      result.set(category, duplicateIndex === 0
        ? baseCode
        : `${baseCode}-${String(duplicateIndex + 1).padStart(2, '0')}`);
    });
  });
  return result;
}
function cleanArticle(article) {
  const {
    id, code, name, category_id, article_type, unit, prix_achat, prix_normal,
    prix_revendeur, prix_special, min_alert_stock, is_active, created_at, updated_at
  } = article;
  return {
    id, code, name, category_id, article_type, unit, prix_achat, prix_normal,
    prix_revendeur,
    ...(prix_special !== undefined ? { prix_special } : {}),
    ...(min_alert_stock !== undefined ? { min_alert_stock } : {}),
    is_active, created_at, updated_at
  };
}
function cleanCategory(category) {
  const { id, code, name, is_active, created_at, updated_at } = category;
  return { id, code, name, is_active, created_at, updated_at };
}
function cleanCatalogue(data) {
  return {
    articles: data.articles.map(cleanArticle),
    categories: data.categories.map(cleanCategory)
  };
}
function deduplicateCurrentArticles(articles) {
  const preferredDuplicate = new Map([
    ['sakamalaho|RAW_MATERIAL', article => article.prix_achat === 14000],
    ['ambre500ml|RAW_MATERIAL', article => article.category_id === 'cat-flacons']
  ]);
  const groups = new Map();
  for (const article of articles) {
    const nameKey = article.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${nameKey}|${article.article_type}`;
    const group = groups.get(key) || [];
    group.push(article);
    groups.set(key, group);
  }

  const kept = [];
  const articleIdMap = new Map();
  const unresolved = [];
  let removed = 0;
  for (const [key, group] of groups) {
    const newestTimestamp = Math.max(...group.map(article => Number(article.created_at) || 0));
    const newest = group.filter(article => (Number(article.created_at) || 0) === newestTimestamp);
    const preferred = preferredDuplicate.get(key);
    const selected = preferred ? newest.find(preferred) : undefined;
    if (selected) {
      kept.push(selected);
      for (const article of group) articleIdMap.set(article.id, selected.id);
      removed += group.length - 1;
      continue;
    }
    if (group.length > 1) {
      kept.push(...newest);
      for (const article of group) articleIdMap.set(article.id, newest.includes(article) ? article.id : newest[0].id);
      removed += group.length - newest.length;
    }
    if (newest.length > 1) {
      unresolved.push({
        name: group[0].name,
        candidates: newest.map(article => ({ id: article.id, prix_achat: article.prix_achat, category_id: article.category_id }))
      });
      continue;
    }

    const canonical = newest[0];
    if (group.length === 1) kept.push(canonical);
    for (const article of group) articleIdMap.set(article.id, canonical.id);
  }
  return { articles: kept, articleIdMap, removed, unresolved };
}
function writeCatalogue(name, data) {
  fs.writeFileSync(new URL(name, folder), JSON.stringify({ data: cleanCatalogue(data) }, null, 2) + '\n');
}
function write(name, data) {
  fs.writeFileSync(new URL(name, folder), JSON.stringify({ version: 1, exportedAt: new Date(timestamp).toISOString(), data }, null, 2) + '\n');
}
function writeStores(data) {
  fs.writeFileSync(new URL('magasins.json', folder), JSON.stringify({ data }, null, 2) + '\n');
}
function normalizeCurrentCatalogue() {
  const cataloguePath = new URL('catalogue-2026-10-01.json', folder);
  const stockPath = new URL('stocks-a-verifier.json', folder);
  const catalogueDocument = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  const stockDocument = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
  const categories = catalogueDocument.data.categories;
  const articles = catalogueDocument.data.articles;
  const categoryIdentifiers = nameIdentifiers(categories, () => 'cat-', () => 'CAT-');
  const categoryIdMap = new Map();

  for (const category of categories) {
    const oldId = category.id;
    const identifiers = categoryIdentifiers.get(category);
    categoryIdMap.set(oldId, identifiers.id);
    Object.assign(category, identifiers);
  }
  const generatedCategoryCodes = categoryCodes(categories);
  for (const category of categories) category.code = generatedCategoryCodes.get(category);

  const articleIdentifiers = nameIdentifiers(
    articles,
    article => `article-${article.article_type.toLowerCase().replace('_', '-')}-`,
    () => ''
  );
  const articleIdMap = new Map();
  for (const article of articles) {
    const oldId = article.id;
    const identifiers = articleIdentifiers.get(article);
    articleIdMap.set(oldId, identifiers.id);
    article.category_id = categoryIdMap.get(article.category_id);
    Object.assign(article, identifiers);
  }
  const deduplication = deduplicateCurrentArticles(articles);
  articles.splice(0, articles.length, ...deduplication.articles);
  for (const [articleId, canonicalId] of deduplication.articleIdMap) articleIdMap.set(articleId, canonicalId);
  const codes = articleCodes(articles);
  for (const article of articles) article.code = codes.get(article);

  assert(articles.every(article => article.category_id), 'Article category mapping failed');
  assert.equal(new Set(articles.map(article => article.id)).size, articles.length, 'Duplicate article IDs');
  assert.equal(new Set(articles.map(article => article.code)).size, articles.length, 'Duplicate article codes');
  assert.equal(new Set(categories.map(category => category.id)).size, categories.length, 'Duplicate category IDs');
  assert.equal(new Set(categories.map(category => category.code)).size, categories.length, 'Duplicate category codes');
  assert.equal(stockDocument.review.ready_to_apply, false, 'Stock review flag changed unexpectedly');

  for (const stock of stockDocument.data) {
    const articleId = deduplication.articleIdMap.get(stock.article_id) || articleIdMap.get(stock.article_id);
    assert(articleId, `Unknown stock article ${stock.article_id}`);
    stock.article_id = articleId;
    stock.id = `stock-${stock.store_id}-${articleId}`;
  }

  catalogueDocument.data = cleanCatalogue(catalogueDocument.data);
  fs.writeFileSync(cataloguePath, JSON.stringify({ data: catalogueDocument.data }, null, 2) + '\n');
  fs.writeFileSync(stockPath, JSON.stringify(stockDocument, null, 2) + '\n');
  console.log(JSON.stringify({
    articles: articles.length,
    categories: categories.length,
    duplicatesRemoved: deduplication.removed,
    unresolvedDuplicateGroups: deduplication.unresolved,
    stockRows: stockDocument.data.length
  }, null, 2));
}

if (process.argv.includes('--normalize-current-catalogue')) {
  normalizeCurrentCatalogue();
  process.exit(0);
}
for (const key of ['stores', 'articles', 'categories', 'units', 'suppliers']) unique(source[key], 'id');
const storeTypes = { depot: 'CENTRAL_WAREHOUSE', retail: 'POS', revendeur: 'RESELLER', manufacture: 'MANUFACTURER' };
const storeCounts = { POS: 0, RESELLER: 0 };
const stores = source.stores.map(row => {
  assert(storeTypes[row.type], `Unknown store type ${row.type}`);
  const storeType = storeTypes[row.type];
  let id;
  let code;
  if (storeType === 'CENTRAL_WAREHOUSE') {
    id = 'store-central-01';
    code = 'DEP-01';
  } else if (storeType === 'POS') {
    const number = String(++storeCounts.POS).padStart(2, '0');
    id = `store-pos-${number}`;
    code = `POS-${number}`;
  } else if (storeType === 'RESELLER') {
    const number = String(++storeCounts.RESELLER).padStart(2, '0');
    id = `store-rev-${number}`;
    code = `REV-${number}`;
  } else {
    id = 'store-manuf-01';
    code = 'PRD-01';
  }
  return { ...base(row), id, code, store_type: storeType };
});
const otherStores = books[1].sheets.Magasins;
assert.equal(otherStores.length, stores.length);
for (const row of otherStores) {
  const original = source.stores.find(store => store.id === row.Identifiant);
  assert(original && original.name === row.Nom, `Store mismatch ${row.Identifiant}`);
}
const units = source.units.map(row => ({ ...base(row), ...metadata(row) }));
const supplierIds = new Map([...source.suppliers]
  .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  .map((row, index) => [row.id, `FOU-${String(index + 1).padStart(3, '0')}`]));
const suppliers = source.suppliers.map(row => ({ ...base(row), id: supplierIds.get(row.id), address: row.address || '', phone: row.phone || '', email: row.email || '', ...metadata(row) }));
if (process.argv.includes('--suppliers-only')) {
  write('fournisseurs.json', suppliers);
  console.log(JSON.stringify({ fournisseurs: suppliers.length }, null, 2));
  process.exit(0);
}
const sourceCategories = source.categories.map(row => ({ ...base(row), ...metadata(row) }));
const fallbackCategory = { ...base({ id: 'migration-category-unclassified', name: 'À classer' }) };
const categoryIdentifiers = nameIdentifiers(
  [...sourceCategories, fallbackCategory],
  () => 'cat-',
  () => 'CAT-'
);
const categories = sourceCategories.map(category => ({ ...category, ...categoryIdentifiers.get(category) }));
const categoryIdBySourceId = new Map(sourceCategories.map(category => [
  category.legacy_source.id,
  categoryIdentifiers.get(category).id
]));
const fallbackCategoryId = categoryIdentifiers.get(fallbackCategory).id;
const unitNames = new Map(units.map(row => [row.id, row.name]));
const articleTypes = { achat: 'RESALE', raw: 'RAW_MATERIAL' };
const articles = source.articles.map(row => {
  assert(articleTypes[row.type], `Unknown article type ${row.type}`);
  const missing = [];
  let categoryId = categoryIdBySourceId.get(row.category);
  if (!categoryId) {
    missing.push(categoryId ? `Catégorie introuvable : ${categoryId}` : 'Catégorie absente');
    if (row.category) missing[missing.length - 1] = `Catégorie introuvable : ${row.category}`;
    categoryId = fallbackCategoryId;
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
    ...base(row), category_id: categoryId,
    article_type: articleTypes[row.type], unit,
    prix_achat: number('cost', "Prix d'achat"),
    prix_normal: number('salePrice', 'Prix de vente'),
    prix_revendeur: number('resellerPrice', 'Prix revendeur'),
    ...(row.min !== undefined && row.min !== '' ? { min_alert_stock: number('min', 'Seuil de stock') } : {}),
    ...metadata(row)
  };
  if (missing.length) issues.push({ id: row.id, name: row.name, points: missing });
  return result;
});
const articleIdentifiers = nameIdentifiers(
  articles,
  article => `article-${article.article_type.toLowerCase().replace('_', '-')}-`,
  () => ''
);
const sourceArticleIdToNewId = new Map();
for (let index = 0; index < articles.length; index += 1) {
  const article = articles[index];
  const identifiers = articleIdentifiers.get(article);
  sourceArticleIdToNewId.set(source.articles[index].id, identifiers.id);
  Object.assign(article, identifiers);
}
const sourceDeduplication = deduplicateCurrentArticles(articles);
articles.splice(0, articles.length, ...sourceDeduplication.articles);
for (const [sourceId, articleId] of sourceArticleIdToNewId) {
  sourceArticleIdToNewId.set(sourceId, sourceDeduplication.articleIdMap.get(articleId) || articleId);
}
const generatedArticleCodes = articleCodes(articles);
const currentCataloguePath = new URL('catalogue-2026-10-01.json', folder);
const currentArticleCodes = fs.existsSync(currentCataloguePath)
  ? new Map(JSON.parse(fs.readFileSync(currentCataloguePath, 'utf8')).data.articles.map(article => [article.id, article.code]))
  : new Map();
for (const article of articles) {
  article.code = currentArticleCodes.get(article.id) || generatedArticleCodes.get(article);
}
for (const issue of issues) {
  issue.id = sourceArticleIdToNewId.get(issue.id);
}
const consolidatedIssues = new Map();
for (const issue of issues) {
  const existing = consolidatedIssues.get(issue.id);
  if (existing) existing.points = [...new Set([...existing.points, ...issue.points])];
  else consolidatedIssues.set(issue.id, issue);
}
issues.splice(0, issues.length, ...consolidatedIssues.values());
if (articles.some(row => row.category_id === fallbackCategoryId)) {
  categories.push({ ...fallbackCategory, ...categoryIdentifiers.get(fallbackCategory) });
}
const generatedCategoryCodes = categoryCodes(categories);
const currentCategoryCodes = fs.existsSync(currentCataloguePath)
  ? new Map(JSON.parse(fs.readFileSync(currentCataloguePath, 'utf8')).data.categories.map(category => [category.id, category.code]))
  : new Map();
for (const category of categories) {
  category.code = currentCategoryCodes.get(category.id) || generatedCategoryCodes.get(category);
}
unique(categories, 'id');
unique(articles, 'code');
unique(categories, 'code');
unique(stores, 'id');
unique(stores, 'code');
assert(articles.every(row => categories.some(category => category.id === row.category_id)));
assert.equal(source.stock.length, 0);
if (process.argv.includes('--catalogue-only')) {
  writeCatalogue('catalogue-a-verifier.json', { articles, categories });
  write('points-a-verifier.json', issues);
  console.log(JSON.stringify({ articles: articles.length, categories: categories.length }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--stores-only')) {
  writeStores(stores);
  console.log(JSON.stringify({ magasins: stores.length }, null, 2));
  process.exit(0);
}
writeStores(stores);
write('unites.json', units);
write('fournisseurs.json', suppliers);
writeCatalogue('catalogue-a-verifier.json', { articles, categories });
write('points-a-verifier.json', issues);
const summary = {
  magasins: stores.length, fournisseurs: suppliers.length, unites: units.length,
  articles: articles.length, categoriesSource: source.categories.length,
  categoriesSortie: categories.length,
  articlesSansUnite: articles.filter(row => !row.unit).length,
  articlesSansCategorie: articles.filter(row => row.category_id === fallbackCategoryId).length,
  prixAchatAbsents: source.articles.filter(row => !row.cost).length,
  stocks: source.stock.length
};
fs.writeFileSync(new URL('resume.json', folder), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
