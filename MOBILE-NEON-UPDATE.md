# Mobile neon Home and Android Bubble update

## Architecture audit
Android source: I:\MB_Knowledge_Hub.
Package/applicationId remains com.example.mbknowledgehub. MainActivity (website WebView) and non-exported FloatingBubbleService are in the SAME APK. App label: MB Smart Link AI. Bubble is not a second app. One native install/update includes both; uninstalling that package removes both. A separately installed browser PWA/shortcut is not this Android package and cannot own its service.

No package migration, data reset, account change, or library migration was needed. Same versionCode progression: 5 / versionName 1.4. Update in place with the existing matching signing key; never uninstall to update. Downloads/mb-bubble.apk now contains the new debug/test APK.

OPEN configures server address, stops the existing service to avoid saving to an obsolete server, then loads the selected backend. Preserved under CONNECTION. Production and explicit local development settings unchanged. Enable/Stop merged into one actual-service-state toggle. Native fallback toggle remains for older website builds. Updated mobile Home receives native state and hides the fallback; browser-only sites cannot pretend to control Android service. No JavaScript native save bridge added; toggle navigation requires trusted configured origin, main frame and user gesture. Notification Stop remains.

## Website changes
phone.js, phone.css, index.html (asset versions only): mobile header, top navigation with SVG icons, compact Save Link, native Bubble card or Android install card, real category selector and compact title list. Item taps reuse existing Library buttons. Locked categories remain protected. Theme Color is stored under mb_phone_theme; red default only without recognized saved preference. Notes remain in Library. Desktop style.css and backend/library/auth/save behavior unchanged.

Android modified files:
- app/src/main/java/com/example/mbknowledgehub/MainActivity.kt
- app/src/main/java/com/example/mbknowledgehub/FloatingBubbleService.kt
- app/build.gradle.kts

## Verification
- Node full suite: 76 passed.
- Browser regression: Home/Category/Library/AI Listen, settings/password, save link, exact item opening, notes after reload, locked category access, theme red/blue/green persistence, ellipsis, native-state event rendering, nav position, mobile/desktop overflow passed.
- Widths 360, 390, 600, 768, 1440 checked. Screenshots artifacts/phone.
- Android assembleDebug, testDebugUnitTest (12 tests), lintDebug passed (existing deprecation warnings).
- ADB checked: no attached phone. Actual updated APK overlay ON/OFF, notification-stop synchronization, permission-return flow, live microphone listening and in-place install must be verified on a connected device. Browser native-state events were simulated, not hardware proof. Existing mobile listener tests passed; no paid AI session was started.
- No production deployment, push or commit. Existing local branch was already ahead by one commit before edits.

No user data was reset or modified by regression checks (isolated test server and browser fixtures).
