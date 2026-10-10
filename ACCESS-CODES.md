# Credits and Free access

Owner: marcelino09327228053@gmail.com (ADMIN_EMAIL can override). Email OTP remains the owner/admin authentication; customer UI uses Free activation or code redemption. Do not share the owner's session.

## Manual paid flow
After confirming payment, open Settings > Admin > Credits, enter label, payment (minimum PHP400), and optionally the existing customer ID, then CREATE CODE and COPY CODE. PHP400 allocates PHP240, 60%; 40% is owner gross allocation, not guaranteed profit. Codes and credit wallets do not expire. There is no Disable action. Raw codes appear once; only SHA-256 hashes are retained. Old day-based codes still recover their old accounts but do not automatically create paid credit: past payments cannot be inferred. Issue credit codes for them after checking payment.

Redeeming an unused code attaches credits to the current customer's account, keeping the library. Top-ups should be targeted to the ID shown on the admin request. Concurrent/repeated redemption never allocates twice. A redeemed code is also an account recovery bearer credential: someone who knows it can recover that account on another device. Keep codes private. If already signed in to a different account, redemption is rejected. Never transfer a code between customers.

## Free
Free activation creates a persistent anonymous database user and session, without email. 1,000 Unicode code points total across speaker transcription and AI answer per calendar week, reset Monday 00:00 UTC+8. Provider is forced to Gemini, no OpenAI fallback. Remaining text is clipped exactly at the allowance and capture closes. No speech for about a minute or an excessively long unfinished audio segment stops capture for safety, without deducting invented text. These are system messages, not AI requests.

Free identities rely on cookies. Clearing app/browser data loses the anonymous identity; this cannot be made equivalent to verified per-person identity without stronger authentication. A persistent cap of 3 Free activations per network per week limits repeated account creation. Shared networks can reach that cap. On Render the final forwarded address is used; configure/check trusted proxy behavior when changing hosting.

## Pro accounting
Server forces OpenAI for positive balances. Ordinary users cannot use the direct /api/session endpoint or choose a provider. Admin direct Audio remains available. All customer audio goes through the same-origin backend WebSocket so usage is trusted; this may add latency compared with admin direct WebRTC. A database lease prevents simultaneous listening from multiple instances/devices. New credits remain on the existing account and request status becomes completed after redemption.

Wallets use integer micro-PHP and an idempotent usage ledger. Initial fixed billing conversion is PHP65/USD, owner-editable for new sessions. gpt-realtime rates: input text $4/M, audio $32/M, image $5/M; cached text/audio $.40/M, image $.50/M; output text $16/M, audio $64/M. gpt-4o-mini-transcribe input $1.25/M, output $5/M. These are a versioned rate card, not a live exchange-rate or price feed. Unknown model/usage fails closed. Maintain rates if provider pricing changes.

Provider response.done and completed transcription usage are charged independently, once per provider event identity. All conversation context is included in actual reported usage, not just the latest visible answer. On customer disconnect the backend attempts cancellation and drains final usage for five seconds. Balances never go negative; if one completed response exceeds the remaining balance, the owner absorbs that excess. Missing usage on provider/network failure or process crash can leave owner-paid, uncharged usage; this is not an exact mirror of the provider invoice. No claim of zero provider-cost overrun is made. The ledger retains vendor cost and charged amount for reconciliation. No audio or transcript is written to the ledger.

Zero balance stops the current Pro session. The customer can request top-up in Settings; if a Free allowance remains, a new session can use it. Request Top-up does not approve payment, send an email, or buy provider credits; it adds a pending request visible to the admin.

## Persistence and validation
Postgres/SQLite additive credit_accounts, credit_codes, credit_events, topup_requests, billing_config, guest_issues tables. Existing category/library tables are unchanged. Transactions serialize wallet mutations; database leases cover multiple service instances. Tests cover duplicate redemption, account isolation, quota clipping, leases, price calculation, provider enforcement, no fallback, direct endpoint denial, and browser customer/admin flows. Paid upstream traffic is mocked in tests.

Official sources checked 2026-10-10:
- https://developers.openai.com/api/docs/models/gpt-realtime
- https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
- https://developers.openai.com/api/docs/guides/voice-latency-cost

## Customer display denomination
Customers see app usage credits, never peso balance or the internal allocation split. One app credit represents 600,000 micro-PHP in the existing ledger: a PHP400 package grants 400 usage credits, a PHP800 package grants 800. This is a display conversion, not a change to allocation, metering, exchange rates, or remaining value. These are not literal provider/API tokens. Customer REST and realtime balance payloads omit the peso balance. Admin balance lists retain the internal PHP budget alongside usage credits. Package sales should state the granted usage-credit amount and that audio and AI replies consume it.
