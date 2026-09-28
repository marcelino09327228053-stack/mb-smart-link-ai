const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../pc-audio-sources.js'), 'utf8');
const worklet = fs.readFileSync(path.join(__dirname, '../helper-audio-worklet.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  let chromeRequests = 0, losses = 0;
  const sockets = [], contexts = [], statuses = [];
  const makeStream = () => {
    const track = { readyState: 'live', stop() { this.readyState = 'ended'; }, addEventListener() {} };
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  const chromeStream = makeStream();
  class Context {
    constructor() { contexts.push(this); this.audioWorklet = { addModule: async () => {} }; }
    resume = async () => {};
    close = async () => { this.closed = true; };
    createMediaStreamDestination() { return this.output = { stream: makeStream() }; }
  }
  class Socket {
    constructor() {
      this.readyState = 1; this.sent = []; sockets.push(this);
      queueMicrotask(() => {
        if (options.failHelper) this.onerror?.();
        else if (!options.pendingHelper) this.onmessage?.({ data: JSON.stringify({ type: 'hello' }) });
      });
    }
    send(text) {
      this.sent.push(JSON.parse(text));
      if (JSON.parse(text).type === 'start') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({
        type: 'started', format: 's16le', rate: 48000, channels: 2
      }) }));
    }
    close() { this.readyState = 3; this.closed = true; this.onclose?.(); }
  }
  class Node {
    constructor() { this.port = { postMessage() {} }; }
    connect() {} disconnect() {}
  }
  const context = vm.createContext({ module: { exports: {} }, AudioContext: Context, AudioWorkletNode: Node,
    WebSocket: Socket, AbortSignal, ArrayBuffer, setTimeout, clearTimeout,
    navigator: { mediaDevices: { getDisplayMedia: async () => {
      chromeRequests++;
      if (options.gestureBlocked) { const error = Error(); error.name = 'InvalidStateError'; throw error; }
      return options.pendingChrome || chromeStream;
    } } },
    fetch: async () => ({ ok: true, json: async () => ({ connected: !options.offline, url: 'ws://127.0.0.1:5502/audio' }) })
  });
  vm.runInContext(source, context);
  const manager = new context.module.exports.PCAudioSources({ onStatus: s => statuses.push(s), onLost: () => losses++ });
  return { manager, sockets, contexts, statuses, chromeStream, chromeRequests: () => chromeRequests, losses: () => losses };
}
test('AUTO helper ON uses one socket and closes all resources on STOP', async () => {
  const h = harness(); await h.manager.probe();
  const signal = new AbortController();
  const source = await h.manager.acquire({ mode: 'auto', enabled: true }, signal.signal);
  assert.equal(source.kind, 'helper'); assert.equal(h.chromeRequests(), 0);
  await assert.rejects(h.manager.acquire({ mode: 'helper', enabled: true }, signal.signal), /already/);
  h.manager.stop();
  assert.equal(h.sockets.length, 1); assert.equal(h.sockets[0].closed, true);
  assert.equal(h.sockets[0].sent.at(-1).type, 'stop');
  assert.equal(h.contexts[0].closed, true); assert.equal(source.stream.getTracks()[0].readyState, 'ended');
  assert.equal(h.losses(), 0);
});
test('AUTO OFF/unavailable and CHROME CAPTURE bypass the helper', async () => {
  for (const config of [{ mode: 'auto', enabled: false }, { mode: 'chrome', enabled: true }, { mode: 'auto', enabled: true }]) {
    const h = harness({ offline: true }); await h.manager.probe();
    const source = await h.manager.acquire(config, new AbortController().signal);
    assert.equal(source.kind, 'chrome'); assert.equal(h.chromeRequests(), 1); assert.equal(h.sockets.length, 0);
    h.manager.stop(); assert.equal(h.chromeStream.getTracks()[0].readyState, 'ended');
  }
});
test('failed AUTO helper falls back; forced helper never opens Chrome', async () => {
  for (const mode of ['auto', 'helper']) {
    const h = harness({ failHelper: true }); await h.manager.probe();
    const promise = h.manager.acquire({ mode, enabled: true }, new AbortController().signal);
    if (mode === 'auto') assert.equal((await promise).kind, 'chrome');
    else await assert.rejects(promise, /cannot be reached/);
    assert.equal(h.chromeRequests(), mode === 'auto' ? 1 : 0);
    h.manager.stop();
  }
});
test('forced helper OFF gives a clear error without capture', async () => {
  const h = harness();
  await assert.rejects(h.manager.acquire({ mode: 'helper', enabled: false }, new AbortController().signal), /OFF/);
  assert.equal(h.chromeRequests(), 0); assert.equal(h.sockets.length, 0);
});
test('disconnect notifies once; reconnect creates exactly one replacement socket', async () => {
  const h = harness(); await h.manager.probe();
  await h.manager.acquire({ mode: 'helper', enabled: true }, new AbortController().signal);
  h.sockets[0].onclose(); h.sockets[0].onerror();
  assert.equal(h.losses(), 1); assert.equal(h.contexts[0].closed, true);
  await h.manager.probe(); await h.manager.acquire({ mode: 'helper', enabled: true }, new AbortController().signal);
  assert.equal(h.sockets.length, 2); h.manager.stop();
});
test('STOP/browser refresh cancels a pending helper handshake', async () => {
  const h = harness({ pendingHelper: true }); const abort = new AbortController();
  const request = h.manager.acquire({ mode: 'helper', enabled: true }, abort.signal);
  await tick(); abort.abort(); await assert.rejects(request, /Cancelled/);
  assert.equal(h.sockets[0].closed, true); assert.equal(h.contexts[0].closed, true);
});
test('automatic Chrome fallback reports fresh user gesture requirement', async () => {
  const h = harness({ failHelper: true, gestureBlocked: true }); await h.manager.probe();
  await assert.rejects(h.manager.acquire({ mode: 'auto', enabled: true }, new AbortController().signal), e => e.needsGesture === true);
});

