const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {overlayBridge}=require('../server/overlay.cjs');
test('overlay bridge isolates owner, uses no credential environment, reuses one process and cleans up',async()=>{
 let starts=0,child,writes=[];
 const bridge=overlayBridge({platform:'win32',spawnImpl:(exe,args,options)=>{
  starts++;assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.env.RESEND_API_KEY,undefined);assert.equal(options.env.PGPASSWORD,undefined);
  child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',b=>writes.push(JSON.parse(b)));child.kill=()=>child.emit('exit');queueMicrotask(()=>child.stdout.write('{"ready":true}\n'));return child;
 }});
 const owner='test-owner-12345678';
 try{
 assert.equal((await bridge.update({owner,open:['transcript'],transcript:'hello'})).running,true);
 await bridge.update({owner,open:['response'],response:'answer'});assert.equal(starts,1);assert.equal(writes[1].response,'answer');
 await assert.rejects(bridge.update({owner:'different-owner-123456',open:['response']}),/Another browser tab/);
 child.stdout.write('{"command":"stop"}\n');assert.deepEqual((await bridge.update({owner})).commands,['stop']);
 child.stdout.write('{"command":"start","closed":"response"}\n');const next=await bridge.update({owner});assert.deepEqual(next.commands,['start']);assert.deepEqual(next.closed,['response']);
 const res=new EventEmitter();let delivered='';res.writeHead=()=>{};res.write=text=>delivered+=text;res.end=()=>res.emit('close');assert.equal(bridge.subscribe(owner,res),true);
 child.stdout.write('{"command":"stop"}\n');assert.match(delivered,/"command":"stop"/);assert.deepEqual((await bridge.update({owner})).commands,[]);
 await bridge.update({owner,close:true});assert.equal((await bridge.update({owner})).running,false);
 }finally{bridge.stop()}
});
test('overlay rejects unsupported platforms and invalid owners',async()=>{
 await assert.rejects(overlayBridge({platform:'linux'}).update({}),/Windows/);
 await assert.rejects(overlayBridge({platform:'win32'}).update({owner:'bad'}),/Invalid/);
});
