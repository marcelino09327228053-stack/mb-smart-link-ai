const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const {EventEmitter,once}=require('node:events');const {WebSocket}=require('ws');const {attachLive}=require('../server/live.cjs');
const tick=()=>new Promise(r=>setTimeout(r,20));
async function fixture(fn,options={}){
 const peers=[];const server=http.createServer();
 const bridge=attachLive(server,{auth:{getSessionUser:async()=>null},apiKey:'test-private-openai',model:'gpt-realtime',geminiKey:'test-private-gemini',connect:(url,opts)=>{const p=new EventEmitter();Object.assign(p,{url,opts,readyState:1,bufferedAmount:0,sent:[],send(raw){this.sent.push(JSON.parse(raw));},terminate(){this.terminated=true;}});peers.push(p);setImmediate(()=>p.emit('open'));return p;},...options});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const client=new WebSocket(origin.replace('http','ws')+'/api/live',{origin:options.origin||origin});const messages=[];client.on('message',raw=>messages.push(JSON.parse(raw)));client.on('error',()=>{});
 try{await once(client,'open');await fn({client,peers,messages,origin,server});}finally{client.terminate();for(const c of bridge.clients)c.terminate();await tick();await new Promise(r=>server.close(r));}
}
const start={type:'start',settings:{topic:'Panel beating',behavior:'First person',language:'Tagalog'}};
test('Gemini setup protects secrets; PCM and transcription stream live, pause and close stop upstream',async()=>fixture(async({client,peers,messages})=>{
 client.send(JSON.stringify(start));await tick();const p=peers[0];
 assert.equal(p.sent[0].setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs,800);
 assert.match(p.url,/googleapis/);assert.equal(p.opts.headers['x-goog-api-key'],'test-private-gemini');
 assert.match(p.sent[0].setup.systemInstruction.parts[0].text,/Reply in Tagalog/);
 p.emit('message',Buffer.from(JSON.stringify({setupComplete:{}})));await tick();
 client.send(Buffer.alloc(4800));await tick();assert.equal(p.sent.at(-1).realtimeInput.audio.mimeType,'audio/pcm;rate=24000');
 p.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'Question'},outputTranscription:{text:'Sagot'},turnComplete:true}}));await tick();
 assert.ok(messages.some(e=>e.type==='response.output_text.delta'&&e.delta==='Sagot'));
 assert.doesNotMatch(JSON.stringify(messages),/test-private|googleapis|gemini/);
 client.send(JSON.stringify({type:'pause'}));await tick();const count=p.sent.length;client.send(Buffer.alloc(4800));await tick();assert.equal(p.sent.length,count);
 client.close();await tick();assert.ok(p.terminated);
}));
test('quota switches exactly once to OpenAI, retaining context and using backend authorization',async()=>fixture(async({client,peers,messages})=>{
 client.send(JSON.stringify(start));await tick();let p=peers[0];p.emit('message',JSON.stringify({setupComplete:{}}));
 p.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'Earlier question'},outputTranscription:{text:'Earlier answer'},turnComplete:true}}));
 p.emit('message',JSON.stringify({error:{code:429,message:'private detail'}}));await tick();
 assert.equal(peers.length,2);assert.ok(p.terminated);p=peers[1];assert.equal(p.opts.headers.Authorization,'Bearer test-private-openai');
 assert.match(p.sent[0].session.instructions,/Earlier answer/);assert.equal(p.sent[0].session.audio.input.format.rate,24000);
 p.emit('message',JSON.stringify({type:'session.updated'}));await tick();client.send(Buffer.alloc(4800));await tick();assert.equal(p.sent.at(-1).type,'input_audio_buffer.append');
 p.emit('message',JSON.stringify({error:{code:'insufficient_quota'}}));await tick();assert.equal(peers.length,2);assert.ok(messages.some(e=>e.type==='error'));assert.doesNotMatch(JSON.stringify(messages),/private detail|test-private/);
}));
test('invalid settings and configuration failures never silently start fallback',async()=>fixture(async({client,peers,messages})=>{
 client.send(JSON.stringify({...start,settings:{language:'invalid'}}));await tick();assert.equal(peers.length,0);assert.ok(messages.some(e=>e.type==='error'));
}));
test('foreign origin is rejected before any provider connection',async()=>{
 await assert.rejects(()=>fixture(async()=>assert.fail('must not connect'),{origin:'https://evil.invalid'}),/403/);
});
test('settings update replaces connection and pause remains enforced',async()=>fixture(async({client,peers})=>{
 client.send(JSON.stringify(start));await tick();peers[0].emit('message',JSON.stringify({setupComplete:{}}));
 client.send(JSON.stringify({type:'pause'}));client.send(JSON.stringify({type:'settings',settings:{...start.settings,language:'English'}}));await tick();assert.equal(peers.length,2);assert.ok(peers[0].terminated);
 const p=peers[1];assert.match(p.sent[0].setup.systemInstruction.parts[0].text,/Reply in English/);p.emit('message',JSON.stringify({setupComplete:{}}));const n=p.sent.length;
 client.send(Buffer.alloc(4800));await tick();assert.equal(p.sent.length,n);
 client.send(JSON.stringify({type:'resume'}));client.send(Buffer.alloc(4800));await tick();assert.ok(p.sent.length>n);
}));

test('public relay rejects unsigned users before opening a provider socket',async()=>{
 const server=http.createServer();let connected=false;
 attachLive(server,{publicOrigin:new URL('https://app.example'),auth:{getSessionUser:async()=>null},geminiKey:'test-only',connect:()=>{connected=true;}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const c=new WebSocket('ws://127.0.0.1:'+server.address().port+'/api/live',{origin:'https://app.example',headers:{Host:'app.example'}});
 try{await assert.rejects(once(c,'open'),/401/);assert.equal(connected,false);}finally{c.terminate();await new Promise(r=>server.close(r));}
});
test('second connection from same owner is refused',async()=>fixture(async({origin})=>{
 const c=new WebSocket(origin.replace('http','ws')+'/api/live',{origin});await assert.rejects(once(c,'open'),/429/);c.terminate();
}));
test('authentication/configuration error does not become paid fallback',async()=>fixture(async({client,peers,messages})=>{
 client.send(JSON.stringify(start));await tick();peers[0].emit('message',JSON.stringify({error:{code:403,message:'secret upstream details'}}));await tick();assert.equal(peers.length,1);assert.ok(peers[0].terminated);assert.doesNotMatch(JSON.stringify(messages),/secret upstream/);
}));
