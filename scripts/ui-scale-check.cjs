process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {createServer}=require('../server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const original=cp.execFileSync('git',['show','HEAD:style.css'],{encoding:'utf8'});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/style.css*',route=>route.fulfill({contentType:'text/css',body:original}));
  await page.goto(url);await page.locator('#hubTitle').waitFor();
  const before=await page.evaluate(()=>({font:parseFloat(getComputedStyle(document.querySelector('#hubTitle')).fontSize),zoom:parseFloat(getComputedStyle(document.body).zoom)||1,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width}));
  await page.unroute('**/style.css*');await page.reload();await page.locator('#hubTitle').waitFor();
  const after=await page.evaluate(()=>({font:parseFloat(getComputedStyle(document.querySelector('#hubTitle')).fontSize),zoom:parseFloat(getComputedStyle(document.body).zoom)||1,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width}));
  assert.ok(Math.abs(after.font/(before.font*before.zoom)-.8)<.02);
  assert.ok(Math.abs(after.sidebar/before.sidebar-.8)<.02);assert.equal(after.zoom,1);
  fs.mkdirSync('artifacts/ui',{recursive:true});
  await page.screenshot({path:'artifacts/ui/desktop.png',fullPage:true});
  const widths=[];
  for(const width of [1280,820,412,360]){
   await page.setViewportSize({width,height:915});
   const dimensions=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert.ok(dimensions.document<=width+1,JSON.stringify(dimensions));
   await page.evaluate(()=>showAuth());await page.locator('#authGate').waitFor();
   const card=await page.locator('#authGate .auth-card').boundingBox();
   assert.ok(card.x>=0&&card.x+card.width<=width+1);
   if(width<=820){const target=await page.locator('#sendCodeBtn').boundingBox();assert.ok(target.height>=44)}
   if(width===412)await page.screenshot({path:'artifacts/ui/mobile-login.png',fullPage:true});
   await page.locator('#authCancelBtn').click();widths.push(width);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',desktopFontRatio:after.font/(before.font*before.zoom),sidebarRatio:after.sidebar/before.sidebar,widths,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
