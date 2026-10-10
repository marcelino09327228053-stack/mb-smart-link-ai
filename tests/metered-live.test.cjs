process.env.MB_AUTH_DB=':memory:';process.env.MB_LIBRARY_DB=':memory:';delete process.env.PGHOST;delete process.env.DATABASE_URL;delete process.env.PUBLIC_ORIGIN;
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter,once}=require('node:events'),{WebSocket}=require('ws');
const auth=require('../server/auth.cjs'),{createServer}=require('../server.cjs');const tick=()=>new Promise(r=>setTimeout(r,40));
async function fixture(pro,fn){
 const user=auth.ensureOtpUser(require('node:crypto').randomUUID()+'@test.invalid');if(pro){const c=await auth.credits.issue('Paid',400,user.id);await auth.credits.redeem(c.code,user.id);}
 const peers=[];const server=createServer({metered:true,apiKey:'test-only',geminiKey:'test-only',liveConnect:()=>{const p=new EventEmitter();Object.assign(p,{readyState:1,bufferedAmount:0,sent:[],send(raw){this.sent.push(JSON.parse(raw));},terminate(){this.terminated=true;}});peers.push(p);setImmediate(()=>p.emit('open'));return p;}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,cookie='mb_session='+auth.createSession(user.id),client=new WebSocket(origin.replace('http','ws')+'/api/live',{origin,headers:{cookie}});const events=[];client.on('message',b=>events.push(JSON.parse(b)));client.on('error',()=>{});await once(client,'open');
 try{await fn({client,peers,events,user,origin,cookie});}finally{client.terminate();await tick();await new Promise(r=>server.close(r));}
}
test('Free forces Gemini despite requested OpenAI, clips at exactly 1000, stops capture, never falls back',()=>fixture(false,async({client,peers,events,user,origin,cookie})=>{
 const r=await fetch(origin+'/api/session',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:'{}'});assert.equal(r.status,403);
 client.send(JSON.stringify({type:'start',settings:{provider:'openai'}}));await tick();assert.ok(peers[0].sent[0].setup);
 peers[0].emit('message',JSON.stringify({setupComplete:{}}));await tick();peers[0].emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'x'.repeat(990)},outputTranscription:{text:'y'.repeat(30)}}}));await tick();
 assert.equal(events.filter(e=>e.delta).reduce((n,e)=>n+e.delta.length,0),1000);assert.ok(events.some(e=>e.type==='error'&&e.message.includes('weekly free limit')));assert.equal((await auth.credits.status(user.id)).freeRemaining,0);assert.ok(peers[0].terminated);assert.equal(peers.length,1);
}));
test('Free provider quota error never uses paid fallback',()=>fixture(false,async({client,peers})=>{client.send(JSON.stringify({type:'start',settings:{provider:'auto'}}));await tick();peers[0].emit('message',JSON.stringify({error:{code:429}}));await tick();assert.equal(peers.length,1);assert.ok(peers[0].terminated);}));
test('Pro forces OpenAI and debits actual usage once, including transcription; exhaustion stops upstream',()=>fixture(true,async({client,peers,events,user})=>{
 client.send(JSON.stringify({type:'start',settings:{provider:'gemini'}}));await tick();const p=peers[0];assert.equal(p.sent[0].type,'session.update');p.emit('message',JSON.stringify({type:'session.updated'}));await tick();
 const done={type:'response.done',response:{id:'paid-response',status:'completed',usage:{input_token_details:{text_tokens:100,audio_tokens:200,cached_tokens:0},output_token_details:{text_tokens:50,audio_tokens:0}}}};
 p.emit('message',JSON.stringify(done));p.emit('message',JSON.stringify(done));p.emit('message',JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:'transcription-one',transcript:'Question',usage:{type:'tokens',input_token_details:{text_tokens:0,audio_tokens:100},output_tokens:20}}));await tick();
 assert.equal((await auth.credits.status(user.id)).balance,239.491375);
 await auth.credits.debit(user.id,'drain-balance',239491374);done.response.id='last-response';p.emit('message',JSON.stringify(done));await tick();assert.equal((await auth.credits.status(user.id)).balance,0);assert.ok(events.some(e=>e.type==='error'&&e.message.includes('Pro credits')));assert.ok(p.sent.some(e=>e.type==='response.cancel'));
}));
