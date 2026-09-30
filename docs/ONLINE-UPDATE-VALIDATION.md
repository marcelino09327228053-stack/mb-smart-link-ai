# Online update validation — 2026-09-30

Branch: online-sync-wip. No main push, commit, or live deployment performed.
Existing uncommitted data/mb-smart-link.db was present before work and was left untouched. It must not be staged. The Copy project was not accessed.

## Implemented
- Backend Resend email OTP adapter, explicit sender/key environment settings.
- No production OTP logging; fail closed if delivery/configuration fails.
- Ten-minute expiry, five attempts, persistent 60-second resend cooldown.
- PostgreSQL transaction/row lock around OTP verification to prevent simultaneous reuse.
- Existing Secure/HttpOnly/SameSite session behavior retained; logout clears the secure cookie.
- Defensive malformed-cookie handling and a generic 503 on asynchronous backend failures.
- Environment loading no longer overrides Render environment variables or reads the local .env when modules are imported by tests.
- PostgreSQL capture rechecks request ID after obtaining the library lock, covering concurrent retries.
- Desktop CSS uses rem sizes instead of body zoom. Measured title/sidebar scale is 0.80 of the previous visible size.
- Mobile root scale retained; minimum button targets 44px.
- Android 1.1 / versionCode 2 defaults to Render; explicit localhost development still available.
- Android timeout supports slow startup; one retry reuses the capture operation ID.

## Passed locally
- 61 Node tests, with isolated SQLite/in-memory fixtures.
- PostgreSQL adapter transaction/replay tests use controlled pool doubles: they do not establish a live Supabase connection.
- Headless Chrome: OTP form with simulated delivery, two separate browser sessions sharing a library, third-account isolation, guest migration/retention, active locked category, duplicate capture replay.
- Desktop sizing measurements: 0.80 text and sidebar width ratios versus HEAD; body zoom removed.
- Viewports 1280, 820, 412, 360 checked for horizontal overflow and centered login modal. Screenshots reviewed.
- Existing mobile lock/save/unlock/paste smoke test.
- Android assembleDebug, testDebugUnitTest, lintDebug. Gesture and production-server policy tests pass.
- git diff --check.

## Live checks (read-only / rejected requests only)
- Render homepage: HTTP 200.
- Render health: HTTP 200, approximately 0.43 seconds on the observed request.
- Anonymous auth/me: HTTP 401.
- Anonymous capture: HTTP 401.
- Foreign-origin request-code: HTTP 403.
No real email was sent and no production library/account was created or changed.

## Still requires external configuration/device
- Actual Resend inbox delivery and complete live sign-in after deployment.
- Authenticated Android capture against Render with a physical phone.
- Natural cold-start test after Render sleeps; the observed service was already responsive.
- Live Supabase regression using controlled test accounts; no database credentials were requested or used.
- Existing Postgres TLS configuration uses rejectUnauthorized:false. This pre-existing setting was not changed without a verified Supabase CA configuration, to avoid breaking the working deployment. Certificate verification remains a separate security follow-up.
- A GitHub Pages origin's browser-local data cannot be read automatically by the Render origin. Existing migration preserves/imports data at the origin where it is stored; cross-origin migration needs an explicit export/import flow.

## Not changed
Manual category master-password policy and lock UI; existing account/session architecture; Postgres connection settings; existing user data; AI/audio features.
The old encryption-module test referenced a removed file. It was replaced with tests for the current manual master-password flow rather than restoring obsolete encryption code.
