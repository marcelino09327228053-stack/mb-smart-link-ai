const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const sourceCode = fs.readFileSync(require('node:path').join(__dirname, '../pc-audio-sources.js'), 'utf8');
const code = fs.readFileSync(require('node:path').join(__dirname, '../ai-listener.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function harness(options = {}) {
  const elements = {}, peers = [], contexts = [], sockets = [], timers = new Map(), windowEvents = {};
  let micRequests = 0, mediaRequests = 0, sessionRequests = 0, copied, sentSettings;
  const storage = options.storage || new Map();
  const el = id => elements[id] ||= { value: '', options: [], appendChild(option) { this.options.push(option); }, checked: false, hidden: false, disabled: false, handlers: {},
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    play: async () => {}, pause() {}, focus() {}, select() {}, scrollHeight: 10 };
  el('aiTopic').value = 'Automotive'; el('aiLanguage').value = 'English'; el('aiMode').value = options.mode || 'text';
  el('pcHelperOn').checked = !!options.helper;
  el('pcSourceMode').value = options.sourceMode || 'auto';
  const track = kind => ({ kind, readyState: 'live', handlers: {}, stop() { this.readyState = 'ended'; },
    addEventListener(name, fn) { this.handlers[name] = fn; } });
  class Stream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  }
  const pcTrack = track('audio'), video = track('video'), micTrack = track('audio');
  const capture = new Stream(options.noAudio ? [video] : [video, pcTrack]);
  class Context {
    constructor() { contexts.push(this); this.audioWorklet = { addModule: async () => {} }; }
    resume = async () => {};
    close = async () => { this.closed = true; };
    createMediaStreamDestination() { return { stream: new Stream([track('audio')]) }; }
    createGain() { return this.gain = { gain: { value: 1 }, connect() {} }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  class Peer {
    constructor() { peers.push(this); }
    addTrack(track) { this.track = track; }
    createDataChannel() { return this.dc = { readyState: 'open', send() {}, close() {} }; }
    createOffer = async () => ({ sdp: 'v=0\r\ns=test' });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => { this.remoteSet = true; };
    close() { this.closed = true; }
  }
  class Socket {
    constructor() { this.readyState = 1; sockets.push(this); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'hello' }) })); }
    send(data) { if (JSON.parse(data).type === 'start') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ type: 'started', format: 's16le', rate: 48000, channels: 2 }) })); }
    close() { this.readyState = 3; this.closed = true; this.onclose?.(); }
  }
  const fakeFetch = async (url, request) => {
    if (url === '/api/helper/status') return { ok: true, json: async () => ({ connected: !!options.helper, url: 'ws://127.0.0.1:5502/audio' }) };
    if (url === '/api/health') return { ok: true, json: async () => ({ configured: options.configured !== false }) };
    sessionRequests++; sentSettings = JSON.parse(request.body).settings;
    if (options.failSession) return { ok: false, json: async () => ({ error: 'Backend rejected connection' }) };
    return { ok: true, text: async () => 'v=0\r\ns=answer' };
  };
  const sandbox = {
    WebSocket: Socket, ArrayBuffer, AudioWorkletNode: class { constructor() { this.port = { postMessage() {} }; } connect() {} disconnect() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { storage.set(key, value); } },
    document: { getElementById: el, createElement: () => ({ value: '' }) }, window: { isSecureContext: true, AudioContext: Context, RTCPeerConnection: Peer, addEventListener(name, fn) { windowEvents[name] = fn; } },
    location: { protocol: 'http:' }, AudioContext: Context, RTCPeerConnection: Peer, MediaStream: Stream, AbortController, AbortSignal,
    navigator: { mediaDevices: {
      getDisplayMedia: async () => { mediaRequests++; return options.pending || capture; },
      getUserMedia: async () => { micRequests++; if (options.denyMic) throw Error(); return new Stream([micTrack]); }
    }, clipboard: { writeText: async text => { copied = text; } } },
    setInterval: () => 1, clearInterval() {}, fetch: fakeFetch, setTimeout: fn => { const key = {}; timers.set(key, fn); return key; }, clearTimeout: key => timers.delete(key)
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(sourceCode, context);
  vm.runInContext(code, context);
  await tick();
  return { storage, windowEvents, sentSettings: () => sentSettings, elements, el, peers, contexts, sockets, pcTrack, micTrack, capture, timers,
    click: id => el(id).handlers.click(),
    event: data => peers[0].dc.onmessage({ data: JSON.stringify(data) }),
    micRequests: () => micRequests, mediaRequests: () => mediaRequests, sessionRequests: () => sessionRequests, copied: () => copied };
}
test('AUTO helper OFF or disconnect hands over to Chrome without duplicating AI sessions', async () => {
  for (const cause of ['off', 'disconnect']) {
    const h = await harness({ helper: true }); await h.click('audioStart');
    h.event({ type: 'session.created' });
    assert.equal(h.mediaRequests(), 0);
    assert.equal(h.el('pcSourceStatus').textContent, 'Audio Source: Windows Helper');
    if (cause === 'off') { h.el('pcHelperOn').checked = false; h.el('pcHelperOn').handlers.change(); }
    else h.sockets[0].onclose();
    await tick();
    assert.equal(h.sockets[0].closed, true);
    assert.equal(h.el('pcSourceStatus').textContent, 'Audio Source: Chrome Capture');
    assert.equal(h.mediaRequests(), 1); assert.equal(h.sessionRequests(), 1);
    assert.equal(h.micRequests(), 0);
    h.click('audioStop');
    assert.ok(h.contexts.every(c => c.closed)); assert.equal(h.peers[0].closed, true);
  }
});

