const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const link=require('../shared-link.cjs');
function repository(filename=process.env.MB_LIBRARY_DB||path.join(__dirname,'../data/library.db')){
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS libraries(user_id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS captures(user_id INTEGER, request_id TEXT, result TEXT, PRIMARY KEY(user_id,request_id));');
 function get(user){const row=db.prepare('SELECT * FROM libraries WHERE user_id=?').get(user);return row?{revision:row.revision,...JSON.parse(row.document)}:null}
 function validate(doc){
  if(!Array.isArray(doc.hubs)||doc.hubs.length>2000)throw Error('Invalid categories.');
  const ids=new Set();
  for(const h of doc.hubs){
   if(typeof h.id!=='string'||ids.has(h.id)||typeof h.name!=='string'||!Array.isArray(h.items))throw Error('Invalid category.');
   ids.add(h.id);
   const items=new Set();
   for(const i of h.items){if(typeof i.id!=='string'||items.has(i.id)||typeof i.name!=='string'||!Array.isArray(i.links)||!Array.isArray(i.videos))throw Error('Invalid item.');items.add(i.id);for(const e of [...i.links,...i.videos])link.normalize(e.url)}
  }
  if(doc.activeLockedCategoryId&&!doc.hubs.some(h=>h.id===doc.activeLockedCategoryId&&h.locked))throw Error('Active category must be locked.');
  if(doc.passwordHash&&!/^[a-f0-9]{64}$/.test(doc.passwordHash))throw Error('Invalid category password setting.');
 }
 function put(user,revision,doc){
  validate(doc);
  const json=JSON.stringify({hubs:doc.hubs,activeLockedCategoryId:doc.activeLockedCategoryId||null,passwordHash:doc.passwordHash||null});
  if(Buffer.byteLength(json)>4000000)throw Error('Library too large.');
  if(revision===0){
   const result=db.prepare('INSERT OR IGNORE INTO libraries VALUES(?,1,?)').run(user,json);
   if(!result.changes)return null;
  }else if(!db.prepare('UPDATE libraries SET revision=revision+1,document=? WHERE user_id=? AND revision=?').run(json,user,revision).changes)return null;
  return get(user);
 }
 function capture(user,requestId,url,title){
  const prior=db.prepare('SELECT result FROM captures WHERE user_id=? AND request_id=?').get(user,requestId);
  if(prior)return JSON.parse(prior.result);
  db.exec('BEGIN IMMEDIATE');
  try{
   const doc=get(user),h=doc?.hubs.find(h=>h.id===doc.activeLockedCategoryId&&h.locked);
   if(!h)throw Error('No active locked category. Open MB Smart Link and lock a category first.');
   const item=link.make(url,randomUUID(),randomUUID(),new Date().toISOString(),title);
   h.items.push(item);
   if(!put(user,doc.revision,doc))throw Error('Category changed. Try again.');
   const result={saved:true,itemId:item.id,categoryId:h.id,categoryName:h.name};
   db.prepare('INSERT INTO captures VALUES(?,?,?)').run(user,requestId,JSON.stringify(result));
   db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 function enrich(user,itemId,title){
  if(!title||title==='Untitled Video')return;
  const d=get(user);if(!d)return;
  const i=d.hubs.flatMap(h=>h.items).find(i=>i.id===itemId);if(!i)return;
  const entry=i.videos[0]||i.links[0];if(!entry)return;
  const fallback=link.site(entry.url);
  if(i.name===fallback)i.name=title;
  if(entry.title===fallback)entry.title=title;
  put(user,d.revision,d);
 }
 return {get,put,capture,enrich,close:()=>db.close()};
}
module.exports={repository};
