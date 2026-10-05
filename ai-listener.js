/* Independent realtime listener. No Hub data or API credentials are read here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const start = $('audioStart'), stop = $('audioStop'), launch = $('listenAudioBtn');
  const status = $('audioStatus'), pcStatus = $('pcAudioStatus'), mic = $('aiMic');
  const topic = $('aiTopic'), language = $('aiLanguage'), mode = $('aiMode');
  const transcript = $('audioTranscript'), response = $('aiResponse');
  const playback = $('aiPlayback'), resumeVoice = $('aiResumeVoice');
  const behavior = $('aiBehavior'), saveSettings = $('aiSaveSettings'), interview = $('aiInterview');
  const settingsStatus = $('aiSettingsStatus');
  const sourceMode = $('pcSourceMode'), helperOn = $('pcHelperOn'), helperStatus = $('pcHelperStatus');
  const sourceStatus = $('pcSourceStatus'), listenerState = $('pcListenerState'), chromeFallback = $('pcChromeFallback');
  const sources = new window.PCAudioSources({
    onStatus: state => { helperStatus.textContent = helperOn.checked ? state : 'OFF'; controls(); },
    onLost: (source, error) => {
      const s = active;
      if (!s || s.source !== source) return;
      if (source.kind === 'helper' && s.sourceMode === 'auto' && s.master) recoverChrome(s);
      else if (source.kind === 'helper' && s.sourceMode === 'auto') { end('Helper disconnected while connecting. Use Chrome Capture to continue.', 'Disconnected'); chromeFallback.hidden = false; }
      else end(error.message, 'Disconnected');
    }
  });
  const sourceSettingsKey = 'mb_knowledge_pc_source_v1';
  try {
    const savedSource = JSON.parse(localStorage.getItem(sourceSettingsKey) || 'null');
    if (savedSource) {
      helperOn.checked = savedSource.enabled !== false;
      if (['auto', 'helper', 'chrome'].includes(savedSource.mode)) sourceMode.value = savedSource.mode;
    }
  } catch {}
  const settingsKey = 'mb_knowledge_ai_preferences_v1';
  let savedTopics = [];
  const inputs = new Map(), replies = new Map();
  const inputTimes = new Map(), replyTimes = new Map();
  let active = null, serial = 0, configured = false;

  function supported() {
    return window.isSecureContext && location.protocol !== 'file:' &&
      !!window.RTCPeerConnection && !!window.AudioContext;
  }
  function controls() {
    const unavailable = !configured || !supported() || (helperOn.checked && sourceMode.value !== 'chrome' && !sources.checked);
    start.disabled = !!active || unavailable;
    launch.disabled = false;
    start.textContent = active ? (active.ready ? 'LISTENING' : 'CONNECTING') : 'START LISTENING';
    launch.textContent = active ? 'AUDIO • LIVE' : 'AUDIO';
    sourceMode.disabled = !!active;
    start.setAttribute('aria-pressed', String(!!active));
    stop.disabled = !active;
    topic.disabled = language.disabled = mode.disabled = !!active;
    behavior.disabled = saveSettings.disabled = interview.disabled = false;
    mic.disabled = !active?.ready || !!active?.micPending;
    $('aiMicState').textContent = mic.checked ? 'ON' : 'OFF';
    $('audioCopy').disabled = !transcript.value;
  }
  function timedText(entries, times) {
    return [...entries].filter(([, text]) => text).map(([id, text]) => {
      if (!times.has(id)) times.set(id, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      return '[' + times.get(id) + ']\n' + text;
    }).join('\n\n');
  }
  function render() {
    transcript.value = timedText(inputs, inputTimes);
    response.value = mode.value === 'voice' ? '' : timedText(replies, replyTimes);
    transcript.scrollTop = transcript.scrollHeight;
    response.scrollTop = response.scrollHeight;
    $('audioCopy').disabled = !transcript.value;
  }
  const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
  function end(message = 'Stopped. START LISTENING begins a new conversation.', state = 'Stopped') {
    const s = active;
    active = null; serial++;
    if (s) {
      clearTimeout(s.timeout); clearTimeout(s.feedbackTimer); clearTimeout(s.ungateTimer); clearTimeout(s.switchTimeout);
      s.abort.abort();
      s.source?.close();
      sources.stop();
      s.dc?.close(); s.pc?.close();
      stopTracks(s.capture); stopTracks(s.micStream); stopTracks(s.output?.stream);
      s.context?.close().catch(() => {});
    }
    playback.pause(); playback.srcObject = null;
    resumeVoice.hidden = true;
    mic.checked = false;
    pcStatus.textContent = 'PC AUDIO: OFF';
    sourceStatus.textContent = 'Audio Source: None';
    listenerState.textContent = state;
    chromeFallback.hidden = true;
    status.textContent = message;
    controls();
  }
  function gate(s, value) {
    if (s !== active) return;
    s.gated = value;
    if (s.master) s.master.gain.value = value || s.switching || !s.ready ? 0 : 1;
    pcStatus.textContent = value ? 'PC AUDIO: PAUSED DURING AI VOICE' : 'PC AUDIO: LIVE';
    clearTimeout(s.feedbackTimer);
    if (value) s.feedbackTimer = setTimeout(() => {
      if (s === active) end('Voice playback did not finish. Stopped to prevent audio feedback.');
    }, 60000);
  }
  function send(s, event) { if (s.dc?.readyState === 'open') s.dc.send(JSON.stringify(event)); }
  function handle(s, event) {
    if (s !== active) return;
    const type = event.type;
    if (type === 'session.created' || type === 'session.updated') {
      s.ready = true; clearTimeout(s.timeout);
      s.master.gain.value = s.switching || s.gated ? 0 : 1;
      if (s.switching) { controls(); return; }
      pcStatus.textContent = 'PC AUDIO: LIVE';
      listenerState.textContent = 'Listening';
      status.textContent = 'Listening. AI responds when the speaker finishes a thought.';
      controls();
    } else if (type === 'input_audio_buffer.speech_started') {
      status.textContent = 'Speaker is talking…';
    } else if (type === 'input_audio_buffer.speech_stopped') {
      status.textContent = 'Thought ended. AI is preparing a response…';
    } else if (type === 'input_audio_buffer.committed') {
      if (!inputs.has(event.item_id)) inputs.set(event.item_id, '');
    } else if (type === 'conversation.item.input_audio_transcription.delta') {
      inputs.set(event.item_id, (inputs.get(event.item_id) || '') + event.delta); render();
    } else if (type === 'conversation.item.input_audio_transcription.completed') {
      inputs.set(event.item_id, event.transcript || '[No clear speech]'); render();
    } else if (type === 'conversation.item.input_audio_transcription.failed') {
      inputs.set(event.item_id, '[Transcript unavailable for this turn]'); render();
    } else if (type === 'response.created') {
      s.responseId = event.response.id;
      replies.set(s.responseId, '');
      if (s.mode !== 'text') gate(s, true);
      status.textContent = 'AI is responding…';
    } else if (type === 'response.output_text.delta' || type === 'response.output_audio_transcript.delta') {
      const id = event.response_id || s.responseId;
      replies.set(id, (replies.get(id) || '') + event.delta); render();
    } else if (type === 'response.output_text.done' || type === 'response.output_audio_transcript.done') {
      replies.set(event.response_id || s.responseId, event.text ?? event.transcript ?? ''); render();
    } else if (type === 'output_audio_buffer.started') {
      clearTimeout(s.ungateTimer); gate(s, true);
      status.textContent = 'AI voice playing. Incoming audio pauses to prevent feedback.';
    } else if (type === 'output_audio_buffer.stopped' || type === 'output_audio_buffer.cleared') {
      clearTimeout(s.ungateTimer);
      s.ungateTimer = setTimeout(() => {
        if (s !== active) return;
        send(s, { type: 'input_audio_buffer.clear' });
        gate(s, false); status.textContent = 'Listening for the next thought…';
      }, 350);
    } else if (type === 'response.done') {
      const result = event.response;
      if (result.status === 'failed') { end('AI response failed. Check API quota/model access and start again.'); return; }
      const hasAudio = result.output?.some(item => item.content?.some(part => part.type === 'audio'));
      if (s.mode === 'text' || !hasAudio) {
        gate(s, false); status.textContent = 'Listening for the next thought…';
      }
    } else if (type === 'error') {
      end('The realtime service reported an error. Check your API quota/model access and start again.');
    }
  }
  async function setMic() {
    const s = active;
    if (!s?.ready) { mic.checked = false; return; }
    if (!mic.checked) {
      s.micNode?.disconnect(); stopTracks(s.micStream); s.micStream = null;
      status.textContent = 'Microphone OFF. PC audio remains the source.';
      controls();
      return;
    }
    s.micPending = true; controls();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (s !== active || !mic.checked) { stopTracks(stream); return; }
      s.micStream = stream;
      s.micNode = s.context.createMediaStreamSource(stream);
      s.micNode.connect(s.master);
      stream.getAudioTracks()[0].addEventListener('ended', () => {
        if (s === active) { mic.checked = false; s.micNode.disconnect(); stopTracks(s.micStream); s.micStream = null; controls(); }
      });
      status.textContent = 'Microphone ON alongside PC audio.';
    } catch { if (s === active) { mic.checked = false; status.textContent = 'Microphone unavailable or denied. PC audio continues.'; } }
    finally { s.micPending = false; if (s === active) controls(); }
  }
  function attachSource(s, source) {
    if (s !== active) { source.close(); return; }
    s.pcNode?.disconnect();
    s.source = source; s.capture = source.stream;
    s.pcNode = s.context.createMediaStreamSource(new MediaStream(source.stream.getAudioTracks()));
    s.pcNode.connect(s.master);
    sourceStatus.textContent = 'Audio Source: ' + (source.kind === 'helper' ? 'Windows Helper' : 'Chrome Capture');
  }
  async function recoverChrome(s) {
    if (s !== active || s.switching) return;
    s.switching = true;
    s.source?.close(); s.pcNode?.disconnect();
    if (s.master) s.master.gain.value = 0;
    listenerState.textContent = 'Connecting';
    status.textContent = 'Helper unavailable. Switching to Chrome Capture…';
    s.switchTimeout = setTimeout(() => {
      if (s === active) { end('Chrome fallback timed out. Use Chrome Capture to start again.', 'Disconnected'); chromeFallback.hidden = false; }
    }, 45000);
    try {
      const source = await sources.chrome(s.abort.signal);
      if (s !== active) { source.close(); return; }
      attachSource(s, source);
      s.master.gain.value = s.ready && !s.gated ? 1 : 0;
      listenerState.textContent = s.ready ? 'Listening' : 'Connecting';
      status.textContent = 'Chrome audio connected. Your AI conversation continues.';
    } catch (error) {
      if (s !== active) return;
      end(error.needsGesture ? error.message : 'Chrome fallback could not start. Click USE CHROME CAPTURE to try again.', 'Disconnected');
      chromeFallback.hidden = false;
    } finally { clearTimeout(s.switchTimeout); s.switching = false; }
  }
  async function begin(override) {
    if (active || !configured || !supported()) return;
    const s = { id: ++serial, abort: new AbortController(), mode: mode.value, sourceMode: override || sourceMode.value || 'auto', ready: false };
    active = s; mic.checked = false; controls();
    chromeFallback.hidden = true;
    status.textContent = 'Connecting PC audio…';
    listenerState.textContent = 'Connecting';
    pcStatus.textContent = 'PC AUDIO: SELECTING';
    try {
      const source = await sources.acquire({ mode: s.sourceMode, enabled: helperOn.checked }, s.abort.signal);
      if (s !== active) { source.close(); return; }
      s.source = source; s.capture = source.stream;
      inputs.clear(); replies.clear(); inputTimes.clear(); replyTimes.clear(); render();
      s.context = new AudioContext();
      await s.context.resume();
      if (s !== active) return;
      s.output = s.context.createMediaStreamDestination();
      s.master = s.context.createGain(); s.master.gain.value = 0;
      s.master.connect(s.output);
      attachSource(s, source);
      s.pc = new RTCPeerConnection();
      s.pc.addTrack(s.output.stream.getAudioTracks()[0], s.output.stream);
      s.pc.ontrack = ({ streams }) => {
        if (s !== active) return;
        playback.srcObject = streams[0];
        if (s.mode !== 'text') playback.play().catch(() => {
          if (s === active) { resumeVoice.hidden = false; status.textContent = 'Click ENABLE AI VOICE to allow playback.'; }
        });
      };
      s.pc.onconnectionstatechange = () => {
        if (s === active && ['failed', 'disconnected', 'closed'].includes(s.pc.connectionState))
          end('Realtime connection interrupted. Start again to reconnect.');
      };
      s.dc = s.pc.createDataChannel('oai-events');
      s.dc.onmessage = ({ data }) => { try { handle(s, JSON.parse(data)); } catch { if (s === active) end('Invalid realtime event. Please restart the listener.'); } };
      s.dc.onclose = () => { if (s === active) end('Realtime session closed. Start again to reconnect.'); };
      s.dc.onerror = () => { if (s === active) end('Realtime data connection failed.'); };
      status.textContent = 'Connecting to AI…';
      s.timeout = setTimeout(() => { if (s === active) end('AI connection timed out. Check the backend and internet connection.'); }, 40000);
      const offer = await s.pc.createOffer();
      if (s !== active) return;
      await s.pc.setLocalDescription(offer);
      if (s !== active) return;
      const answer = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: s.abort.signal,
        body: JSON.stringify({ sdp: offer.sdp, settings: { topic: topic.value.trim(), behavior: behavior.value.trim(), language: language.value, mode: s.mode } })
      });
      if (!answer.ok) {
        const problem = await answer.json().catch(() => ({}));
        throw Error(problem.error || 'Local AI backend unavailable. Run START AI LISTENER.bat.');
      }
      const sdp = await answer.text();
      if (s !== active) return;
      await s.pc.setRemoteDescription({ type: 'answer', sdp });
    } catch (error) {
      if (s === active) {
        end(error.name === 'NotAllowedError' ? 'Sharing cancelled or denied. No microphone was opened.' : error.message || 'Could not start AI listener.', 'Error');
        if (error.needsGesture && s.sourceMode === 'auto') chromeFallback.hidden = false;
      }
    }
  }
  function addSavedTopics() {
    const list = $('aiTopics');
    const existing = new Set(Array.from(list.options, option => option.value));
    for (const name of savedTopics) {
      if (existing.has(name)) continue;
      const option = document.createElement('option'); option.value = name;
      list.appendChild(option); existing.add(name);
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || 'null');
    if (saved && typeof saved.topic === 'string' && saved.topic.length <= 200 &&
        typeof saved.behavior === 'string' && saved.behavior.length <= 20000) {
      topic.value = saved.topic; behavior.value = saved.behavior;
      if (['same', 'English', 'Tagalog'].includes(saved.language)) language.value = saved.language;
      if (['text', 'voice', 'both'].includes(saved.mode)) mode.value = saved.mode;
      savedTopics = Array.isArray(saved.topics) ? saved.topics.filter(t => typeof t === 'string' && t.length <= 200 && t.trim()).slice(-30) : [];
      addSavedTopics();
      settingsStatus.textContent = saved.topic ? 'Saved topic and behavior loaded.' : 'Saved general-answer settings loaded.';
    }
  } catch { settingsStatus.textContent = 'Saved settings could not be loaded. You can still choose settings for this session.'; }
  saveSettings.addEventListener('click', () => {
    const currentTopic = topic.value.trim();
    const topics = currentTopic ? [...savedTopics.filter(t => t !== currentTopic), currentTopic].slice(-30) : savedTopics;
    try {
      localStorage.setItem(settingsKey, JSON.stringify({ topic: currentTopic, behavior: behavior.value.trim(),
        language: language.value, mode: mode.value, topics }));
      savedTopics = topics; addSavedTopics();
      settingsStatus.textContent = active ? 'Saved. STOP then START LISTENING to apply the updated behavior.' : (currentTopic ? 'Saved. AI will use this topic and behavior when you start listening.' : 'Saved. No topic restriction; AI will answer generally using your behavior instructions.');
    } catch { settingsStatus.textContent = 'Could not save in this browser. Current settings still apply to your next listening session.'; }
  });
  const markUnsaved = () => { settingsStatus.textContent = active ? 'Unsaved changes. SAVE, then STOP and START LISTENING to apply them.' : 'Unsaved changes. SAVE to remember them; current settings apply when you start listening.'; };
  for (const field of [topic, behavior, language, mode]) field.addEventListener('input', markUnsaved);
  interview.addEventListener('click', () => {
    behavior.value = 'Answer directly in first person as the interview candidate. Give a concise, natural answer to the question, not coaching or an explanation of how to answer. Do not ask me to answer first. Use only personal details I have provided; otherwise clearly frame it as a sample answer.';
    markUnsaved();
  });
  function saveSourceSettings() {
    try { localStorage.setItem(sourceSettingsKey, JSON.stringify({ mode: sourceMode.value, enabled: helperOn.checked })); } catch {}
  }
  helperOn.addEventListener('change', () => {
    saveSourceSettings();
    helperStatus.textContent = helperOn.checked ? (sources.available ? 'CONNECTED' : 'DISCONNECTED') : 'OFF';
    const s = active;
    if (!helperOn.checked && s && (s.source?.kind === 'helper' || (!s.source && s.sourceMode !== 'chrome'))) {
      if (s.sourceMode === 'helper') end('Windows Helper is OFF. Choose AUTO or CHROME CAPTURE to use browser audio.', 'Stopped');
      else if (s.source && s.context) recoverChrome(s);
      else { end(); begin('chrome'); }
    }
    if (helperOn.checked) sources.probe();
  });
  sourceMode.addEventListener('change', saveSourceSettings);
  chromeFallback.addEventListener('click', () => begin('chrome'));
  const showAudio = open => {
    const panel = $('audioPanel');
    panel.hidden = !open;
    $('audioBack').hidden = !open;
    $('hubDashboard').setAttribute('data-audio-view', String(open));
    launch.setAttribute('aria-expanded', String(open));
    (open ? $('audioBack') : launch).focus();
  };
  const toggle = () => showAudio($('audioPanel').hidden);
  $('audioBack').addEventListener('click', () => showAudio(false));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !$('audioPanel').hidden) {
      event.preventDefault(); showAudio(false);
    }
  });
  start.addEventListener('click', () => { if (!active) return begin(); }); launch.addEventListener('click', toggle);
  stop.addEventListener('click', () => end());
  mic.addEventListener('change', setMic);
  mode.addEventListener('change', render);
  resumeVoice.addEventListener('click', async () => {
    try { await playback.play(); resumeVoice.hidden = true; }
    catch { status.textContent = 'Audio playback is blocked. Check browser sound permissions.'; }
  });
  $('audioClear').addEventListener('click', () => {
    inputs.clear(); replies.clear(); inputTimes.clear(); replyTimes.clear(); render();
    status.textContent = 'Displayed text cleared. AI context remains until STOP.';
  });
  $('audioCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(transcript.value); status.textContent = 'Transcript copied.'; }
    catch { transcript.focus(); transcript.select(); status.textContent = 'Press Ctrl+C to copy the selected transcript.'; }
  });
  sources.probe();
  const helperPoll = setInterval(() => { if (helperOn.checked) sources.probe(); }, 5000);
  window.addEventListener('pagehide', () => { clearInterval(helperPoll); end(); sources.stop(); });
  controls();
  if (!supported()) status.textContent = 'PC audio needs a desktop browser with screen sharing. Open through the local AI server; mobile internal audio is not supported yet.';
  else fetch('/api/health').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => {
    configured = data.configured === true;
    status.textContent = configured ? 'Ready. Click START LISTENING. Saved preferences are loaded; microphone is OFF.' : 'Add OPENAI_API_KEY to the local .env file, then restart START AI LISTENER.bat.';
    controls();
  }).catch(() => { status.textContent = 'Start the local backend with START AI LISTENER.bat, then open http://127.0.0.1:5500.'; });
})();
