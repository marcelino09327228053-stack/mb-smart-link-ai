# Production email OTP setup (Resend)
Prepared 2026-09-30. Branch: online-sync-wip. Canonical site: https://mb-smart-link-ai.onrender.com.

The code keeps the current custom users/sessions and Supabase Postgres architecture. SQLite remains the local fallback. No migration to Supabase Auth, no new database, and no schema migration are required.

## Configure the sender
1. Create/sign in to a Resend account.
2. In Domains, add a domain/subdomain you control, such as auth.your-domain.com.
3. In that domain's DNS provider, add exactly the SPF and DKIM records Resend displays (including its sending MX/TXT records). Wait until Resend marks the domain verified. Do not replace unrelated existing email records.
4. Create a sending-only API key restricted to that verified domain where available.
5. In Render → your existing Web Service → Environment, add:
   - EMAIL_PROVIDER=resend
   - RESEND_API_KEY=(set privately in Render; never paste it in chat or Git)
   - RESEND_FROM_EMAIL=MB Smart Link AI <login@auth.your-domain.com>
6. Keep NODE_ENV=production, DEV_SAMPLE_LOGIN=false, PUBLIC_ORIGIN=https://mb-smart-link-ai.onrender.com and the existing PG variables unchanged.
7. After the sender/key are configured, deploy the reviewed online-sync-wip changes. No push/deployment has been performed by this work.

The Render hostname itself is not a sender domain you control. You do not have to move the website off Render; the email sender domain can be separate.

For an initial test, Resend's onboarding@resend.dev sender can send only to the email associated with your Resend account. It cannot deliver OTPs to arbitrary users. Verify a sender domain before opening sign-in to everyone.

The reviewed free tier currently lists 3,000 emails/month and 100/day. Domain registration may cost separately. No subscription, domain purchase or billing change was made.

## Live acceptance after deployment
- Request a code using an inbox you control; confirm delivery including spam folder.
- Verify the message's code within ten minutes. Confirm mb_session is Secure, HttpOnly, SameSite=Strict, Path=/.
- Reuse the same code: it must fail. Five incorrect attempts must exhaust it.
- Request another code within 60 seconds: it must be throttled.
- Sign in on the website and Android with the same email. Lock a category and wait for Synced.
- Tap Android MB after copying a URL. Confirm exactly one item in that category.
- Log out / unlock / switch active category; verify the next capture follows server state.
- Repeat after a natural Render idle period. Android allows 90 seconds per read and one retry with the same request ID. Actual cold-start timing is not yet measured.

## Failure behavior
Production never logs or returns OTPs and never falls back to demo codes. Missing provider configuration or provider failure returns a safe error; failed sends invalidate the generated code. Provider error payloads and API keys are never returned to the client.
A successful API response means Resend accepted the email; inbox delivery still depends on the provider and recipient.

Local development can use EMAIL_PROVIDER=development and DEV_SAMPLE_LOGIN=true, only outside production and through a loopback Host. This displays the explicit demo code instead of sending email. Otherwise configure Resend locally using an ignored .env.

## References
- [Resend API](https://resend.com/docs/api-reference/emails/send-email)
- [Domain setup](https://resend.com/docs/dashboard/domains/introduction)
- [Testing sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- [Current pricing](https://resend.com/pricing)
- [Render free instance idle behavior](https://render.com/docs/free#spinning-down-on-idle)