test('forced helper disconnect stops AI without opening Chrome', async () => {
  const h = await harness({ helper: true, sourceMode: 'helper' }); await h.click('audioStart');
  h.event({ type: 'session.created' }); h.sockets[0].onclose(); await tick();
  assert.equal(h.mediaRequests(), 0); assert.equal(h.peers[0].closed, true);
  assert.equal(h.el('pcListenerState').textContent, 'Disconnected');
});

test('streams PC audio over one persistent peer; mic defaults OFF; context survives turns', async () => {
  const h = await harness(); await h.click('audioStart');
  assert.equal(h.micRequests(), 0); assert.equal(h.sessionRequests(), 1);
  h.event({ type: 'session.created' });
  for (const id of ['one', 'two']) {
    h.event({ type: 'input_audio_buffer.committed', item_id: id });
    h.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: 'Question ' + id });
    h.event({ type: 'response.created', response: { id } });
    h.event({ type: 'response.output_text.delta', response_id: id, delta: 'Answer ' + id });
    h.event({ type: 'response.done', response: { status: 'completed', output: [] } });
  }
  assert.match(h.el('audioTranscript').value, /^\[[^\]]+\]\nQuestion one\n\n\[[^\]]+\]\nQuestion two$/);
  assert.match(h.el('aiResponse').value, /^\[[^\]]+\]\nAnswer one\n\n\[[^\]]+\]\nAnswer two$/);
  assert.equal(h.peers.length, 1);
  await h.click('audioCopy'); assert.equal(h.copied(), h.el('audioTranscript').value);
  h.click('audioStop'); assert.equal(h.pcTrack.readyState, 'ended');
  assert.equal(h.peers[0].closed, true); assert.equal(h.contexts[0].closed, true); assert.equal(h.timers.size, 0);
});
test('mic ON explicitly requests permission; OFF releases it; denial keeps PC running', async () => {
  for (const denyMic of [false, true]) {
    const h = await harness({ denyMic }); await h.click('audioStart'); h.event({ type: 'session.created' });
    h.el('aiMic').checked = true; await h.el('aiMic').handlers.change();
    assert.equal(h.micRequests(), 1); assert.equal(h.pcTrack.readyState, 'live');
    if (denyMic) assert.equal(h.el('aiMic').checked, false);
    else { h.el('aiMic').checked = false; await h.el('aiMic').handlers.change(); assert.equal(h.micTrack.readyState, 'ended'); }
    h.click('audioStop');
  }
});
test('voice modes gate input against feedback, and Voice Only hides response text', async () => {
  for (const mode of ['voice', 'both']) {
    const h = await harness({ mode }); await h.click('audioStart'); h.event({ type: 'session.created' });
    h.event({ type: 'response.created', response: { id: 'r' } });
    assert.equal(h.contexts[0].gain.gain.value, 0);
    h.event({ type: 'response.output_audio_transcript.delta', response_id: 'r', delta: 'Hello' });
    if(mode==='voice')assert.equal(h.el('aiResponse').value,'');else assert.match(h.el('aiResponse').value,/^\[[^\]]+\]\nHello$/);
    h.event({ type: 'output_audio_buffer.stopped' });
    [...h.timers.values()].at(-1)();
    assert.equal(h.contexts[0].gain.gain.value, 1);
    h.click('audioStop');
  }
});
test('missing audio/backend failures release capture; missing key disables capture', async () => {
  for (const options of [{ noAudio: true }, { failSession: true }]) {
    const h = await harness(options); await h.click('audioStart');
    assert.ok(h.capture.getTracks().every(t => t.readyState === 'ended'));
    assert.equal(h.el('audioStop').disabled, true);
  }
  const h = await harness({ configured: false }); await h.click('audioStart');
  assert.equal(h.mediaRequests(), 0);
});
test('STOP cancels pending sharing and ignores late media', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const h = await harness({ pending }); const start = h.click('audioStart');
  h.click('audioStop'); resolve(h.capture); await start;
  assert.ok(h.capture.getTracks().every(t => t.readyState === 'ended'));
  assert.equal(h.sessionRequests(), 0);
});

