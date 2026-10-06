// Isolated UI smoke check. Requires Playwright via MB_PLAYWRIGHT_MODULE.
process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';
delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {chromium}=require(process.env.MB_PLAYWRIGHT_MODULE || 'playwright');
const {createServer}=require('../server.cjs');const assert=require('node:assert/strict');
(async()=>{
 const server=createServer({apiKey:'ui-test-only',fetchImpl:async()=>{throw Error('No real AI calls in UI smoke')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try {
 const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',permissions:['microphone']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   class MockPeer{
    constructor(){window.testPeers ||= [];window.testPeers.push(this)}
    addTrack(track){this.track=track}
    createDataChannel(){return this.dc={readyState:'open',send(){},close(){}}}
    async createOffer(){return {sdp:'v=0\r\ns=ui'}}
    async setLocalDescription(){}
    async setRemoteDescription(){this.dc.onmessage({data:JSON.stringify({type:'session.created'})})}
    close(){this.closed=true}
   }
   window.RTCPeerConnection=MockPeer;
 });
 await page.route('**/api/session',route=>route.fulfill({status:200,contentType:'application/sdp',body:'v=0\r\ns=mock'}));
 await page.goto(base);await page.locator('body:not(.auth-pending)').waitFor();
 assert.deepEqual(await page.locator('#phoneNav button').allTextContents(),['HOME','CATEGORY','LIBRARY','AI LISTEN']);
 await page.locator('#phoneInstall').waitFor({state:'visible'});
 await page.screenshot({path:'artifacts/mobile-home.png',fullPage:true});
 await page.getByRole('button',{name:'CATEGORY',exact:true}).click();
 await page.locator('#addHubBtn').click();await page.locator('#phoneCategoryName').fill('Mobile smoke category');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 const categoryRow=page.locator('#hubList .library-item-row').filter({hasText:'Mobile smoke category'});
 await categoryRow.locator('summary').click();page.once('dialog',d=>d.accept('Renamed mobile category'));
 await categoryRow.getByRole('button',{name:'Rename',exact:true}).click();
 await page.locator('#hubList .part-item').filter({hasText:'Renamed mobile category'}).click();
 await page.locator('#addItemBtn').click();await page.locator('#notesArea').waitFor({state:'visible'});
 await page.locator('#mainPartName').fill('Mobile note');await page.locator('#notesArea').fill('Notes remain inside Library.');
 await page.locator('#saveChangesBtn').click();await page.locator('#libraryBack').click();
 await page.getByRole('button',{name:'Edit / Notes',exact:true}).click();
 assert.equal(await page.locator('#notesArea').inputValue(),'Notes remain inside Library.');
 await page.screenshot({path:'artifacts/mobile-notes.png',fullPage:true});
 await page.getByRole('button',{name:'CATEGORY',exact:true}).click();
 const renamed=page.locator('#hubList .library-item-row').filter({hasText:'Renamed mobile category'});
 await renamed.locator('summary').click();page.once('dialog',d=>d.accept());
 await renamed.getByRole('button',{name:'Delete',exact:true}).click();assert.equal(await renamed.count(),0);
 await page.locator('#phoneNav [data-view="listen"]').click();
 await page.locator('#phoneTopic').fill('Panel Beater Job Interview');
 await page.locator('#phoneListenToggle').click();await page.getByText('Listening',{exact:true}).waitFor();
 await page.evaluate(()=>{
  const dc=window.testPeers.at(-1).dc;
  for(const e of [{type:'conversation.item.input_audio_transcription.completed',item_id:'1',transcript:'How do you check a repaired panel?'},{type:'response.created',response:{id:'r'}},{type:'response.output_text.done',response_id:'r',text:'Sample: I check the panel alignment, gaps and surface finish against the repair specifications.'},{type:'response.done',response:{status:'completed'}}])dc.onmessage({data:JSON.stringify(e)});
 });
 await page.locator('#phoneListenToggle').click();assert.equal(await page.locator('#phoneListenStatus').textContent(),'Paused');
 assert.equal(await page.evaluate(()=>window.testPeers.at(-1).track.enabled),false);
 await page.locator('#phoneListenToggle').click();assert.equal(await page.evaluate(()=>window.testPeers.length),1);
 await page.screenshot({path:'artifacts/mobile-listen.png',fullPage:true});
 await page.getByRole('button',{name:'HOME',exact:true}).click();assert.equal(await page.evaluate(()=>window.testPeers.at(-1).track.enabled),false);
 await page.locator('#phoneNav [data-view="listen"]').click();await page.locator('#phoneListenReset').click();
 assert.equal(await page.evaluate(()=>window.testPeers.at(-1).track.readyState),'ended');
 for(const width of [360,412,600]){await page.setViewportSize({width,height:915});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`)}
 const desktop=await browser.newPage({viewport:{width:1440,height:1000}});desktop.on('pageerror',e=>errors.push(e.message));await desktop.goto(base);
 await desktop.locator('#listenAudioBtn').click();await desktop.locator('#audioPanel').waitFor({state:'visible'});
 assert.equal(await desktop.locator('#pcSourceMode').isVisible(),true);assert.equal(await desktop.locator('#phoneNav').isVisible(),false);
 await desktop.screenshot({path:'artifacts/desktop-listener.png',fullPage:true});
 assert.equal(await page.evaluate(async()=> (await navigator.serviceWorker.ready).scope),base+'/');
 assert.deepEqual(errors,[]);console.log('PASS: mobile navigation, category creation, Library Notes save/reopen, mocked AI render, real fake-device microphone pause/resume/reset, 360/412/600px widths, desktop controls. No live AI call.');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
