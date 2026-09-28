// Isolated from the Knowledge Hub's data and event handlers.
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  const launch = el("listenAudioBtn"), panel = el("audioPanel");
  const start = el("audioStart"), stop = el("audioStop");
  const clear = el("audioClear"), copy = el("audioCopy");
  const transcript = el("audioTranscript"), status = el("audioStatus");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let stream = null, recognition = null, selecting = false, listening = false;
  let generation = 0, restartTimer = null, base = "", resultCount = 0, skipBefore = 0;
  let resultOffsets = [];

  function supportIssue() {
    if (!window.isSecureContext || location.protocol === "file:")
      return "Open this website through HTTPS or http://localhost (START WEBSITE.bat), then try again.";
    // Older engines silently ignore start(audioTrack) and use the microphone.
    // Restrict this experimental overload to the desktop Chrome versions that support it.
    const version = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (!Recognition || !navigator.mediaDevices?.getDisplayMedia || !version ||
        Number(version[1]) < 135 || /Android|Mobile|Edg\/|OPR\//.test(navigator.userAgent))
      return "Shared-audio transcription needs desktop Google Chrome 135 or newer. This browser cannot use it; your Knowledge Hub still works.";
    return "";
  }

  function controls() {
    launch.disabled = selecting || !!stream;
    start.disabled = selecting || listening || !!supportIssue();
    stop.disabled = !selecting && !stream && !listening;
    copy.disabled = !transcript.value.trim();
  }

  function finish(message) {
    generation++;
    selecting = listening = false;
    clearTimeout(restartTimer);
    const previous = recognition;
    recognition = null;
    if (previous) { try { previous.abort(); } catch {} }
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    base = transcript.value;
    status.textContent = message;
    controls();
  }

  function recognize() {
    const track = stream?.getAudioTracks()[0];
    if (!track || track.readyState !== "live") {
      finish("Shared audio ended. Share again to continue.");
      return;
    }
    base = transcript.value;
    resultCount = skipBefore = 0;
    resultOffsets = [base.length];
    let current;
    try {
      current = new Recognition();
      recognition = current;
      current.lang = "en-US";
      current.continuous = true;
      current.interimResults = true;
      current.onstart = () => {
        if (recognition === current) status.textContent = "Listening to shared audio…";
      };
      current.onresult = event => {
        if (recognition !== current) return;
        resultCount = event.results.length;
        // Replace only the changed result tail; do not rebuild a long transcript
        // for every partial word received from Chrome.
        const changed = Math.max(skipBefore, event.resultIndex ?? skipBefore);
        if (changed > resultCount) return;
        const from = resultOffsets[changed] ?? transcript.value.length;
        let tail = "";
        for (let i = changed; i < resultCount; i++) {
          resultOffsets[i] = from + tail.length;
          const separator = i === skipBefore ? (base ? "\n" : "") : " ";
          tail += separator + event.results[i][0].transcript.trim();
        }
        resultOffsets[resultCount] = from + tail.length;
        resultOffsets.length = resultCount + 1;
        const followLive = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60;
        transcript.setRangeText(tail, from, transcript.value.length, "preserve");
        if (followLive) transcript.scrollTop = transcript.scrollHeight;
        copy.disabled = !transcript.value.trim();
      };
      current.onerror = event => {
        if (recognition !== current) return;
        if (event.error === "no-speech") {
          status.textContent = "Waiting for spoken English in the shared audio…";
          return;
        }
        const messages = {
          network: "Speech service connection failed. Check your internet connection and try again.",
          "not-allowed": "Speech recognition permission was denied. Check Chrome's site permissions and try again.",
          "service-not-allowed": "Chrome's speech service is unavailable. Check browser settings and try again.",
          "audio-capture": "Shared audio could not be read. Share Entire Screen with system audio enabled."
        };
        finish(messages[event.error] || "Speech recognition stopped. Share audio and try again.");
      };
      current.onend = () => {
        if (recognition !== current || !listening) return;
        recognition = null;
        // Chrome ends recognition sessions periodically, even in continuous mode.
        restartTimer = setTimeout(() => { if (listening) recognize(); }, 350);
      };
      status.textContent = "Connecting to the speech service…";
      current.start(track);
    } catch {
      finish("Unable to start shared-audio recognition. Use an updated desktop Chrome and try again.");
    }
  }

  function begin() {
    if (listening || selecting) return;
    const issue = supportIssue();
    if (issue) { status.textContent = issue; return; }
    listening = true;
    controls();
    recognize();
  }

  async function share() {
    panel.classList.remove("hidden");
    launch.setAttribute("aria-expanded", "true");
    const issue = supportIssue();
    if (issue) { status.textContent = issue; controls(); return; }
    if (selecting || stream) return;
    selecting = true;
    const request = ++generation;
    status.textContent = "Choose Entire Screen and enable Share system audio for PC sound. Chrome requires this sharing prompt.";
    controls();
    try {
      const captured = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: { suppressLocalAudioPlayback: false },
        systemAudio: "include",
        selfBrowserSurface: "exclude"
      });
      if (request !== generation) {
        captured.getTracks().forEach(track => track.stop());
        return;
      }
      stream = captured;
      selecting = false;
      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (surface !== "monitor") {
        finish("Entire Screen is required for PC audio. Press START LISTENING and share Entire Screen with Share system audio enabled.");
        return;
      }
      const audio = stream.getAudioTracks()[0];
      if (!audio || audio.readyState !== "live") {
        finish("No PC audio was shared. Press START LISTENING, choose Entire Screen and enable Share system audio. System audio sharing must be available in your browser.");
        return;
      }
      stream.getTracks().forEach(track => track.addEventListener("ended", () => {
        if (stream === captured) finish("Sharing ended. Your transcript is kept; share again to continue.");
      }, { once: true }));
      begin();
    } catch (error) {
      if (request !== generation) return;
      finish(error.name === "NotAllowedError" || error.name === "AbortError"
        ? "Sharing was cancelled or denied. Press START LISTENING to try again."
        : "Could not share audio. Use desktop Chrome and share Entire Screen with system audio enabled.");
    }
  }

  launch.addEventListener("click", () => share());
  start.addEventListener("click", () => stream ? begin() : share());
  stop.addEventListener("click", () => finish("Stopped. Your transcript is kept. START LISTENING lets you share again."));
  clear.addEventListener("click", () => {
    base = transcript.value = "";
    // Ignore results already displayed, including revisions of the current phrase.
    skipBefore = resultCount;
    resultOffsets = [];
    resultOffsets[skipBefore] = 0;
    controls();
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(transcript.value);
      status.textContent = "Full transcript copied.";
    } catch {
      transcript.focus();
      transcript.select();
      status.textContent = "Clipboard access was blocked. The transcript is selected; press Ctrl+C or use your device's Copy command.";
    }
  });
  window.addEventListener("pagehide", () => finish("Stopped."));
  status.textContent = supportIssue() || "Ready. Press START LISTENING to capture PC audio. Microphone is never used.";
  controls();
})();
