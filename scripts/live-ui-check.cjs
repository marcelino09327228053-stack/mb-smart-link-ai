process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');const {createServer}=require('../server.cjs');
(async()=>{
 const peers=[];let frames=0;
 const server=createServer({apiKey:'test-only',geminiKey:'test-only',liveConnect:()=>{
  const p=new EventEmitter();Object.assign(p,{readyState:1,bufferedAmount:0,send(raw){const m=JSON.parse(raw);if(m.setup)setImmediate(()=>p.emit('message',JSON.stringify({setupComplete:{}})));if(m.realtimeInput?.audio){frames++;if(!p.answered){p.answered=true;p.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'Test question'},outputTranscription:{text:'Test answer'},turnComplete:true}}));}}},terminate(){p.terminated=true;}});peers.push(p);setImmediate(()=>p.emit('open'));return p;
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const page=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:1,email:'test@example.invalid'}}}));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#phoneNav [data-view="listen"]').click();await page.locator('#phoneListenToggle').click();
  await page.waitForFunction(()=>document.getElementById('phoneAnswer').textContent.includes('Test answer'));
  assert.ok(frames>0);await page.locator('#phoneListenToggle').click();await page.waitForTimeout(200);const paused=frames;await page.waitForTimeout(300);assert.equal(frames,paused);
  await page.locator('#phoneLanguage').selectOption('Tagalog');await page.waitForTimeout(200);assert.ok(peers[0].terminated);assert.equal(peers.length,2);
  await page.locator('#phoneListenToggle').click();await page.waitForTimeout(300);assert.ok(frames>paused);
  await page.locator('#phoneListenReset').click();await page.waitForTimeout(200);assert.ok(peers.every(p=>p.terminated));const stopped=frames;await page.waitForTimeout(200);assert.equal(frames,stopped);assert.deepEqual(errors,[]);
  console.log('PASS actual browser microphone/worklet -> backend; transcript/answer; pause/resume; settings; reset cleanup');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
