import fs from 'node:fs';
import { parseCsv, validateStockSync } from '../../src/services/stockSyncValidation.ts';
const read=(p:string)=>{const d=JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));return d.data||d;};
const dir='imports/2026-11-12/';
const catalog=read('C:/Users/Administrator/Downloads/catalogue-2026-11-12.json');
const stores=read('C:/Users/Administrator/Downloads/magasins-2026-11-06.json');
const store=stores.find((s:any)=>s.code==='DEP-04');
if(!store||!store.is_active)throw Error('DEP-04 absent/inactive');
const source=parseCsv(fs.readFileSync(dir+'modele-stock-initial-2026-11-12.csv','utf8'));
const data:any[]=[];const errors:string[]=[];let blank=0;
source.forEach((r,i)=>{
 const raw=String(r['quantite initiale']??'').trim();
 if(!raw){blank++;return;}
 const code=String(r['code magasin']??'').trim();
 if(code&&!['DEP-04','DEP-4'].includes(code.toUpperCase())){errors.push('Line '+(i+2)+' unexpected store '+code);return;}
 const compact=raw.replace(/\s/g,'').replace(',','.');
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(compact)){errors.push('Line '+(i+2)+' invalid quantity '+raw);return;}
 const quantity=Number(compact);if(!Number.isFinite(quantity)){errors.push('Invalid quantity');return;}
 const article=catalog.articles.find((a:any)=>a.id===r['id article - ne pas modifier']);
 if(!article||article.code!==r['code article']){errors.push('Line '+(i+2)+' article mismatch');return;}
 data.push({store_id:store.id,store_code:store.code,store_name:store.name,article_id:article.id,article_code:article.code,article_name:article.name,unit:article.unit,quantity});
});
const checked=validateStockSync(data,stores,catalog.articles,[],[store.id]);errors.push(...checked.errors);
if(errors.length)throw Error(errors.join('\n'));
if(!data.length)throw Error('No quantities');
const doc={version:1,exportedAt:new Date().toISOString(),data};
fs.writeFileSync(dir+'DEP-04-stock-cible-2026-11-12.json',JSON.stringify(doc,null,2)+'\n');
const esc=(s:unknown)=>'"'+String(s??'').replaceAll('"','""')+'"';
const headers=['store_id','store_code','store_name','article_id','article_code','article_name','unit','quantity'];
fs.writeFileSync(dir+'DEP-04-stock-cible-controle.csv','\uFEFF'+headers.join(';')+'\r\n'+data.map(r=>headers.map(h=>esc(r[h])).join(';')).join('\r\n')+'\r\n');
const summary={store_id:store.id,store_code:store.code,source_rows:source.length,import_rows:data.length,blank_rows_ignored:blank,explicit_zero_rows:data.filter(r=>r.quantity===0).length,mode:'STOCK_SNAPSHOT',validation_errors:errors};
fs.writeFileSync(dir+'DEP-04-stock-cible-resume.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
