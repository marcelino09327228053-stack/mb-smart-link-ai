# MB Smart Link AI — Android

Default server: https://mb-smart-link-ai.onrender.com
APK: app/build/outputs/apk/debug/app-debug.apk (version 1.3, debug/test build).

## Setup
1. Install the APK on your Android phone. You can transfer the APK to the phone and allow installation from that source, or use INSTALL-USB.ps1 with USB debugging enabled. The script updates without uninstalling or clearing data.
2. Open the app. The default is the live Render website. Internet is required; your PC and USB connection are not required for daily use.
3. Sign in with the same email/account as the website. Production email login requires the backend email provider to be configured; see the website project's docs/EMAIL-OTP-SETUP.md. This build does not configure or deploy Render automatically.
4. Choose and lock a category. Wait for the synced status showing the active target.
5. Tap ENABLE MB, allow Display over other apps, then return and enable MB. Allow notifications if requested.
6. Copy a URL in another app and tap MB. Only a confirmed server save displays SAVE for about one second, then MB returns.
7. Hold MB for about 0.5 seconds to open the full app. Dragging only repositions it. STOP MB or the notification stops the overlay.

There is no disconnected offline library. Without a reachable server, saving fails rather than falsely displaying SAVE. A slow server wake can take longer: native requests wait up to 90 seconds and retry once on transport failures or 502/503/504, keeping the same request ID to avoid duplicates.

## Updates
Install a newer APK with the same package and signing key over the existing app. Website changes are served by Render; native overlay changes require an APK update. This is a debug build, not a signed production distribution release. Do not uninstall to update unless you intend to clear app-local settings/session data.

## Optional local development
Run INSTALL-USB.ps1 -LocalDevelopment to install and forward port 5500. Start the local PC server, then explicitly set http://127.0.0.1:5500 in the app. This mode requires the PC and USB forwarding. Normal installation uses Render and does not forward ports.
Legacy implicit localhost settings migrate to Render. An explicitly chosen local-development address remains selected. Remote addresses must use HTTPS.

## Shared data
The app uses the website's HttpOnly session cookie and authenticated /api/library/capture endpoint. It saves to the server's active locked category; no target means no save. Unlocking the active category clears that target. No other category is silently selected. Website paste and Android capture reuse shared link validation/item structures.
Production retains its existing Supabase Postgres data; local SQLite fallback remains available. No API keys are embedded in Android or frontend files. Existing category password behavior is preserved.

The bubble reads the clipboard only on a tap. Android clipboard/focus restrictions, OEM battery policies and screens that hide overlays still require physical-device testing. No accessibility service or microphone is used.

## Verified locally
- Android assembleDebug, testDebugUnitTest and lintDebug passed.
- Backend/browser unit suite: 61 tests passed.
- Browser checks cover same-account two-device sync, account isolation, guest preservation, lock target, duplicate capture IDs and mobile layout.
- Actual phone overlay/clipboard operation and authenticated capture against production remain to be verified. Real email delivery requires a configured sender. PostgreSQL concurrency tests use controlled test doubles, not the live database.

## Phone acceptance checks
Copy URL → tap → SAVE → MB; confirm it appears in the same category on the website.
Empty/non-URL clipboard, no lock, logged out or offline → no false SAVE.
Hold 0.5 seconds → full app without saving on release.
Drag → move only; restart → remembered position.
Unlock/change category → next tap follows server state.
Repeated rapid taps → no duplicate saves. Stop/restart → one bubble.
