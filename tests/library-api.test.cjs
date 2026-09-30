process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');const auth=require('../server/auth.cjs');
test('native cookie API saves into the same account library and enforces auth, origin and unlock',async()=>{
 const s=createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+s.address().port;
 const user=auth.ensureOtpUser('test@example.com'),cookie='mb_session='+auth.createSession(user.id);
 const call=(path,method='GET',body,c=cookie,origin=base)=>fetch(base+path,{method,headers:{Cookie:c,Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await call('/api/library','GET',null,'')).status,401);
  const d={revision:0,hubs:[{id:'a',name:'Panel Beater',locked:true,items:[]}],activeLockedCategoryId:'a'};
  assert.equal((await call('/api/library','PUT',d,cookie,'https://evil.test')).status,403);
  assert.equal((await call('/api/library','PUT',d)).status,200);
  const capture={requestId:'request-123456789',url:'https://example.invalid/video'};
  const saved=await call('/api/library/capture','POST',capture);assert.equal(saved.status,200);assert.equal((await saved.json()).saved,true);
  let remote=(await (await call('/api/library')).json()).library;
  assert.equal(remote.hubs[0].items.length,1);assert.equal(remote.hubs[0].items[0].links[0].url,capture.url);
  await call('/api/library/capture','POST',capture);
  remote=(await (await call('/api/library')).json()).library;assert.equal(remote.hubs[0].items.length,1);
  remote.hubs[0].locked=false;remote.activeLockedCategoryId=null;
  await call('/api/library','PUT',remote);
  assert.equal((await call('/api/library/capture','POST',{...capture,requestId:'request-987654321'})).status,400);
  auth.deleteSession(cookie.split('=')[1]);assert.equal((await call('/api/library')).status,401);
 }finally{await new Promise(resolve=>s.close(resolve))}
});