test('STOP cancels AUTO handshake without opening a fallback picker', async () => {
  const h = harness({ pendingHelper: true }); await h.manager.probe();
  const request = h.manager.acquire({ mode: 'auto', enabled: true }, new AbortController().signal);
  await tick(); h.manager.stop(); await assert.rejects(request, /Cancelled/);
  assert.equal(h.chromeRequests(), 0); assert.equal(h.sockets[0].closed, true);
});
test('late Chrome selection after STOP is released; duplicate picker is rejected', async () => {
  let resolve; const pendingChrome = new Promise(r => { resolve = r; });
  const h = harness({ pendingChrome }); const abort = new AbortController();
  const request = h.manager.acquire({ mode: 'chrome', enabled: false }, abort.signal);
  await assert.rejects(h.manager.acquire({ mode: 'chrome', enabled: false }, abort.signal), /already/);
  abort.abort(); resolve(h.chromeStream); await assert.rejects(request, /Cancelled/);
  assert.equal(h.chromeStream.getTracks()[0].readyState, 'ended');
});
test('worklet downmixes PCM, resamples, limits backlog and emits silence on starvation', () => {
  let Processor;
  const context = { sampleRate: 24000, AudioWorkletProcessor: class { constructor() { this.port = {}; } },
    registerProcessor: (name, klass) => { Processor = klass; }, Float32Array, Int16Array, Math };
  vm.runInNewContext(worklet, context);
  const p = new Processor({ processorOptions: { rate: 48000, channels: 2 } });
  const pcm = new Int16Array(48000); pcm.fill(16384);
  p.port.onmessage({ data: pcm.buffer });
  assert.equal(p.count, 12000); // 250 ms bounded queue
  const out = new Float32Array(128); p.process([], [[out]]);
  assert.equal(out[0], 0.5); assert.equal(p.count, 12000 - 256);
  for (let i = 0; i < 100; i++) p.process([], [[out]]);
  assert.ok(out.every(x => x === 0));
});
