/* Local helper / browser acquisition only. No AI credentials or microphone access. */
(() => {
  class PCAudioSources {
    constructor({ onStatus = () => {}, onLost = () => {} } = {}) {
      this.onStatus = onStatus; this.onLost = onLost;
      this.available = false; this.checked = false; this.url = 'ws://127.0.0.1:5502/audio';
      this.current = null; this.pending = null; this.probing = null;
      this.generation = 0;
    }
    async probe() {
      if (this.probing) return this.probing;
      this.probing = (async () => {
        try {
          const r = await fetch('/api/helper/status', { signal: AbortSignal.timeout(1500) });
          const info = await r.json();
          if (!r.ok || !/^ws:\/\/127\.0\.0\.1:\d+\/audio$/.test(info.url)) throw Error();
          this.url = info.url; this.available = info.connected === true;
        } catch { this.available = false; }
        this.checked = true;
        this.onStatus(this.available ? 'CONNECTED' : 'DISCONNECTED');
        return this.available;
      })();
      try { return await this.probing; } finally { this.probing = null; }
    }
    stop() {
      this.generation++;
      this.pending?.(); this.pending = null;
      this.current?.close(); this.current = null;
    }
    async acquire({ mode, enabled }, signal) {
      const generation = this.generation;
      if (this.current || this.pending || this.chromePending) throw Error('PC audio is already connected or connecting. Close any pending sharing prompt first.');
      if (mode === 'helper' && !enabled) throw Error('Windows Helper is OFF. Turn it ON or choose AUTO.');
      if (mode === 'chrome' || !enabled || (mode === 'auto' && !this.available)) return this.chrome(signal);
      try { return await this.helper(signal); }
      catch (error) {
        if (signal.aborted || generation !== this.generation || mode === 'helper') throw error;
        return this.chrome(signal);
      }
    }
    async chrome(signal) {
      const generation = this.generation;
      if (signal.aborted) throw Error('Cancelled.');
      if (!navigator.mediaDevices?.getDisplayMedia) throw Error('Browser audio capture is unavailable in this browser.');
      if (this.chromePending) throw Error('Close the pending Chrome sharing prompt first.');
      this.chromePending = true;
      // Keep this call before any await so a START click can authorize Chrome's picker.
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor' }, audio: { suppressLocalAudioPlayback: false },
          systemAudio: 'include', selfBrowserSurface: 'exclude'
        });
      } catch (error) {
        if (error.name === 'InvalidStateError') {
          const blocked = Error('Chrome needs a fresh click. Use USE CHROME CAPTURE to share audio.');
          blocked.needsGesture = true; throw blocked;
        }
        throw error;
      } finally { this.chromePending = false; }
      if (signal.aborted || generation !== this.generation || !stream.getAudioTracks().some(t => t.readyState === 'live')) {
        stream.getTracks().forEach(t => t.stop());
        throw Error(signal.aborted || generation !== this.generation ? 'Cancelled.' : 'No audio shared. Enable system/tab audio in the Chrome sharing prompt.');
      }
      let closed = false;
      const handle = { kind: 'chrome', stream, close: () => {
        if (closed) return; closed = true;
        signal.removeEventListener('abort', handle.close);
        stream.getTracks().forEach(t => t.stop());
        if (this.current === handle) this.current = null;
      } };
      signal.addEventListener('abort', handle.close, { once: true });
      stream.getTracks().forEach(t => t.addEventListener('ended', () => {
        if (closed) return;
        handle.close(); this.onLost(handle, Error('Chrome sharing ended.'));
      }, { once: true }));
      this.current = handle; return handle;
    }
    async helper(signal) {
      const context = new AudioContext();
      let ws, node, output, handle, closed = false, settled = false, rejectStart, timeout;
      const cleanup = () => {
        if (closed) return; closed = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'stop' }));
        ws?.close();
        node?.disconnect(); output?.stream.getTracks().forEach(t => t.stop());
        context.close().catch(() => {});
        if (this.pending === abort) this.pending = null;
        if (this.current === handle) this.current = null;
      };
      const fail = error => {
        if (closed) return;
        const wasSettled = settled;
        cleanup(); this.available = false; this.onStatus('DISCONNECTED');
        if (!wasSettled) rejectStart?.(error);
        else this.onLost(handle, error);
      };
      const abort = () => { cleanup(); rejectStart?.(Error('Cancelled.')); };
      this.pending = abort;
      signal.addEventListener('abort', abort, { once: true });
      try {
        await context.resume();
        if (closed || signal.aborted) throw Error('Cancelled.');
        await context.audioWorklet.addModule('/helper-audio-worklet.js');
        if (closed || signal.aborted) throw Error('Cancelled.');
        return await new Promise((resolve, reject) => {
          rejectStart = reject;
          if (signal.aborted) { abort(); return; }
          timeout = setTimeout(() => fail(Error('Windows Helper connection timed out.')), 2500);
          ws = new WebSocket(this.url); ws.binaryType = 'arraybuffer';
          ws.onmessage = ({ data }) => {
            if (closed) return;
            if (data instanceof ArrayBuffer) {
              if (node && data.byteLength <= 262144) node.port.postMessage(data, [data]);
              return;
            }
            try {
              const message = JSON.parse(data);
              if (message.type === 'hello') ws.send(JSON.stringify({ type: 'start' }));
              else if (message.type === 'error') fail(Error(message.message || 'Windows Helper error.'));
              else if (message.type === 'started' && !settled) {
                if (message.format !== 's16le' || !Number.isInteger(message.channels) || message.channels < 1 || message.channels > 32 ||
                    !Number.isInteger(message.rate) || message.rate < 8000 || message.rate > 192000) throw Error();
                output = context.createMediaStreamDestination();
                node = new AudioWorkletNode(context, 'wasapi-pcm', {
                  numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
                  processorOptions: { rate: message.rate, channels: message.channels }
                });
                node.connect(output);
                node.onprocessorerror = () => fail(Error('Windows audio processor stopped.'));
                handle = { kind: 'helper', stream: output.stream, close: cleanup };
                settled = true; clearTimeout(timeout); this.pending = null;
                this.current = handle; this.available = true; this.onStatus('CONNECTED');
                resolve(handle);
              }
            } catch { fail(Error('Invalid audio helper response.')); }
          };
          ws.onerror = () => fail(Error('Windows Helper cannot be reached.'));
          ws.onclose = () => fail(Error('Windows Helper disconnected.'));
        });
      } catch (error) { cleanup(); throw error; }
    }
  }
  if (typeof module !== 'undefined') module.exports = { PCAudioSources };
  else window.PCAudioSources = PCAudioSources;
})();
