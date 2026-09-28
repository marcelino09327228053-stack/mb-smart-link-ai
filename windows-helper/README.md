# Windows Audio Helper

Run `INSTALL AUDIO HELPER.bat` once, then restart `START WEBSITE.bat`.
Python is needed for installation. The backend starts the installed helper in
the background. It binds only to `127.0.0.1:5502` (override with
`AUDIO_HELPER_PORT` in `.env`). No microphone or API key is used by the helper.

In Knowledge Hub, leave **AUTO** and **PC AUDIO HELPER ON**, then click
**START LISTENING**. The helper captures the default Windows playback device
using WASAPI loopback, including audio from local files and other applications.
The browser resamples the live PCM and sends it through the existing AI WebRTC
session. No recording files are created.

- **STOP** closes capture and the AI connection. The helper process remains idle.
- **OFF** immediately closes helper capture. AUTO requests Chrome capture;
  WINDOWS HELPER mode stops with an explanation.
- **CHROME CAPTURE** bypasses the helper. Chrome requires its normal sharing
  prompt and audio-sharing selection. A disconnect can require a fresh click
  on **USE CHROME CAPTURE** because of browser user-activation rules.
- Reconnecting the helper does not interrupt an active Chrome session. STOP,
  then START to use the helper again.
- Only one Hub tab can capture through the helper at a time. Closing or
  refreshing that tab releases capture. The helper checks the Hub's exact Origin.
- After changing the Windows default output device, STOP and START again.
- If changing the Hub port while an old helper is running, exit that helper
  process or configure a different AUDIO_HELPER_PORT and restart the backend.

CONNECTED means the local service is reachable; it does not mean audio is being
captured. DISCONNECTED means unavailable. OFF is the saved user preference.
Voice responses pause incoming audio to avoid capturing the AI's own voice;
Text Only is the continuous-listening mode.

Checks: `npm test` and
`windows-helper\.venv\Scripts\python.exe -m unittest discover -s windows-helper -p "test_*.py" -v`.
Native capture also requires a Windows playback device; automated protocol tests
use a fake device and do not send audio to an AI service.
