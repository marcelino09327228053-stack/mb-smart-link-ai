KNOWLEDGE HUB — AI AUDIO LISTENER

PC setup (Node.js 22 or newer; no npm packages required)
1. Stop any old Python/static server serving this folder before adding secrets.
2. Copy .env.example to .env and enter a valid OpenAI API key locally.
   OPENAI_API_KEY can also be supplied as an environment variable.
   Do not paste the key into app.js, a browser, this chat, or Git.
3. Run START AI LISTENER.bat (or npm start).
4. Open http://127.0.0.1:5500 in desktop Chrome.
   If you set PORT in .env, use that port instead.

Values in .env override inherited environment settings when the server starts.
Realtime access and API billing are required. No key is included in this project.

Use
- Choose a topic (or type one), response language, and response mode.
- Windows helper: run INSTALL AUDIO HELPER.bat once (Python required), then
  restart START WEBSITE.bat. The helper starts silently and stays idle until START.
  This PC already has the helper dependencies installed.
- Leave Audio Source on AUTO and PC AUDIO HELPER ON for direct Windows output
  capture without a Chrome sharing picker. OFF stops helper capture immediately.
  AUTO then switches to browser capture; forced WINDOWS HELPER reports an error.
- CHROME CAPTURE always uses the browser. In its sharing prompt, select Entire Screen and enable
  system audio. For YouTube/browser-only sound, share that tab with audio.
  Availability depends on browser/OS. Chrome always requires user selection.
- AUTO falls back if the helper is unavailable or disconnects. Chrome may require
  a fresh click after a disconnect: use USE CHROME CAPTURE when shown. Its sharing
  permission prompt cannot be bypassed. Returning to the helper takes STOP/START.
- STOP closes capture, helper socket and AI session; the background helper stays
  idle. Source preferences are saved; MIC starts OFF. See windows-helper/README.md.
- Audio starts streaming after the AI session connects. Play the source then.
- Microphone is OFF at every session start. Enable MIC explicitly if wanted;
  it requests microphone permission and mixes it with PC audio. Switch OFF to
  release the mic immediately. STOP releases all capture and connections.
- The AI hears live audio, detects completed thoughts with semantic VAD, answers
  questions, and gives brief relevant responses to explanations. Accuracy and
  latency depend on audio clarity, model behavior, network and service load.
- Settings apply to one listening session. STOP before changing them.
- Context persists for the current session within the model's context window.
  START after STOP begins a fresh conversation. CLEAR only clears displayed text.
- Voice Only hides the AI response text; Text + Voice shows its speech transcript.
- Audio responses are AI-generated. Enable playback if the browser asks.

Voice feedback limitation
All-PC capture can contain the AI's own output, even with headphones. Voice modes
therefore gate ALL incoming audio (PC and optional mic) while AI responds and for
350 ms after playback ends. Source speech during this pause is not captured or
buffered. Text Only keeps listening continuously and can interrupt a pending
response when new speech begins. Pause your source while listening to AI voice.
The app streams audio; it does not record files or use upload-after-recording.

Security and architecture
- server.cjs binds only to 127.0.0.1. It serves an explicit public asset allowlist,
  verifies Host and request Origin, validates settings, and limits request size.
- Backend exchanges the browser's SDP with /v1/realtime/calls using the secret
  API key; only an SDP answer reaches the frontend. Audio travels over WebRTC
  directly to OpenAI, not through a file upload. No API token is stored in JS.
- server/session.cjs supplies intent instructions, topic/language, semantic VAD,
  input transcription, voice selection and output mode.
- ai-listener.js manages PC capture, optional microphone mixing, one persistent
  WebRTC connection, transcript/response events, and cleanup.
- app.js and Hub storage are unchanged. The old audio-listener.js remains as
  unused legacy source; index.html loads only the new AI listener.
- Do not expose this local server to a public network. Public hosting would need
  user authentication, per-user quotas, HTTPS and deployment-specific controls.
- Never serve this project using a generic static server once a .env exists.
- Using a new port creates a different browser localStorage origin. Existing
  Hub data remains at the old origin; it is not deleted. To retain it, stop the
  old server and use the exact same hostname and port (e.g. PORT=5500).

Validation
npm test
Automated tests cover session configuration, origin/host validation, credential
protection, upstream errors, PC capture, optional mic, mode rendering, feedback
suppression, STOP races and cleanup. Live OpenAI testing is blocked by the 401
credential response; simulated tests do not prove real speech quality or latency.

Manual acceptance with a valid key
1. Play a short English question in a shared tab: verify transcript and answer.
2. Continue with an explanation and a follow-up referencing it: verify context.
3. Restart with Tagalog, then each response mode; verify language and voice.
4. Enable/disable mic; verify PC source remains active and mic stops when OFF.
5. Stop browser sharing and simulate a network interruption; verify cleanup.
6. Repeat with a local media player using Entire Screen/system audio.

Official references
https://developers.openai.com/api/docs/guides/realtime-webrtc
https://developers.openai.com/api/docs/guides/realtime-vad
https://developers.openai.com/api/docs/guides/realtime-conversations

--- Historical project notes ---
PANEL BEATER STUDY SYSTEM

How to run:
1. Open index.html in Chrome/Edge.
2. Click "+ Add New Part".
3. Add Part Name, Image URL, YouTube Link, and Notes.
4. Data is saved in the browser using localStorage.

Phone use:
- Upload the folder to any static hosting service such as Vercel, Netlify, or GitHub Pages.
- Then open the website URL on your phone.

Current features:
- Responsive layout for phone and PC
- Search parts
- Add/Edit/Delete part
- Image URL
- YouTube link
- Notes
- Browser local storage

V2 update:
- Each item in the left-side list now has its own pencil Edit button.
- Edit the part name, image URL, YouTube link, and notes directly from the sidebar.

V3 update:
- Added image upload from PC or phone gallery.
- Added live image preview.
- Image URL now previews before saving.
- YouTube links are normalized automatically (adds https:// if missing).
- Works with youtube.com and youtu.be links.

LISTEN TO AUDIO
- Open the Hub in desktop Google Chrome 135+ using START WEBSITE.bat,
  or serve this folder over HTTPS/localhost. Opening index.html directly
  is not supported for speech recognition.
- The audio panel is open immediately. Click START LISTENING, choose Entire
  Screen and enable Share system audio in Chrome, then Share. Transcription
  starts automatically. No microphone is requested or used.
- Chrome requires the sharing prompt on each new session; websites cannot skip
  it. Entire Screen with system audio is required; tab/window capture is rejected.
- LISTEN TO AUDIO in the header is an alternative shortcut to the same action.
- STOP releases sharing and keeps the transcript. START LISTENING shares again.
- CLEAR clears the transcript; COPY TEXT copies all displayed text.
- Recognition uses Chrome's speech service, may send audio online, and needs
  service availability/internet access. No microphone fallback or translation.
- The layout fits mobile screens, but shared-audio transcription needs desktop
  Chrome. Transcripts are not saved on reload or added to your Hub notes.

Feature checks: node --test tests/audio-listener.test.cjs
These simulate browser capture/recognition; real audio requires a manual Chrome
check: share a playing English tab, start, verify text, copy, clear, stop, and
confirm the sharing indicator disappears. Also try cancelling and sharing
without audio. End-to-end speech service accuracy was not verified in preview.
