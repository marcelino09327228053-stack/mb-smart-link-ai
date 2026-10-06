# Mobile AI Listen and app layout — 2026-10-06

## Changes
- Phone layout (up to 600 CSS px): MB Smart Link AI branding and HOME / CATEGORY / LIBRARY / AI LISTEN navigation.
- Home keeps link saving, Category/Settings/Logout and Install MB Bubble. Category handlers are reused. Library retains Edit / Notes and save behavior; only the standalone Notes tab was replaced.
- Independent mobile-listener.js captures getUserMedia audio directly from the phone. No Windows Helper, display capture or loopback dependency.
- LISTEN / PAUSE toggles microphone track.enabled on the same peer/session. Navigation away or hiding the page pauses capture. Clear / Reset closes the peer, stops tracks and clears transcript/answers. A permission request that completes after Reset also releases its tracks.
- Topic is sent in the existing authenticated same-origin /api/session request; later topic changes add a Realtime conversation context item. Responses are text suggestions, not a translation-only mode.
- Backend validates source=phone; default desktop instructions remain unchanged. No change to the PC listener or audio-source implementation.
- Standalone PWA manifest, 192/512px icons and network-only service worker. No account, library, audio, transcript or API response caching. Existing Render origin/URL is unchanged.

## Verification
- Existing baseline: 69 Node tests passed.
- Final Node suite: 76 passed, zero failed/skipped.
- Windows Helper Python suite: 6 passed.
- Isolated headless Chrome UI smoke: Home, Category add/rename/delete, Library Notes save/reopen, AI Listen view, fake-device microphone, mocked transcript/answer, pause/resume/reset, navigation pause, 360/412/600px no horizontal overflow, desktop PC source controls and registered service worker passed. Screenshots are local under artifacts/ (gitignored).
- git diff --check passed. ai-listener.js, pc-audio-sources.js, desktop-panels.js, app.js and library-sync.js are unchanged.
- No real phone microphone, live OpenAI call, or installed-phone standalone launch was verified automatically.

Run `node --test tests/*.test.cjs` and `python -m unittest discover -s windows-helper -p 'test_*.py'`.
Optional smoke: set MB_PLAYWRIGHT_MODULE to an installed Playwright module and MB_CHROME to Chrome's executable if not the Windows default, then run `node scripts/mobile-ui-smoke.cjs`. This uses an isolated browser, in-memory databases and fake/mocked audio/AI; it does not read .env or use real account data.

## Hosting and actual phone check
Before this release, https://mb-smart-link-ai.onrender.com/api/health returned configured:false. The user explicitly approved deploying the UI while they configure Render afterward. Until configured, AI Listen shows Unavailable and does not request the microphone.

Set OPENAI_API_KEY privately in the existing Render service environment, preserving PUBLIC_ORIGIN, database, email and other settings. Never put the key into browser assets, Git or a chat. Verify /api/health reports configured:true after Render restarts. The existing realtime model setting is preserved.

1. Confirm Render deploys the desired main commit. The working branch previously contained eight existing project commits ahead of main; this release preserves those existing features.
2. Open the HTTPS site on the phone and sign in. AI Listen uses the existing secure session cookie.
3. Enter a topic, press LISTEN, grant microphone permission and speak. Check transcript and suggested answer.
4. PAUSE should stop outgoing audio. LISTEN resumes the same conversation; change topic to check subsequent answers. Clear / Reset starts fresh.
5. Keep the app foregrounded; mobile operating systems can suspend background WebRTC sessions. A connection failure releases the microphone and offers a new session.
6. Use the browser's Install app / Add to Home Screen mechanism, then launch the installed icon. Standalone mode depends on supported browser/OS installation. Opening an ordinary browser tab or the separate Bubble APK is not converted into standalone by the manifest. The Bubble APK itself was not changed.
7. Confirm Category rename/delete, Library Notes, Bubble download and desktop AI controls still behave as expected.

Realtime lifecycle/context reference: https://developers.openai.com/api/docs/guides/realtime-conversations
