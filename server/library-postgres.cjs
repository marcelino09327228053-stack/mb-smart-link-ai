const {randomUUID}=require('node:crypto');
const {getPool}=require('./postgres.cjs');
const link=require('../shared-link.cjs');

function validate(doc){
 if(!Array.isArray(doc.hubs)||doc.hubs.length>2000)throw Error('Invalid categories.');
 const ids=new Set();
 for(const h of doc.hubs){
  if(typeof h.id!=='string'||ids.has(h.id)||typeof h.name!=='string'||!Array.isArray(h.items))throw Error('Invalid category.');
  ids.add(h.id);
  const items=new Set();
  for(const i of h.items){
   if(typeof i.id!=='string'||items.has(i.id)||typeof i.name!=='string'||!Array.isArray(i.links)||!Array.isArray(i.videos))throw Error('Invalid item.');
   items.add(i.id);
   for(const e of [...i.links,...i.videos])link.normalize(e.url);
  }
 }
 if(doc.activeLockedCategoryId&&!doc.hubs.some(h=>h.id===doc.activeLockedCategoryId&&h.locked))throw Error('Active category must be locked.');
 if(doc.passwordHash&&!/^[a-f0-9]{64}$/.test(doc.passwordHash))throw Error('Invalid category password setting.');
}

function clean(doc){
 return {
  hubs:doc.hubs,
  activeLockedCategoryId:doc.activeLockedCategoryId||null,
  passwordHash:doc.passwordHash||null
 };
}

async function get(user,client=getPool()){
 const result=await client.query(
  'SELECT revision,document FROM libraries WHERE user_id=$1',
  [user]
 );
 const row=result.rows[0];
 if(!row)return null;
 return {revision:Number(row.revision),...row.document};
}

async function put(user,revision,doc,client=getPool()){
 validate(doc);
 const value=clean(doc);
 const json=JSON.stringify(value);
 if(Buffer.byteLength(json)>4000000)throw Error('Library too large.');

 if(Number(revision)===0){
  const result=await client.query(
   'INSERT INTO libraries(user_id,revision,document) VALUES($1,1,$2::jsonb) ON CONFLICT(user_id) DO NOTHING RETURNING revision,document',
   [user,json]
  );
  if(!result.rowCount)return null;
  return {revision:Number(result.rows[0].revision),...result.rows[0].document};
 }

 const result=await client.query(
  'UPDATE libraries SET revision=revision+1,document=$1::jsonb WHERE user_id=$2 AND revision=$3 RETURNING revision,document',
  [json,user,revision]
 );
 if(!result.rowCount)return null;
 return {revision:Number(result.rows[0].revision),...result.rows[0].document};
}

async function capture(user,requestId,url,title){
 const db=getPool();
 const client=await db.connect();
 try{
  await client.query('BEGIN');

  const prior=await client.query(
   'SELECT result FROM captures WHERE user_id=$1 AND request_id=$2',
   [user,requestId]
  );
  if(prior.rowCount){
   await client.query('COMMIT');
   return prior.rows[0].result;
  }

  const locked=await client.query(
   'SELECT revision,document FROM libraries WHERE user_id=$1 FOR UPDATE',
   [user]
  );
  if(!locked.rowCount)throw Error('No active locked category. Open MB Smart Link and lock a category first.');

  // Another request with this ID may have committed while this one waited
  // for the account library lock. Return that result instead of inserting twice.
  const replay=await client.query('SELECT result FROM captures WHERE user_id=$1 AND request_id=$2',[user,requestId]);
  if(replay.rowCount){await client.query('COMMIT');return replay.rows[0].result;}

  const row=locked.rows[0];
  const doc={revision:Number(row.revision),...row.document};
  const h=doc.hubs.find(h=>h.id===doc.activeLockedCategoryId&&h.locked);
  if(!h)throw Error('No active locked category. Open MB Smart Link and lock a category first.');

  const item=link.make(url,randomUUID(),randomUUID(),new Date().toISOString(),title);
  h.items.push(item);

  validate(doc);
  const value=clean(doc);
  const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>4000000)throw Error('Library too large.');

  const updated=await client.query(
   'UPDATE libraries SET revision=revision+1,document=$1::jsonb WHERE user_id=$2 AND revision=$3 RETURNING revision',
   [json,user,doc.revision]
  );
  if(!updated.rowCount)throw Error('Category changed. Try again.');

  const result={saved:true,itemId:item.id,categoryId:h.id,categoryName:h.name};

  await client.query(
   'INSERT INTO captures(user_id,request_id,result) VALUES($1,$2,$3::jsonb)',
   [user,requestId,JSON.stringify(result)]
  );

  await client.query('COMMIT');
  return result;
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  throw e;
 }finally{
  client.release();
 }
}

async function enrich(user,itemId,title){
 if(!title||title==='Untitled Video')return;
 const db=getPool();
 const client=await db.connect();

 try{
  await client.query('BEGIN');

  const locked=await client.query(
   'SELECT revision,document FROM libraries WHERE user_id=$1 FOR UPDATE',
   [user]
  );
  if(!locked.rowCount){
   await client.query('ROLLBACK');
   return;
  }

  const row=locked.rows[0];
  const doc={revision:Number(row.revision),...row.document};
  const item=doc.hubs.flatMap(h=>h.items).find(i=>i.id===itemId);

  if(!item){
   await client.query('ROLLBACK');
   return;
  }

  const entry=item.videos[0]||item.links[0];
  if(!entry){
   await client.query('ROLLBACK');
   return;
  }

  const fallback=link.site(entry.url);
  if(item.name===fallback)item.name=title;
  if(entry.title===fallback)entry.title=title;

  validate(doc);

  await client.query(
   'UPDATE libraries SET revision=revision+1,document=$1::jsonb WHERE user_id=$2 AND revision=$3',
   [JSON.stringify(clean(doc)),user,doc.revision]
  );

  await client.query('COMMIT');
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  throw e;
 }finally{
  client.release();
 }
}

module.exports={get,put,capture,enrich,validate};
