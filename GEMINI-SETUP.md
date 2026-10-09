# Status: disabled in production

Phone AI Listen has been restored to direct OpenAI WebRTC for latency.
Gemini relay code is retained for isolated testing only (createServer liveRelay option).
A configured GEMINI_API_KEY does not enable the relay in production.
The notes below describe the optional test integration.

# Phone AI Listen: Gemini primary

Render Environment:
- GEMINI_API_KEY: add privately in Render; never in frontend or Git.
- GEMINI_LIVE_MODEL: optional, defaults to gemini-2.5-flash-native-audio-preview-12-2025.
- OPENAI_API_KEY / OPENAI_REALTIME_MODEL: retain for quota fallback.

Without GEMINI_API_KEY, existing phone WebRTC behavior remains unchanged.
With the key, phone microphone audio uses /api/live over the authenticated,
same-origin backend connection. Both upstream connections keep keys server-side.
Desktop Windows Helper and Chrome capture keep their existing OpenAI flow.

Gemini native audio generates audio; only its output transcription is displayed.
Generated audio still has a provider cost even though it is not played/stored.
This is not the text-only price comparison. No billing/credits/GCash was added.

Quota/rate-limit errors switch to OpenAI once, with a 60-second Gemini cooldown.
Invalid keys/access/configuration errors do not silently invoke paid fallback.
No raw audio is buffered for replay: repeat speech interrupted by a switch.
Settings changes reconnect with updated instructions and bounded text history
(the latest 12 messages, up to 8,000 characters each). Browser transcripts remain.
Pause stops sending audio. Reset/navigation teardown closes capture and sockets.
A provider session expiry/disconnection currently requires pressing LISTEN again.

Production validation still requires a configured key and an authenticated phone:
1. Save key in Render, wait for deploy, refresh phone.
2. Sign in, LISTEN, approve microphone, speak a short test question.
3. Check transcript/answer and selected language.
4. Render logs show '[AI live] gemini connected' without keys or transcripts.
5. PAUSE / resume / Reset; test that mic streaming stops.
Never force a paid-quota exhaustion test: automated mocked-provider tests cover it.

Automated checks:
- node --test tests/*.test.cjs
- node scripts/phone-ui-check.cjs (Playwright)
- node scripts/live-ui-check.cjs (fake browser mic and mock AI; no paid usage)
