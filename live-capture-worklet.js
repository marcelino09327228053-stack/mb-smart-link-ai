class MBCapture extends AudioWorkletProcessor {
 constructor(){super();this.sum=0;this.count=0;this.phase=0;this.buffer=new Int16Array(2400);this.at=0;}
 process(inputs){const channel=inputs[0]?.[0];if(channel)for(const sample of channel){this.sum+=sample;this.count++;this.phase+=24000;if(this.phase>=sampleRate){this.phase-=sampleRate;this.buffer[this.at++]=Math.max(-1,Math.min(1,this.sum/this.count))*32767;this.sum=0;this.count=0;if(this.at===this.buffer.length){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Int16Array(2400);this.at=0;}}}return true;}
}
registerProcessor('mb-capture',MBCapture);
