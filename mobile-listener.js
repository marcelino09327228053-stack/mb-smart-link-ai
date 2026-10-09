/* Phone microphone only. The existing desktop listener owns PC audio sources. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const toggle = el('phoneListenToggle'), topic = el('phoneTopic'), behavior = el('phoneBehavior'), language = el('phoneLanguage');
  if (!toggle) return;
  const status = el('phoneListenStatus'), detail = el('phoneListenDetail');
  const transcript = el('phoneTranscript'), answer = el('phoneAnswer');
  const inputs = new Map(), replies = new Map();
  let active = null, configured = false, liveTransport = false;
  const supported = () => window.isSecureContext && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;
  const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
  function controls() {
    toggle.disabled = !configured || !supported() || (!!active && !active.ready);
    toggle.textContent = active ? (active.ready ? active.paused ? 'LISTEN' : 'PAUSE' : 'CONNECTING...') : 'LISTEN';
    toggle.setAttribute('aria-pressed', String(!!active?.ready && !active.paused));
  }
  function state(label, message) { status.textContent = label; if (message !== undefined) detail.textContent = message; controls(); }
  const answerBlocks = new Map();
  function render() {
    transcript.value = [...inputs.values()].filter(Boolean).join('\n\n');
    answer.value = [...replies.values()].filter(Boolean).join('\n\n');
    transcript.scrollTop = transcript.scrollHeight;
    if (answer.append && document.createElement) {
      const savedScroll=answer.scrollTop;let newest=null;
      for(const [id,text] of replies){
        if(!text)continue;
        let block=answerBlocks.get(id);
        if(!block){block=document.createElement('div');block.className='phone-answer-turn';answerBlocks.set(id,block);answer.append(block);newest=block;}
        if(block.textContent!==text)block.textContent=text;
      }
      if(!replies.size){answer.replaceChildren();answerBlocks.clear();answer.scrollTop=0;}
      else if(newest)answer.scrollTop=newest.offsetTop-(answer.firstElementChild?.offsetTop || 0);
      else answer.scrollTop=savedScroll;
    }
  }
  function end(message = 'Conversation cleared. Press LISTEN to start fresh.', label = 'Ready') {
    const s = active; active = null;
    if (s) {
      clearTimeout(s.timeout); s.abort.abort(); stopTracks(s.stream);
      s.live?.close();
      s.dc?.close(); s.pc?.close();
    }
    state(label, message);
  }
  function send(s, event) { if (s === active && s.dc?.readyState === 'open') s.dc.send(JSON.stringify(event)); }
  const liveSettings=()=>({source:'phone',mode:'text',topic:topic.value.trim(),behavior:behavior?.value?.trim()||'',language:language?.value||'same'});
  function syncTopic(s) {
    if(s?.live&&s===active){const next=liveSettings(),signature=JSON.stringify(next);if(signature!==s.liveSignature){s.liveSignature=signature;s.live.update(next);}return;}

    if (!s?.ready || s !== active || s.dc.readyState !== 'open') return;
    const selected = language?.value || 'same';
    const languageRule = selected === 'same' ? 'Reply in the language of the most recent speaker.' : 'Reply in '+selected+'.';
    if(selected !== s.language){send(s,{type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Answer language selection updated: '+languageRule+' This selection overrides language requests in Response Instructions. Answer the question; do not merely translate it.'}]}});s.language=selected;}
    const custom = behavior?.value?.trim() || '';
    if(custom !== s.behavior){
      send(s,{type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'Response instructions updated by the app user. Replace earlier custom response instructions with: '+JSON.stringify(custom || 'Use the default direct first-person answer style, with enough detail to fully answer the question.')+'. Apply to future answers; preserve conversation context. '+languageRule+' The language selector overrides any language in these instructions.'}]}});
      s.behavior=custom;
    }
    const value = topic.value.trim();
    if (value === s.topic) return;
    send(s, {type:'conversation.item.create', item:{type:'message', role:'system', content:[{
      type:'input_text', text:'Topic / Context updated by the app user: '+JSON.stringify(value || 'General conversation')+'. Use this for future suggested answers; retain the existing conversation.'
    }]}});
    s.topic = value;
  }
  function pause() {
    const s = active;
    if (!s) return;
    s.paused = true;
    s.live?.pause();
    s.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
    state('Paused', '');
  }
  function handle(s, event) {
    if (s !== active) return;
    const type = event.type;
    if(type === 'transport.reconnecting'){s.ready=false;s.stream?.getAudioTracks().forEach(t=>t.enabled=false);state('Connecting','Reconnecting audio. Please wait, then repeat any interrupted question.');return;}
    if (type === 'session.created' || type === 'session.updated') {
      s.ready = true; clearTimeout(s.timeout); syncTopic(s);
      s.stream.getAudioTracks().forEach(track => { track.enabled = !s.paused; });
      state(s.paused ? 'Paused' : 'Listening', s.paused ? '' : '');
    } else if (type === 'conversation.item.input_audio_transcription.delta') {
      inputs.set(event.item_id, (inputs.get(event.item_id) || '') + event.delta); render();
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      inputs.set(event.item_id, event.transcript || '[No clear speech]'); render();
    } else if (type === 'conversation.item.input_audio_transcription.failed') {
      inputs.set(event.item_id, '[Transcript unavailable for this turn]'); render();
    } else if (type === 'input_audio_buffer.speech_started') {
      if (!s.paused) state('Listening', 'Hearing the conversation…');
    } else if (type === 'input_audio_buffer.speech_stopped' || type === 'response.created') {
      if (type === 'response.created') { s.responseId = event.response.id; replies.set(s.responseId, ''); }
      if (!s.paused) state('Processing', 'Preparing a suggested answer…');
    } else if (type === 'response.output_text.delta') {
      const id = event.response_id || s.responseId;
      replies.set(id, (replies.get(id) || '') + event.delta); render();
    } else if (type === 'response.output_text.done') {
      replies.set(event.response_id || s.responseId, event.text || ''); render();
    } else if (type === 'response.done') {
      if (event.response?.status === 'failed') { end('AI could not complete the answer. Check the connection or account quota, then retry.', 'Error'); return; }
      state(s.paused ? 'Paused' : 'Listening', s.paused ? 'LISTEN resumes this conversation.' : 'Ready for the next part of the conversation.');
    } else if (type === 'error') {
      end(s.live && event.message ? event.message : 'The AI session reported an error. Press LISTEN to reconnect.', 'Error');
    }
  }
  async function begin() {
    if (active || !configured || !supported() || !matchMedia('(max-width:600px), (max-width:1200px) and (max-height:600px) and (hover:none) and (pointer:coarse)').matches) return;
    const s = {abort:new AbortController(), ready:false, paused:false}; active = s;
    state('Connecting', 'Allow microphone access on this phone.');
    s.timeout = setTimeout(() => { if (active === s) end('Connection timed out. Check your network and try again.', 'Error'); }, 45000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if (active !== s) { stopTracks(stream); return; }
      s.stream = stream;
      const tracks = stream.getAudioTracks();
      if (!tracks.length) throw Error('No microphone audio track is available.');
      tracks.forEach(track => {
        track.enabled = false; // No audio leaves while the secure session is connecting.
        track.addEventListener('ended', () => { if (active === s) end('Microphone disconnected. Press LISTEN to reconnect.', 'Error'); });
      });
      if(liveTransport && window.MBLive){
        const settings=liveSettings();s.liveSignature=JSON.stringify(settings);
        s.live=await window.MBLive.connect({stream,settings,signal:s.abort.signal,onEvent:event=>handle(s,event)});
        if(active!==s){s.live.close();return;}syncTopic(s);if(s.paused)s.live.pause();return;
      }
      s.pc = new RTCPeerConnection();
      tracks.forEach(track => s.pc.addTrack(track, stream));
      s.pc.onconnectionstatechange = () => {
        if (active === s && ['failed','disconnected','closed'].includes(s.pc.connectionState)) end('Connection interrupted. Press LISTEN to start a new session.', 'Disconnected');
      };
      s.dc = s.pc.createDataChannel('phone-ai-events');
      s.dc.onopen = () => syncTopic(s);
      s.dc.onclose = () => { if (active === s) end('Session ended. Press LISTEN to reconnect.', 'Disconnected'); };
      s.dc.onmessage = event => { try { handle(s, JSON.parse(event.data)); } catch { if (active === s) end('Invalid session response. Please reconnect.', 'Error'); } };
      const offer = await s.pc.createOffer(); if (active !== s) return;
      await s.pc.setLocalDescription(offer); if (active !== s) return;
      s.topic = topic.value.trim();
      s.behavior = behavior?.value?.trim() || '';
      s.language = language?.value || 'same';
      const result = await fetch('/api/session', {
        method:'POST', headers:{'Content-Type':'application/json'}, signal:s.abort.signal,
        body:JSON.stringify({sdp:offer.sdp, settings:{source:'phone',topic:s.topic,behavior:s.behavior,mode:'text',language:s.language}})
      });
      if (!result.ok) { const problem = await result.json().catch(() => ({})); throw Error(problem.error || 'Unable to connect. Sign in and try again.'); }
      const sdp = await result.text(); if (active !== s) return;
      await s.pc.setRemoteDescription({type:'answer',sdp});
    } catch (error) {
      if (active === s) end(error.name === 'NotAllowedError' ? 'Microphone permission denied. Allow microphone access in your browser settings, then press LISTEN.' : error.message || 'Unable to start listening.', 'Error');
    }
  }
  toggle.addEventListener('click', () => {
    if (!active) return begin();
    if (!active.ready) return;
    if (!active.paused) return pause();
    syncTopic(active); active.paused = false;active.live?.resume();
    active.stream.getAudioTracks().forEach(track => { track.enabled = true; });
    state('Listening', '');
  });
  topic.addEventListener('change', () => syncTopic(active));
  language?.addEventListener('change', () => syncTopic(active));
  behavior?.addEventListener('change', () => syncTopic(active));
  el('phoneListenReset').addEventListener('click', () => { end(); inputs.clear(); replies.clear(); render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', () => end('Session closed. Press LISTEN to reconnect.'));
  window.MBPhoneListener = {pause};
  controls();
  if (!supported()) state('Unavailable', 'Open this app over HTTPS in a browser that supports microphone access.');
  else fetch('/api/health').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => {
    liveTransport = data.liveTransport === true;
    configured = data.phoneConfigured === true || data.configured === true;
    state(configured ? 'Ready' : 'Unavailable', configured ? '' : 'AI is not configured on the server. Contact the app owner.');
  }).catch(() => state('Offline', 'Could not reach the server. Check your connection and reload.'));
})();
