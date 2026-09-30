process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';process.env.EMAIL_PROVIDER='resend';process.env.RESEND_API_KEY='test-only';process.env.RESEND_FROM_EMAIL='login@example.test';
delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
(async()=>{
 const delivered=new Map(),server=createServer({emailFetch:async(url,options)=>{
  const body=JSON.parse(options.body);delivered.set(body.to[0],body.text.match(/code is: (\d{6})/)[1]);return {ok:true,json:async()=>({id:'test-email'})};
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 async function device(email,guest){
  const context=await browser.newContext({viewport:{width:412,height:915}});
  if(guest)await context.addInitScript(value=>{if(!localStorage.getItem('mb_future_knowledge_hubs_v1'))localStorage.setItem('mb_future_knowledge_hubs_v1',JSON.stringify(value))},guest);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.evaluate(()=>showAuth());await page.locator('#authEmail').fill(email);await page.locator('#sendCodeBtn').click();
  await page.locator('#authStatus').filter({hasText:'Verification email sent'}).waitFor();
  await page.locator('#authCode').fill(delivered.get(email));await page.locator('#verifyCodeBtn').click();
  await page.locator('#librarySyncStatus').filter({hasText:'Synced'}).waitFor();
  return {context,page};
 }
 try{
  const original=[{id:'migration',name:'Panel Beater',items:[{id:'legacy',name:'Existing link',links:[{id:'link',url:'https://example.invalid/original',title:'Original'}],videos:[],notes:'Keep these notes'}]}];
  const a=await device('shared@example.test',original),b=await device('shared@example.test');
  assert.equal(await b.page.locator('#itemList .part-name').textContent(),'Existing link');
  await a.page.locator('#quickLink').fill('https://example.invalid/from-a');await a.page.locator('#quickLink').press('Enter');
  await b.page.waitForFunction(()=>document.querySelectorAll('#itemList .part-name').length===2);
  await a.page.locator('#hubList summary').click();await a.page.getByRole('button',{name:'Lock',exact:true}).click();
  await a.page.locator('#newCategoryPassword').fill('testing');await a.page.locator('#confirmCategoryPassword').fill('testing');await a.page.locator('#saveCategoryPasswordBtn').click();
  await b.page.locator('#librarySyncStatus').filter({hasText:'MB saves to Panel Beater'}).waitFor();
  const payload={requestId:'two-device-capture-12345678',url:'https://example.invalid/from-overlay'};
  for(let n=0;n<2;n++)assert.equal((await b.context.request.post(base+'/api/library/capture',{headers:{Origin:base},data:payload})).status(),200);
  const doc=(await (await a.context.request.get(base+'/api/library')).json()).library;
  assert.equal(doc.hubs[0].items.length,3);assert.equal(doc.hubs[0].items[0].notes,'Keep these notes');
  assert.equal(doc.activeLockedCategoryId,'migration');
  const c=await device('other@example.test');
  const other=(await (await c.context.request.get(base+'/api/library')).json()).library;
  assert.equal(other.hubs.some(h=>h.id==='migration'),false);
  assert.deepEqual(await a.page.evaluate(()=>JSON.parse(localStorage.getItem('mb_future_knowledge_hubs_v1'))),original);
  await a.page.locator('#logoutBtn').click();await a.page.locator('#itemList .part-name').filter({hasText:'Existing link'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: real UI OTP flow with simulated delivery, two-device sync, active lock, replay, isolation, and guest-data preservation.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
