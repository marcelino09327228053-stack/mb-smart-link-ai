process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');const auth=require('../server/auth.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const user=auth.ensureOtpUser('android-test@example.com'),token=auth.createSession(user.id);
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915}});
  await context.addCookies([{name:'mb_session',value:token,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#librarySyncStatus').filter({hasText:'Synced'}).waitFor();
  await page.locator('#hubList summary').click();await page.getByRole('button',{name:'Lock',exact:true}).click();
  await page.locator('#newCategoryPassword').fill('testpass');await page.locator('#confirmCategoryPassword').fill('testpass');
  await page.locator('#saveCategoryPasswordBtn').click();
  await page.locator('#librarySyncStatus').filter({hasText:'MB saves to'}).waitFor();
  const response=await context.request.post(base+'/api/library/capture',{headers:{Origin:base},data:{requestId:'browser-test-123456789',url:'https://example.invalid/test'}});
  assert.equal(response.status(),200);assert.equal((await response.json()).saved,true);
  await page.reload();await page.locator('#librarySyncStatus').filter({hasText:'MB saves to'}).waitFor();
  page.once('dialog',dialog=>dialog.accept('testpass'));
  await page.locator('#hubList summary').click();await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await page.locator('#librarySyncStatus').filter({hasText:'Lock a category'}).waitFor();
  await page.locator('#itemList .part-name').filter({hasText:'example.invalid'}).waitFor();
  await page.locator('#quickLink').fill('https://example.invalid/from-web');await page.locator('#quickLink').press('Enter');
  await page.locator('#librarySyncStatus').filter({hasText:'Synced'}).waitFor();
  const data=await (await context.request.get(base+'/api/library')).json();
  assert.equal(data.library.hubs[0].items.length,2);
  assert.equal(data.library.activeLockedCategoryId,null);
  assert.deepEqual(errors,[]);
  const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
  console.log(JSON.stringify({result:'PASS',width,items:data.library.hubs[0].items.length,errors}));
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
