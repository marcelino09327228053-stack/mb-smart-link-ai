process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';
delete process.env.PGHOST;delete process.env.DATABASE_URL;
const {test}=require('node:test'),assert=require('node:assert/strict');
const {emailDelivery}=require('../server/email.cjs'),auth=require('../server/auth.cjs');
const {createServer}=require('../server.cjs');
test('Resend sends code only to provider; provider error bodies never escape',async()=>{
 let sent;
 const mail=emailDelivery({env:{RESEND_API_KEY:'test-key',RESEND_FROM_EMAIL:'MB <login@example.test>',NODE_ENV:'production'},
 fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({id:'test-id'})}}});
 const result=await mail.send('test@example.test','654321',false);
 assert.equal(result.demoMode,false);assert.equal(result.message.includes('654321'),false);
 assert.equal(sent.url,'https://api.resend.com/emails');
 assert.equal(JSON.parse(sent.options.body).to[0],'test@example.test');
 assert.match(JSON.parse(sent.options.body).text,/654321/);
 assert.equal(JSON.parse(sent.options.body).from,'MB <login@example.test>');
 assert.equal(JSON.parse(sent.options.body).subject,'MB Smart Link AI verification code');
 const failed=emailDelivery({env:{EMAIL_PROVIDER:'resend',RESEND_API_KEY:'secret',RESEND_FROM_EMAIL:'login@example.test'},
 fetchImpl:async()=>({ok:false,text:async()=> 'sensitive provider response'})});
 await assert.rejects(failed.send('test@example.test','654321',false),/^Error: Could not send/);
});
test('production and public hosts never fall back to a sample/logged code',async()=>{
 const prod=emailDelivery({env:{NODE_ENV:'production',DEV_SAMPLE_LOGIN:'true'}});
 assert.throws(()=>prod.check(true),/not configured/);
 const dev=emailDelivery({env:{EMAIL_PROVIDER:'development',DEV_SAMPLE_LOGIN:'true'}});
 assert.throws(()=>dev.check(false),/not configured/);const result=await dev.send('x','123456',true);assert.equal(result.demoMode,true);assert.equal(JSON.stringify(result).includes('123456'),false);
});
test('SQLite OTP expires, is consumed once, limits attempts, and throttles requests',()=>{
 const email='otp@example.test';let code=auth.createLoginCode(email,600000,false);
 assert.throws(()=>auth.createLoginCode(email),{code:'OTP_COOLDOWN'});
 for(let i=0;i<5;i++)assert.equal(auth.verifyLoginCode(email,'not-code'),false);
 assert.equal(auth.verifyLoginCode(email,code),false);
 auth.discardLoginCode(email,code);
 code=auth.createLoginCode(email,600000,false);
 assert.equal(auth.verifyLoginCode(email,code),true);assert.equal(auth.verifyLoginCode(email,code),false);
 const expired=auth.createLoginCode('expired@example.test',-1,false);
 assert.equal(auth.verifyLoginCode('expired@example.test',expired),false);
});
test('HTTPS OTP login retains Secure HttpOnly SameSite cookies; delivery failure cannot authenticate',async()=>{
 process.env.NODE_ENV='production';process.env.PUBLIC_ORIGIN='https://mb-smart-link-ai.onrender.com';
 delete process.env.EMAIL_PROVIDER;process.env.RESEND_API_KEY='test-key';process.env.RESEND_FROM_EMAIL='login@example.test';
 let deliveredCode,fail=false;
 const s=createServer({emailFetch:async(url,options)=>{
   deliveredCode=JSON.parse(options.body).text.match(/code is: (\d{6})/)[1];
   return {ok:!fail,json:async()=>({id:'mail-test'})};
 }});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+s.address().port;
 const post=(path,body,origin=process.env.PUBLIC_ORIGIN)=>new Promise((resolve,reject)=>{
  const req=require('node:http').request(base+path,{method:'POST',headers:{Host:'mb-smart-link-ai.onrender.com',Origin:origin,'Content-Type':'application/json'}},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(text),headers:{get:key=>[].concat(res.headers[key]||[]).join(';')}}));
  });req.on('error',reject);req.end(JSON.stringify(body));
 });
 try{
  const email='https@example.test';
  assert.equal((await post('/api/auth/request-code',{email},'https://foreign.test')).status,403);
  const sent=await post('/api/auth/request-code',{email});assert.equal(sent.status,200);
  assert.equal(JSON.stringify(await sent.json()).includes(deliveredCode),false);
  assert.equal((await post('/api/auth/request-code',{email})).status,429);
  const verify=await post('/api/auth/verify-code',{email,code:deliveredCode});assert.equal(verify.status,200);
  const cookie=verify.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);
  assert.equal((await post('/api/auth/verify-code',{email,code:deliveredCode})).status,401);
  fail=true;
  const failure=await post('/api/auth/request-code',{email:'failed@example.test'});assert.equal(failure.status,503);
  assert.equal(auth.verifyLoginCode('failed@example.test',deliveredCode),false);
 }finally{await new Promise(r=>s.close(r));delete process.env.PUBLIC_ORIGIN;delete process.env.RESEND_API_KEY;delete process.env.RESEND_FROM_EMAIL;process.env.NODE_ENV='test'}
});


test('Resend transport, malformed response and missing sender fail without leaking details',async()=>{
 const env={NODE_ENV:'production',RESEND_API_KEY:'test-key',RESEND_FROM_EMAIL:'onboarding@resend.dev'};
 for(const fetchImpl of [async()=>{throw Error('private transport details')},async()=>({ok:true,json:async()=>{throw Error('private response')}}),async()=>({ok:true,json:async()=>({})})]){
  await assert.rejects(emailDelivery({env,fetchImpl}).send('recipient@example.test','987654',false),{message:'Could not send the verification email. Please try again shortly.'});
 }
 assert.throws(()=>emailDelivery({env:{NODE_ENV:'production',RESEND_API_KEY:'test-key'}}).check(false),/not configured/);
});
