const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');
const { sessionConfig } = require('../server/session.cjs');

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { await new Promise(resolve => server.close(resolve)); }
}
const request = (base, settings = {}) => ({ method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sdp: 'v=0\r\ns=test', settings }) });

test('topic/language/modes and semantic VAD are configured for intent-aware conversation', () => {
  for (const mode of ['text', 'voice', 'both']) {
    const s = sessionConfig({ topic: 'Human Anatomy', language: 'Tagalog', mode });
    assert.match(s.instructions, /Human Anatomy/); assert.match(s.instructions, /Reply in Tagalog/);
    assert.match(s.instructions, /asks a question, answer it directly/);
    assert.match(s.instructions, /Remember earlier statements/);
    assert.deepEqual(s.output_modalities, [mode === 'text' ? 'text' : 'audio']);
    assert.equal(s.audio.input.turn_detection.type, 'semantic_vad');
  }
  assert.match(sessionConfig({}).instructions, /language of the most recent speaker/);
  assert.throws(() => sessionConfig({ mode: 'invalid' }));
  assert.throws(() => sessionConfig({ topic: 'x'.repeat(201) }));
});
test('key stays server-side; proxy sends SDP and session configuration', async () => {
  await withServer({ apiKey: 'private-test-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    assert.match(options.body.get('sdp'), /^v=0/);
    assert.equal(JSON.parse(options.body.get('session')).type, 'realtime');
    return new Response('v=0\r\ns=answer', { status: 200 });
  } }, async base => {
    const r = await fetch(base + '/api/session', request(base));
    assert.equal(r.status, 200); assert.equal(await r.text(), 'v=0\r\ns=answer');
    assert.equal((await fetch(base + '/api/health').then(r => r.json())).configured, true);
    for (const file of ['.env', 'server.cjs', 'server/session.cjs', '.git/config', 'tests/ai-server.test.cjs'])
      assert.equal((await fetch(base + '/' + file)).status, 404);
  });
});
test('rejects foreign origin, missing key, bad input and unsafe Host', async () => {
  await withServer({ apiKey: '' }, async base => {
    assert.equal((await fetch(base + '/api/session', request(base))).status, 503);
  });
  await withServer({ apiKey: 'test', fetchImpl: () => { throw Error('must not be called'); } }, async base => {
    assert.equal((await fetch(base + '/api/session', request('https://evil.example'))).status, 403);
    assert.equal((await fetch(base + '/api/session', request(base, { language: 'unknown' }))).status, 400);
    const hostStatus = await new Promise((resolve, reject) => {
      require('node:http').get(base + '/api/health', { headers: { Host: 'evil.example' } }, r => {
        r.resume(); resolve(r.statusCode);
      }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
    const bad = request(base); bad.body = JSON.stringify({ sdp: 'x'.repeat(100001) });
    assert.equal((await fetch(base + '/api/session', bad)).status, 413);
  });
});
test('upstream failures are useful but never expose raw secrets', async () => {
  for (const status of [401, 429, 500]) await withServer({ apiKey: 'test', fetchImpl: async () =>
    new Response('SENSITIVE UPSTREAM DETAIL', { status }) }, async base => {
    const r = await fetch(base + '/api/session', request(base));
    assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /SENSITIVE/);
  });
});


test('optional topic and custom behavior are passed into AI instructions', () => {
  const general = sessionConfig({ topic: '', behavior: 'Answer as an interview candidate.' });
  assert.match(general.instructions, /No topic is selected/);
  assert.match(general.instructions, /Answer as an interview candidate/);
  assert.match(general.instructions, /do not wait for the user to supply an answer/);
  assert.match(sessionConfig({ topic: 'Automotive' }).instructions, /main context for answers: "Automotive"/);
  assert.throws(() => sessionConfig({ behavior: 'x'.repeat(20001) }));
  assert.throws(() => sessionConfig({ behavior: {} }));
});

test('phone session uses conversation suggestions while desktop defaults stay unchanged',async()=>{
 const phone=sessionConfig({source:'phone',topic:'Panel Beater Job Interview'});
 assert.match(phone.instructions,/phone microphone/);assert.match(phone.instructions,/not a translation task/);
 assert.doesNotMatch(phone.instructions,/main source is PC playback/);
 assert.match(sessionConfig({}).instructions,/main source is PC playback/);
 assert.throws(()=>sessionConfig({source:'invalid'}));
 await withServer({apiKey:'private-test-key',fetchImpl:async(url,options)=>{
   const config=JSON.parse(options.body.get('session'));assert.match(config.instructions,/phone microphone/);
   assert.match(config.instructions,/Panel Beater Job Interview/);return new Response('v=0\r\ns=phone');
 }},async base=>{
   const result=await fetch(base+'/api/session',request(base,{source:'phone',topic:'Panel Beater Job Interview'}));
   assert.equal(result.status,200);assert.equal(await result.text(),'v=0\r\ns=phone');
   for(const asset of ['mobile-listener.js','pwa.js','sw.js','manifest.webmanifest','icons/mb-192.png','icons/mb-512.png']){
     const r=await fetch(base+'/'+asset);assert.equal(r.status,200);
     assert.doesNotMatch(await r.text(),/private-test-key/);
   }
   const manifest=await fetch(base+'/manifest.webmanifest').then(r=>r.json());
   assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 });
});
