const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../mobile-listener.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function harness(options={}) {
  const elements={},peers=[],tracks=[],requests=[],events={},timers=new Map();
  const el=id=>elements[id] ||= {value:'',disabled:false,handlers:{},setAttribute(k,v){this[k]=v},addEventListener(k,v){this.handlers[k]=v}};
  el('phoneTopic').value='Panel Beater Job Interview';
  let micRequests=0;
  class Peer {
    constructor(){peers.push(this)}
    addTrack(track){this.track=track}
    createDataChannel(){return this.dc={readyState:'open',sent:[],send(text){this.sent.push(JSON.parse(text))},close(){this.closed=true}}}
    async createOffer(){return {sdp:'v=0\r\ns=phone'}}
    async setLocalDescription(){}
    async setRemoteDescription(){this.connected=true}
    close(){this.closed=true}
  }
  const document={hidden:false,getElementById:el,addEventListener(k,fn){events[k]=fn}};
  const sandbox={document,window:{isSecureContext:!options.insecure,RTCPeerConnection:Peer,addEventListener(k,fn){events[k]=fn}},RTCPeerConnection:Peer,
    navigator:{mediaDevices:{async getUserMedia(){micRequests++;if(options.denied)throw Object.assign(Error(),{name:'NotAllowedError'});
      const track={enabled:true,readyState:'live',stop(){this.readyState='ended'},addEventListener(k,fn){this[k]=fn}};tracks.push(track);
      return options.pending || {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},
    AbortController,matchMedia:()=>({matches:options.mobile!==false}),
    setTimeout:fn=>{const id={};timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),
    fetch:async(url,request)=>{requests.push({url,request});return url==='/api/health'?{ok:true,json:async()=>({configured:true})}:options.fail?{ok:false,json:async()=>({error:'Sign in first.'})}:{ok:true,text:async()=> 'v=0\r\ns=answer'};}};
  vm.runInNewContext(code,sandbox);await tick();
  return {el,peers,tracks,requests,events,timers,document,get micRequests(){return micRequests},
    begin:async()=>{await el('phoneListenToggle').handlers.click();},
    event:event=>peers.at(-1).dc.onmessage({data:JSON.stringify(event)}),pause:()=>sandbox.window.MBPhoneListener.pause()};
}
test('phone uses only microphone and same-origin backend with topic; pause/resume keeps peer and conversation',async()=>{
 const h=await harness();await h.begin();
 assert.equal(h.micRequests,1);assert.equal(h.tracks[0].enabled,false);
 const request=h.requests.find(r=>r.url==='/api/session');
 assert.deepEqual(JSON.parse(request.request.body).settings,{source:'phone',topic:'Panel Beater Job Interview',mode:'text',language:'same'});
 assert.deepEqual(Object.keys(request.request.headers),['Content-Type']);
 h.event({type:'session.created'});assert.equal(h.tracks[0].enabled,true);
 h.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'Tell me '});
 h.event({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:'Tell me about yourself.'});
 h.event({type:'response.created',response:{id:'reply'}});
 assert.equal(h.el('phoneListenStatus').textContent,'Processing');
 h.event({type:'response.output_text.delta',response_id:'reply',delta:'Sample answer'});
 h.event({type:'response.done',response:{status:'completed'}});
 assert.equal(h.el('phoneTranscript').value,'Tell me about yourself.');assert.equal(h.el('phoneAnswer').value,'Sample answer');
 await h.begin();assert.equal(h.el('phoneListenStatus').textContent,'Paused');assert.equal(h.tracks[0].enabled,false);
 assert.equal(h.peers[0].closed,undefined);
 await h.begin();assert.equal(h.tracks[0].enabled,true);assert.equal(h.peers.length,1);assert.equal(h.micRequests,1);
 assert.equal(h.el('phoneAnswer').value,'Sample answer');
 assert.equal(h.requests.filter(r=>r.url==='/api/session').length,1);
});
test('topic updates add context without rebuilding session or producing unsolicited response',async()=>{
 const h=await harness();await h.begin();h.event({type:'session.created'});
 h.el('phoneTopic').value='Welding interview';h.el('phoneTopic').handlers.change();
 const sent=h.peers[0].dc.sent;
 assert.equal(sent.length,1);assert.equal(sent[0].type,'conversation.item.create');
 assert.match(sent[0].item.content[0].text,/Welding interview/);assert.equal(h.peers.length,1);
 h.el('phoneTopic').handlers.change();assert.equal(sent.length,1);
});
test('reset releases tracks and ignores late permission result; denied microphone can retry',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const h=await harness({pending});
 const connecting=h.begin();h.el('phoneListenReset').handlers.click();
 const track={stop(){this.stopped=true}};resolve({getTracks:()=>[track]});await connecting;
 assert.equal(track.stopped,true);assert.equal(h.peers.length,0);
 const denied=await harness({denied:true});await denied.begin();
 assert.match(denied.el('phoneListenDetail').textContent,/permission denied/);assert.equal(denied.el('phoneListenToggle').disabled,false);
});
test('pause on navigation or background; resetting releases resources and clears transcript',async()=>{
 const h=await harness();await h.begin();h.event({type:'session.created'});
 h.event({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:'hello'});
 h.document.hidden=true;h.events.visibilitychange();assert.equal(h.tracks[0].enabled,false);
 await h.begin();h.pause();assert.equal(h.tracks[0].enabled,false);
 h.el('phoneListenReset').handlers.click();assert.equal(h.peers[0].closed,true);assert.equal(h.tracks[0].readyState,'ended');
 assert.equal(h.el('phoneTranscript').value,'');await h.begin();assert.equal(h.peers.length,2);
});
test('backend failure, disconnect and timeout release microphone; desktop cannot start phone capture',async()=>{
 const fail=await harness({fail:true});await fail.begin();assert.match(fail.el('phoneListenDetail').textContent,/Sign in/);assert.equal(fail.tracks[0].readyState,'ended');
 const h=await harness();await h.begin();h.event({type:'session.created'});
 h.peers[0].connectionState='failed';h.peers[0].onconnectionstatechange();assert.equal(h.tracks[0].readyState,'ended');
 const timeout=await harness();await timeout.begin();[...timeout.timers.values()][0]();assert.equal(timeout.tracks[0].readyState,'ended');
 const desktop=await harness({mobile:false});await desktop.begin();assert.equal(desktop.micRequests,0);
 const insecure=await harness({insecure:true});await insecure.begin();assert.equal(insecure.micRequests,0);
});
test('pause during connection never enables audio when session arrives; late topic change is sent',async()=>{
 const h=await harness();await h.begin();h.pause();h.el('phoneTopic').value='Updated';
 h.event({type:'session.created'});assert.equal(h.tracks[0].enabled,false);assert.equal(h.el('phoneListenStatus').textContent,'Paused');
 assert.match(h.peers[0].dc.sent[0].item.content[0].text,/Updated/);
});
