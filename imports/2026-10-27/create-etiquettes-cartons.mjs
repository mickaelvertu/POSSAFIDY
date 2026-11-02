import fs from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const auth=require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
const account=auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
if (!account) throw Error('Firebase login required');
const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const base='https://firestore.googleapis.com/v1/projects/stockgileada/databases/(default)/documents';
async function request(url,options={}) {
 const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'}});
 const result=await response.json();
 if (!response.ok) throw Error(`Firestore ${response.status}: ${result.error?.message || 'request failed'}`);
 return result;
}
function decode(v) {
 if ('stringValue' in v) return v.stringValue;
 if ('integerValue' in v) return Number(v.integerValue);
 if ('doubleValue' in v) return v.doubleValue;
 if ('booleanValue' in v) return v.booleanValue;
 return undefined;
}
async function list(collection) {
 const result=[]; let page='';
 do {
  const data=await request(`${base}/${collection}?pageSize=1000${page ? '&pageToken='+encodeURIComponent(page):''}`);
  result.push(...(data.documents || []).map(d=>({...Object.fromEntries(Object.entries(d.fields || {}).map(([k,v])=>[k,decode(v)])),id:d.name.split('/').at(-1)})));
  page=data.nextPageToken;
 } while(page);
 return result;
}
const slug=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const normal=s=>slug(s || '');
const out=new URL('./catalogue-etiquettes-cartons-2026-10-27.json',import.meta.url);
const planFile=new URL('./creation-etiquettes-cartons-plan.json',import.meta.url);
const resultFile=new URL('./creation-etiquettes-cartons-resultat.json',import.meta.url);
function encode(value) {
 if (typeof value==='string') return {stringValue:value};
 if (typeof value==='boolean') return {booleanValue:value};
 if (typeof value==='number') return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 throw Error('Unsupported field');
}
if (process.argv.includes('--apply')) {
 const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
 assert.equal(plan.project,'stockgileada');
 assert(plan.creates.every(row=>['articles','categories','auditLogs'].includes(row.collection)));
 const writes=plan.creates.map(row=>({update:{name:`projects/stockgileada/databases/(default)/documents/${row.collection}/${row.data.id}`,fields:Object.fromEntries(Object.entries(row.data).map(([k,v])=>[k,encode(v)]))},currentDocument:{exists:false}}));
 if (writes.length) await request(`${base}:commit`,{method:'POST',body:JSON.stringify({writes})});
 const check=await list('articles');
 const catalog=JSON.parse(fs.readFileSync(out,'utf8'));
 for(const expected of catalog.data.articles) {
  const actual=check.find(a=>a.id===expected.id);
  assert(actual && actual.name===expected.name && actual.category_id===expected.category_id && actual.article_type==='RAW_MATERIAL');
 }
 const summary={project:'stockgileada',appliedAt:new Date().toISOString(),createdArticles:plan.creates.filter(r=>r.collection==='articles').length,createdCategories:plan.creates.filter(r=>r.collection==='categories').length,verifiedArticles:catalog.data.articles.length};
 fs.writeFileSync(resultFile,JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
} else {
 const [existingArticles,existingCategories,units]=await Promise.all([list('articles'),list('categories'),list('units')]);
 const piece=units.find(u=>normal(u.name)==='piece' && u.is_active);
 if(!piece) throw Error('Active Piece unit not found');
 const text=fs.readFileSync('C:/Users/Administrator/.codex/attachments/9a7de343-4a98-452a-b054-ecc46dcd6dbd/Pasted text.txt','utf8');
 const rows=text.split(/\r?\n/).map(l=>l.split('\t').map(c=>c.trim()));
 const stamp=Date.now(),creates=[],categories=[],articles=[];
 for(const [column,prefix] of [[1,'MP-ETQ'],[2,'MP-PCI']]) {
  const code=rows[0][column],name=rows[1][column];
  assert(code && name);
  const matches=existingCategories.filter(c=>normal(c.name)===normal(name) || normal(c.code)===normal(code));
  assert(matches.length<=1,'Ambiguous category');
  const category=matches[0] || {id:`category-${slug(name)}`,code,name,description:'',is_active:true,created_at:stamp,updated_at:stamp};
  assert(category.is_active,'Category inactive');
  if(!matches.length) {
   assert(!existingCategories.some(c=>c.id===category.id),'Category ID conflict');
   creates.push({collection:'categories',data:category});
  }
  categories.push(category);
  const items=rows.slice(2).map(r=>r[column]).filter(Boolean);
  for(const [index,item] of items.entries()) {
   const articleName=`${name} ${item}`;
   const found=existingArticles.filter(a=>normal(a.name)===normal(articleName));
   assert(found.length<=1,'Duplicate article name');
   const article=found[0] || {id:`article-raw-material-${slug(articleName)}`,code:`${prefix}-${String(index+1).padStart(3,'0')}`,name:articleName,category_id:category.id,article_type:'RAW_MATERIAL',unit:piece.name,prix_achat:0,prix_normal:0,prix_revendeur:0,min_alert_stock:0,is_active:true,created_at:stamp,updated_at:stamp};
   assert(article.article_type==='RAW_MATERIAL' && article.category_id===category.id && article.unit===piece.name && article.is_active,'Existing article differs');
   if(!found.length) {
    assert(!existingArticles.some(a=>a.id===article.id || normal(a.code)===normal(article.code)),'Article ID/code conflict');
    creates.push({collection:'articles',data:article});
   }
   articles.push(article);
  }
 }
 assert.equal(articles.length,69);
 assert.equal(new Set(articles.map(a=>normal(a.name))).size,69);
 const actor=account.user.email;
 const audited=[...creates];
 for(const entry of audited) {
  creates.push({collection:'auditLogs',data:{id:`audit-${crypto.randomUUID()}`,user_id:actor,user_name:actor,device_id:'CODEX-IMPORT',action:entry.collection==='articles'?'ARTICLE_CREATED':'CATEGORY_CREATED',entity_type:entry.collection==='articles'?'ARTICLE':'CATEGORY',entity_id:entry.data.id,created_at:stamp}});
 }
 const envelope={version:1,exportedAt:new Date(stamp).toISOString(),data:{articles,categories}};
 fs.writeFileSync(out,JSON.stringify(envelope,null,2)+'\n');
 fs.writeFileSync(planFile,JSON.stringify({project:'stockgileada',preparedAt:new Date(stamp).toISOString(),creates},null,2)+'\n');
 console.log(JSON.stringify({articles:articles.length,categories:categories.map(c=>({name:c.name,count:articles.filter(a=>a.category_id===c.id).length})),newArticles:audited.filter(r=>r.collection==='articles').length,newCategories:audited.filter(r=>r.collection==='categories').length,unit:piece.name,samples:[articles[0].name,articles.at(-1).name]},null,2));
}