test('sharing ended, network failure and API error release every resource', async () => {
  for (const failure of ['sharing', 'network', 'api']) {
    const h = await harness(); await h.click('audioStart'); h.event({ type: 'session.created' });
    if (failure === 'sharing') h.pcTrack.handlers.ended();
    if (failure === 'network') { h.peers[0].connectionState = 'failed'; h.peers[0].onconnectionstatechange(); }
    if (failure === 'api') h.event({ type: 'error' });
    assert.equal(h.pcTrack.readyState, 'ended'); assert.equal(h.peers[0].closed, true);
    assert.equal(h.contexts[0].closed, true); assert.equal(h.timers.size, 0);
  }
});

test('stopping during a microphone permission prompt discards the late mic stream', async () => {
  const h = await harness(); await h.click('audioStart'); h.event({ type: 'session.created' });
  h.el('aiMic').checked = true;
  const micRequest = h.el('aiMic').handlers.change();
  h.click('audioStop'); await micRequest;
  assert.equal(h.micTrack.readyState, 'ended'); assert.equal(h.el('aiMic').checked, false);
});


test('saves and restores topic, behavior and topic history; blank topic remains general', async () => {
  const h = await harness();
  h.el('aiTopic').value = 'Job interviews';
  h.click('aiInterview'); h.click('aiSaveSettings');
  const restored = await harness({ storage: h.storage });
  assert.equal(restored.el('aiTopic').value, 'Job interviews');
  assert.match(restored.el('aiBehavior').value, /first person/);
  assert.ok(restored.el('aiTopics').options.some(o => o.value === 'Job interviews'));
  await restored.click('audioStart');
  assert.equal(restored.sentSettings().topic, 'Job interviews');
  assert.match(restored.sentSettings().behavior, /not coaching/);
  restored.click('audioStop');
  restored.el('aiTopic').value = ''; restored.click('aiSaveSettings');
  const general = await harness({ storage: h.storage });
  assert.equal(general.el('aiTopic').value, '');
  await general.click('audioStart'); assert.equal(general.sentSettings().topic, '');
  general.click('audioStop');
});


test('AUDIO tab reveals inline panel without starting capture; hiding preserves the session', async () => {
  const h = await harness(); h.el('audioPanel').hidden = true;
  await h.click('listenAudioBtn');
  assert.equal(h.el('audioPanel').hidden, false);
  assert.equal(h.el('listenAudioBtn')['aria-expanded'], 'true');
  assert.equal(h.el('hubDashboard')['data-audio-view'], 'true');
  await h.click('audioBack');
  assert.equal(h.el('hubDashboard')['data-audio-view'], 'false');
  assert.equal(h.el('audioPanel').hidden, true);
  await h.click('listenAudioBtn');
  h.windowEvents.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(h.el('audioPanel').hidden, true);
  assert.equal(h.el('hubDashboard')['data-audio-view'], 'false');
  await h.click('listenAudioBtn');
  assert.equal(h.mediaRequests(), 0); assert.equal(h.sessionRequests(), 0);
  await h.click('audioStart'); h.event({ type: 'session.created' });
  await h.click('listenAudioBtn');
  assert.equal(h.el('audioPanel').hidden, true);
  assert.equal(h.pcTrack.readyState, 'live');
  assert.equal(h.el('listenAudioBtn').textContent, 'AUDIO • LIVE');
  await h.click('listenAudioBtn'); await h.click('audioStop');
  assert.equal(h.pcTrack.readyState, 'ended');
});

 test('behavior remains editable during listening and clearing persists for the next session', async () => {
 const h=await harness();await h.el('audioStart').handlers.click();
 assert.equal(h.el('aiBehavior').disabled,false);assert.equal(h.el('aiSaveSettings').disabled,false);
 h.el('aiBehavior').value='Changed behavior';h.el('aiSaveSettings').handlers.click();
 assert.match(h.el('aiSettingsStatus').textContent,/STOP then START/);
 h.el('aiBehavior').value='';h.el('aiSaveSettings').handlers.click();
 h.el('audioStop').handlers.click();await h.el('audioStart').handlers.click();
 assert.equal(h.sentSettings().behavior,'');
 });

test('timestamps remain stable across transcript and response streaming revisions and clear with text', async()=>{
 const h=await harness();await h.el('audioStart').handlers.click();
 h.event({type:'conversation.item.input_audio_transcription.delta',item_id:'t',delta:'Hello'});
 const stamp=h.el('audioTranscript').value.split('\n')[0];assert.match(stamp,/^\[.+\]$/);
 h.event({type:'conversation.item.input_audio_transcription.completed',item_id:'t',transcript:'Hello world'});
 assert.equal(h.el('audioTranscript').value,stamp+'\nHello world');
 h.event({type:'response.created',response:{id:'r'}});
 h.event({type:'response.output_text.delta',response_id:'r',delta:'Answer'});
 const responseStamp=h.el('aiResponse').value.split('\n')[0];
 h.event({type:'response.output_text.done',response_id:'r',text:'Answer complete'});
 assert.equal(h.el('aiResponse').value,responseStamp+'\nAnswer complete');
 h.el('audioClear').handlers.click();assert.equal(h.el('audioTranscript').value,'');assert.equal(h.el('aiResponse').value,'');
});
