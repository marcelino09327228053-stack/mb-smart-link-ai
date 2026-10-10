# Access-code sign-in

The verified owner email is marcelino09327228053@gmail.com. ADMIN_EMAIL can override it in backend environment configuration. No user, including the first registered user, can assign themselves admin. Email OTP login remains available.

On the phone, open Settings > Account. The owner signs in with email and gets Admin > Access Codes. Enter a user label and validity (1–365 days), then CREATE CODE and COPY CODE. The raw code is displayed only at creation; only its SHA-256 hash is stored. Closing Settings clears the displayed raw code.

The recipient opens Settings > Account, pastes the code, and activates it. AI Listen's SIGN IN also offers access-code activation. Codes are reusable bearer credentials: anyone who has a code gets the same associated account and library. Give one unique code to each user and keep it private. Different codes create different accounts; they do not merge with existing email accounts.

These are real database users and the existing HttpOnly session cookies. Postgres and SQLite have additive access_codes tables. Existing categories and libraries are preserved. Expired/disabled codes cannot activate, and their sessions are rejected on subsequent backend checks. Live relay checks sessions periodically; already-established direct provider connections cannot be instantly revoked by invalidating the cookie.

This is access authentication, not metered credits, free/paid routing, payment confirmation, or an API spending cap. Do not sell a token allowance based on this feature alone.

Validation: tests/access-codes.test.cjs; scripts/access-ui-check.cjs; existing full suite and phone/live browser checks. No email delivery or paid AI calls are made by these tests.
