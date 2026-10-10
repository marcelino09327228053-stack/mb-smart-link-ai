process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';
delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
process.env.ADMIN_EMAIL='owner@example.invalid';
const test=require('node:test'),assert=require('node:assert/strict');
const auth=require('../server/auth.cjs'),{createServer}=require('../server.cjs');
test('access codes: admin authorization, same session/data, no hash disclosure, expiry and revocation',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 async function call(path,method='GET',body,cookie){const r=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  const owner=auth.ensureOtpUser(process.env.ADMIN_EMAIL),ordinary=auth.ensureOtpUser('other@example.invalid');
  const admin='mb_session='+auth.createSession(owner.id),other='mb_session='+auth.createSession(ordinary.id);
  assert.equal((await call('/api/admin/access-codes')).status,403);
  assert.equal((await call('/api/admin/access-codes','POST',{label:'User',days:7},other)).status,403);
  assert.equal((await call('/api/admin/access-codes','POST',{label:'User',days:0},admin)).status,400);
  const issued=await call('/api/admin/access-codes','POST',{label:'User',days:7},admin);assert.equal(issued.status,201);
  const listed=await call('/api/admin/access-codes','GET',null,admin);assert.equal(listed.data.codes.length,1);assert.ok(!JSON.stringify(listed.data).includes(issued.data.code));assert.ok(!JSON.stringify(listed.data).includes('code_hash'));
  assert.equal((await call('/api/auth/access-code','POST',{code:'wrong'})).status,401);
  const activated=await call('/api/auth/access-code','POST',{code:issued.data.code});assert.equal(activated.status,200);assert.equal(activated.data.user.isAdmin,false);assert.ok(activated.cookie.startsWith('mb_session='));
  assert.equal((await call('/api/admin/access-codes','GET',null,activated.cookie)).status,403);
  assert.equal((await call('/api/auth/me','GET',null,activated.cookie)).status,200);
  assert.equal((await call('/api/library','GET',null,activated.cookie)).status,200);
  const again=await call('/api/auth/access-code','POST',{code:issued.data.code});assert.equal(again.data.user.id,activated.data.user.id);
  await call('/api/admin/access-codes','DELETE',{id:issued.data.id},admin);
  assert.equal((await call('/api/auth/me','GET',null,activated.cookie)).status,401);
  assert.equal((await call('/api/auth/me','GET',null,again.cookie)).status,401);
  assert.equal((await call('/api/auth/access-code','POST',{code:issued.data.code})).status,401);
  const expired=await auth.access.issue('Expired',-1);assert.equal(await auth.access.resolve(expired.code),null);
  assert.equal((await call('/api/auth/me','GET',null,admin)).data.user.isAdmin,true);
  const r=await fetch(origin+'/api/auth/access-code',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify({code:issued.data.code})});assert.equal(r.status,403);
 }finally{await new Promise(r=>server.close(r));}
});
