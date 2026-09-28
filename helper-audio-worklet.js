/* Bounded mono PCM jitter buffer. Feeds WebRTC, never the local speakers. */
class WasapiPCM extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { rate, channels } = options.processorOptions;
    this.channels = channels;
    this.ratio = rate / sampleRate;
    this.buffer = new Float32Array(Math.ceil(rate * 0.25));
    this.prebuffer = Math.ceil(rate * 0.04);
    this.readIndex = 0; this.writeIndex = 0; this.count = 0; this.phase = 0; this.playing = false;
    this.port.onmessage = ({ data }) => {
      const pcm = new Int16Array(data);
      for (let i = 0; i + channels <= pcm.length; i += channels) {
        let value = 0;
        for (let c = 0; c < channels; c++) value += pcm[i + c] / (32768 * channels);
        if (this.count === this.buffer.length) {
          this.readIndex = (this.readIndex + 1) % this.buffer.length;
          this.count--; this.phase = 0;
        }
        this.buffer[this.writeIndex] = value;
        this.writeIndex = (this.writeIndex + 1) % this.buffer.length; this.count++;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!this.playing && this.count >= this.prebuffer) this.playing = true;
    for (let i = 0; i < out.length; i++) {
      const consume = Math.floor(this.phase + this.ratio);
      if (!this.playing || this.count < Math.max(2, consume)) {
        out[i] = 0; this.playing = false; this.phase = 0; continue;
      }
      const next = (this.readIndex + 1) % this.buffer.length;
      out[i] = this.buffer[this.readIndex] * (1 - this.phase) + this.buffer[next] * this.phase;
      this.phase += this.ratio;
      this.readIndex = (this.readIndex + consume) % this.buffer.length;
      this.count -= consume; this.phase -= consume;
    }
    return true;
  }
}
registerProcessor('wasapi-pcm', WasapiPCM);
