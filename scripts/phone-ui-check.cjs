process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 Android'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>localStorage.setItem('mb_future_knowledge_hubs_v1',JSON.stringify([{id:'cat',name:'Learning',items:[{id:'one',name:'An interesting article',savedAt:'2026-09-30T12:00:00Z',links:[{id:'link',url:'https://example.com/article'}],videos:[],notes:'Original note'}]}])));
  await page.route('**/api/video-title?*',r=>r.fulfill({json:{title:'Example title'}}));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#phoneHome').waitFor();
  assert.equal(await page.locator('.phone-brand').innerText(),'MB Future Link AI');
  const apk=await page.request.get(new URL('/downloads/mb-bubble.apk',page.url()).href);assert.equal(apk.status(),200);assert.equal((await apk.body()).subarray(0,2).toString(),'PK');
  await page.locator('#quickLink').fill('https://example.com/new');await page.locator('#phoneSave').click();await page.waitForFunction(()=>document.querySelector('#quickLinkStatus').textContent==='Link saved.');
  await page.locator('#phoneNav [data-view="category"]').click();assert.match(await page.locator('#hubList').innerText(),/2 library items/);
  await page.locator('#addHubBtn').click();await page.locator('#phoneCategoryName').fill('Cooking');await page.locator('#phoneCategorySheet button[type=submit]').click();assert.match(await page.locator('#hubList').innerText(),/Cooking/);
  await page.locator('#hubList .part-item').filter({hasText:'Learning'}).click();assert.equal(await page.locator('body').getAttribute('data-phone-view'),'library');
  assert.equal(await page.locator('#itemList .phone-preview').count(),2);await page.locator('#itemList .phone-item-actions').first().getByText('Edit / Notes').click();await page.locator('#notesArea').fill('Updated note');await page.locator('#saveChangesBtn').click();
  await page.locator('#phoneNav [data-view="notes"]').click();assert.equal(await page.locator('#notesArea').inputValue(),'Updated note');
  await page.locator('#phoneNav [data-view="home"]').click();await page.locator('#phoneSettings').click();await page.locator('#categoryPasswordGate').waitFor();await page.locator('#cancelCategoryPasswordBtn').click();await page.evaluate(()=>showAuth());await page.locator('#authGate').waitFor();await page.locator('#authCancelBtn').click();
  await page.locator('#phoneAudio').click();await page.locator('#audioPanel').waitFor();await page.locator('#audioBack').click();
  fs.mkdirSync('artifacts/phone',{recursive:true});await page.screenshot({path:'artifacts/phone/home.png',fullPage:true});
  await page.locator('#phoneNav [data-view="library"]').click();await page.screenshot({path:'artifacts/phone/library.png',fullPage:true});
  for(const width of [360,390,600,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width)}
  assert.equal(await page.locator('#phoneNav').isVisible(),false);assert.equal(await page.locator('.sidebar').isVisible(),true);assert.equal(await page.locator('#quickLink').isVisible(),true);
  await page.screenshot({path:'artifacts/phone/desktop.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS phone navigation, category creation/counters, quick save, notes, auth, audio, responsive widths and desktop controls');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
