const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../audio-listener.js'), 'utf8');

function setup(options = {}) {
  const elements = {}, recognizers = [], timers = new Map();
  let copied, captureOptions, requests = 0;
  const element = id => elements[id] ||= {
    value: '', textContent: '', disabled: false, handlers: {},
    setRangeText(text, from, to) { this.value = this.value.slice(0, from) + text + this.value.slice(to); },
    classList: { remove() {} }, setAttribute() {}, focus() {}, select() { this.selected = true; },
    addEventListener(type, fn) { this.handlers[type] = fn; }
  };
  const track = kind => ({ kind, readyState: 'live', handlers: {},
    getSettings: () => ({ displaySurface: options.surface || 'monitor' }),
    stop() { this.readyState = 'ended'; },
    addEventListener(type, fn) { this.handlers[type] = fn; }
  });
  const audio = track('audio'), video = track('video');
  const stream = { getVideoTracks: () => [video], getTracks: () => [video, ...(options.noAudio ? [] : [audio])],
    getAudioTracks: () => options.noAudio ? [] : [audio] };
  class Recognition {
    constructor() { recognizers.push(this); }
    start(input) { this.input = input; if (options.startFails) throw Error(); this.onstart(); }
    abort() { this.aborted = true; this.onend?.(); }
    results(...phrases) { this.onresult({ results: phrases.map(text => [{ transcript: text }]) }); }
  }
  const context = {
    document: { getElementById: element },
    window: { isSecureContext: true, SpeechRecognition: Recognition, addEventListener() {} },
    location: { protocol: options.protocol || 'http:' },
    navigator: { userAgent: options.ua || 'Chrome/140.0.0.0',
      mediaDevices: { getUserMedia: () => { throw Error('Microphone must never be requested'); }, getDisplayMedia: async constraints => {
        captureOptions = constraints;
        requests++;
        if (options.reject) throw { name: 'NotAllowedError' };
        return options.pending ? options.pending : stream;
      } },
      clipboard: { writeText: async text => { if (options.copyFails) throw Error(); copied = text; } }
    },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(source, context);
  return { elements, audio, video, stream, recognizers, timers,
    click: id => element(id).handlers.click(),
    text: () => element('audioTranscript').value,
    status: () => element('audioStatus').textContent,
    captureOptions: () => captureOptions, copied: () => copied, requests: () => requests };
}

test('uses the shared track; interim revisions do not duplicate; copy, clear, stop', async () => {
  const h = setup();
  await h.click('listenAudioBtn');
  assert.equal(h.recognizers.length, 1);
  const r = h.recognizers[0];
  assert.equal(r.input, h.audio);
  assert.equal(r.lang, 'en-US');
  r.results('Hello'); r.results('Hello world', 'Next');
  assert.equal(h.text(), 'Hello world Next');
  await h.click('audioCopy'); assert.equal(h.copied(), h.text());
  h.click('audioClear');
  r.results('Hello world', 'Next revised'); assert.equal(h.text(), '');
  r.results('Hello world', 'Next revised', 'Fresh speech');
  assert.equal(h.text(), 'Fresh speech');
  h.click('audioStop');
  assert.equal(h.audio.readyState, 'ended'); assert.equal(h.video.readyState, 'ended');
  r.results('Late result'); assert.equal(h.text(), 'Fresh speech');
  assert.equal(h.timers.size, 0);
});

test('restarts recognition with the same shared track, preserving transcript', async () => {
  const h = setup(); await h.click('audioStart');
  h.recognizers[0].results('First session'); h.recognizers[0].onend();
  [...h.timers.values()][0]();
  h.recognizers[1].results('Second session');
  assert.equal(h.recognizers[1].input, h.audio);
  assert.equal(h.text(), 'First session\nSecond session');
});

test('missing audio and cancellation release capture and allow retry', async () => {
  for (const options of [{ noAudio: true }, { reject: true }, { startFails: true }]) {
    const h = setup(options); await h.click('audioStart');
    assert.equal(h.elements.audioStart.disabled, false);
    assert.equal(h.elements.audioStop.disabled, true);
    if (!options.reject) assert.equal(h.video.readyState, 'ended');
  }
});

test('STOP while picker is pending releases a late stream', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const h = setup({ pending });
  const selection = h.click('listenAudioBtn'); h.click('audioStop');
  resolve(h.stream); await selection;
  assert.equal(h.audio.readyState, 'ended');
  assert.equal(h.video.readyState, 'ended');
  assert.equal(h.recognizers.length, 0);
});

test('sharing ended and recognition errors release all resources', async () => {
  for (const externalEnd of [true, false]) {
    const h = setup(); await h.click('audioStart');
    h.recognizers[0].results('Keep this');
    if (externalEnd) h.video.handlers.ended();
    else h.recognizers[0].onerror({ error: 'network' });
    assert.equal(h.text(), 'Keep this');
    assert.equal(h.audio.readyState, 'ended');
    assert.equal(h.recognizers[0].aborted, true);
    assert.equal(h.timers.size, 0);
  }
});

test('unsupported browsers and file URLs never request capture', async () => {
  for (const options of [{ ua: 'Chrome/134.0' }, { ua: 'Chrome/140.0 Android' },
    { ua: 'Safari/605.1' }, { protocol: 'file:' }]) {
    const h = setup(options); await h.click('listenAudioBtn');
    assert.equal(h.requests(), 0); assert.equal(h.elements.audioStart.disabled, true);
    assert.ok(h.status());
  }
});

test('clipboard denial selects transcript for manual copying', async () => {
  const h = setup({ copyFails: true }); await h.click('audioStart');
  h.recognizers[0].results('Copy me'); await h.click('audioCopy');
  assert.equal(h.elements.audioTranscript.selected, true);
  assert.match(h.status(), /Ctrl\+C/);
});


test('START LISTENING immediately requests PC audio and starts without a second click', async () => {
  const h = setup();
  await h.click('audioStart');
  assert.equal(h.requests(), 1);
  assert.equal(h.captureOptions().video.displaySurface, 'monitor');
  assert.equal(h.captureOptions().systemAudio, 'include');
  assert.equal(h.captureOptions().audio.suppressLocalAudioPlayback, false);
  assert.equal(h.recognizers.length, 1);
  assert.equal(h.recognizers[0].input, h.audio);
  h.click('audioStart');
  assert.equal(h.requests(), 1);
  assert.equal(h.recognizers.length, 1);
});


test('rejects tab and window capture instead of silently missing other PC audio', async () => {
  for (const surface of ['browser', 'window']) {
    const h = setup({ surface });
    await h.click('audioStart');
    assert.equal(h.recognizers.length, 0);
    assert.equal(h.audio.readyState, 'ended');
    assert.equal(h.video.readyState, 'ended');
    assert.match(h.status(), /Entire Screen is required/);
  }
});


test('updates only changed partial words without reading earlier finalized results', async () => {
  const h = setup(); await h.click('audioStart');
  const r = h.recognizers[0];
  r.results('Completed sentence.', 'Current');
  const results = [null, [{ transcript: 'Current words' }]];
  Object.defineProperty(results, 0, { get() { throw Error('Old result was reprocessed'); } });
  r.onresult({ resultIndex: 1, results });
  assert.equal(h.text(), 'Completed sentence. Current words');
  r.onresult({ resultIndex: 1, results: [null] });
  assert.equal(h.text(), 'Completed sentence.');
  await h.click('audioCopy');
  assert.equal(h.copied(), 'Completed sentence.');
});
