# Security review — First Person Marketing client platform

**Date:** 31 October 2026 · **Scope:** the code in this repository, the live Lovable Cloud database and storage, the live Stripe webhook configuration, and the full git history (223 commits).

**How it was tested:** code review of every trust boundary; read-only queries against the live database; real HTTP requests against a local build of the app; automated tests (154 passing, 8 new today). The published site itself (logo-welcome-studio.lovable.app) can't be reached from the review environment, so the HTTP tests ran against a local copy of the same code. Run the live checks at the end of this report once on the published site.

## Summary

| | Count |
|---|---|
| Already in place and verified | 14 |
| Fixed during this review | 7 |
| Needs an action from you | 6 |

**Fixed today**
1. **Upload bucket had no file-type restriction live.** The size limit (25 MB) was set, but the allow-list only applied when the bucket was first created. Now enforced on the live bucket (17 types; no HTML or SVG), and the app re-applies it if it ever drifts.
2. **Password reset page accepted any signed-in session.** A signed-in person could set a new password without the current one, and the page didn't check how old the reset link was. It now only accepts a session created by a reset link in the last hour.
3. **No HTTP → HTTPS redirect in the app.** HSTS was set; plain-HTTP requests are now also redirected permanently (308).
4. **No cross-site request guard.** Bearer-token auth already made CSRF ineffective; any POST from another website's page is now also refused (403) and logged.
5. **Webhook did database work before checking for a signature.** Unsigned or malformed requests are now refused immediately, and bodies over 1 MB are refused.
6. **Vulnerable validation library (zod 3, high severity).** Upgraded to zod 4; all checks pass. Five unused packages removed.
7. **No automatic dependency updates.** Dependabot now opens weekly grouped updates and immediate security fixes; CI must pass before merging.

## Checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Enforce HTTPS | ✅ Fixed | `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response, plus a 308 redirect for plain HTTP (src/server.ts). Tested: HTTP on a public host redirects with the path kept; HTTPS and local development untouched. |
| 2 | Server-side form validation | ✅ Pass | Every server function validates input with a zod schema (scan found none without one). Signup is re-validated in the database (`handle_new_user`: names, business, country, international mobile, plan). Public endpoints validate too. Tested: invalid email → 400 "Enter a valid email address."; malformed JSON → 400; `userId: "1 OR 1=1"` → 400. |
| 3 | XSS protection | ✅ Pass | React escapes all output; no `innerHTML`, `eval` or `document.write` (the only `dangerouslySetInnerHTML` is the chart's fixed styles). Notification emails escape every value and only link to in-app paths (tested: a `<script>` title is escaped; `//evil.com` links are dropped). Uploaded files are served from the storage domain, never this site, and HTML/SVG uploads are refused. Enforced CSP blocks plugins, framing and base-tag hijacking; the full script allow-list is report-only (see action 4). |
| 4 | Log and monitor suspicious activity | ✅ Pass + extended | Security log at /admin/security (owners), grouped per kind and hour, kept 180 days, high and critical events alert owners. Sources: rate limits, fake webhooks, unauthorised cron calls, staff permission refusals, non-staff calling staff actions, restricted-account activity, KYC flags, data exports, CSP reports, server errors — and now refused cross-site requests. Every staff charge, card change and status change is in the audit log. |
| 5 | Lock down admin routes | ✅ Pass · ⚠️ action 1 | Admin is invite-only (no domain-based access, no self-registration, one generic login error). Three layers: the /admin layout checks the staff role, database row-level security enforces it, and every staff server function checks the staff level (`requirePerm`; scan found none missing). Privileged database functions now check two-factor themselves (migration 0027). **But** staff two-factor isn't required yet and the owner account has none. |
| 6 | Parameterised queries | ✅ Pass | All data access goes through the Supabase query builder (parameterised). No raw SQL from user input. The only hand-built filter uses a server-generated date; the email lookup escapes wildcard characters. |
| 7 | Environment variables | ✅ Pass | Secrets (Stripe secret key, webhook secret, Resend key, cron secret, Supabase service role) are read on the server only. The only `VITE_` (browser) values are the Supabase URL, project ID and publishable key, which are public by design. The committed `.env` holds only those public values. Stripe's publishable key is stored server-side and only sent with a client's own invoice details. |
| 8 | Rate limiting | ✅ Pass | Every server function has a named limit (a test enforces it), on top of a per-user request limit; public endpoints limit per IP (Cloudflare's address only, never `X-Forwarded-For`) and per email or account. Counts are stored server-side. |
| 9 | CORS | ✅ Pass | No `Access-Control-Allow-*` headers anywhere, so browsers block other sites from reading responses. Server functions are same-origin. |
| 10 | Security headers | ✅ Pass | Verified on a live response: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone and location off; payments only for this site and Stripe), `Cross-Origin-Opener-Policy`, enforced CSP plus a report-only full CSP. |
| 11 | Session cookies | ✅ Not applicable (by design) | Sessions are bearer tokens sent in the `Authorization` header, not cookies, so cookie flags don't apply and the browser never attaches credentials automatically. Sessions that haven't passed two-factor are refused; suspended, closed and restricted accounts are locked out immediately; staff can end a client's sessions. |
| 12 | CSRF protection | ✅ Fixed | Token-header auth means forged requests carry no credentials. New guard refuses any POST whose browser `Origin` is another site (403, logged). Tested: cross-site POST to account-check and signup-payment → 403; same-site and server-to-server requests allowed; Stripe's webhook exempt (it's signed). |
| 13 | Password reset links expire | ✅ Fixed · ⚠️ action 2 | The reset page now only works for a session created by a reset link in the last 60 minutes (tested: 59 minutes accepted, 61 refused, normal sign-ins refused). Supabase's own link expiry should also be 1 hour or less. |
| 14 | Upload types and sizes | ✅ Fixed | 25 MB limit and 17 allowed types, checked in the app and **now enforced by the live storage bucket** (it was missing the type list). HTML and SVG refused. Files are private; downloads only by short-lived signed links, only for the owner or staff. |
| 15 | Verify prices and payments | ✅ Pass | Prices come from the server: signup ignores any price the browser sends (the database uses its own plan table); orders use the server's plan list; Stripe prices are created from server values. Payments are recorded only from Stripe's signed webhook or Stripe's API, never the browser ("never mark invoices paid from the UI"). Tested: unsigned or forged webhook → 400. Staff can't type card numbers. |
| 16 | Production debug mode | ✅ Pass | Production build ships no source maps (0 `.map` files); developer tools are dev-only; server errors show a generic page and are logged, not shown. |
| 17 | Update vulnerable dependencies automatically | ✅ Fixed | Dependabot added (weekly grouped updates, immediate security PRs, GitHub Actions too); CI runs typecheck, lint, tests and build on every PR. Today: zod upgraded 3 → 4 (high severity fixed). Earlier today: 26 of 29 advisories fixed. **Remaining:** 2 moderate, both in developer tools that never ship (esbuild dev server, minimatch). |
| 18 | Remove unused packages | ✅ Fixed | Removed `@hookform/resolvers`, `date-fns`, `@testing-library/react`, `eslint-config-prettier`, `eslint-plugin-prettier`. Kept `tailwindcss` and `tw-animate-css` (used by the stylesheet), `drizzle-orm` and `postgres` (migration tooling) and `@tanstack/router-plugin` (Lovable's build setup). |
| 19 | Exposed files | ✅ Pass | The published site contains only `favicon.png`, `robots.txt`, `_headers` and built assets. Tested: `/.env` and `/.git/config` → 403. No secret files tracked in git. |
| 20 | Git history secrets | ✅ Pass | Scanned all 223 commits for Stripe keys (live, test, restricted, webhook), Resend keys, Supabase secret keys and JWTs, private keys, AWS, GitHub and Slack tokens, and Turnstile secrets. Only match: the old Cloudflare Turnstile **site key**, which is public by design. The Turnstile secret you shared in chat earlier was never committed. |
| 21 | Thorough review | ✅ Done | Today's review plus the earlier deep scan (privileged functions, grants, row-level security, two-factor on every table, `USING (true)` policies — none left). |

## Test results (local build, this review)

```
header strict-transport-security       => max-age=31536000; includeSubDomains
header x-frame-options                  => DENY
header x-content-type-options           => nosniff
header referrer-policy                  => strict-origin-when-cross-origin
header permissions-policy               => camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")
header content-security-policy          => object-src 'none'; base-uri 'self'; frame-ancestors 'none'; …
header cross-origin-opener-policy       => same-origin-allow-popups
cross-site POST /api/public/account-check   => 403
cross-site POST /api/public/signup-payment  => 403
same-site POST, invalid email           => 400 {"error":"Enter a valid email address."}
malformed JSON                          => 400 {"error":"Invalid request."}
signup-payment with "1 OR 1=1"          => 400 {"error":"Invalid request."}
Stripe webhook, no signature            => 400 Invalid signature
Stripe webhook, forged signature        => 400 Invalid signature
cron job, no secret                     => 401 Unauthorized
cron job, wrong secret                  => 401 Unauthorized
GET /.env, GET /.git/config             => 403, 403
source maps in production build         => 0
automated tests                         => 154 passed (typecheck, lint, build clean)
```

## Actions for you

1. **Turn on two-factor for staff (most important).** Your owner account has no two-factor and staff two-factor isn't required. Set it up on your account's Security page, then switch on "Require two-factor for staff" on the Staff page. (I didn't switch it on, because it would block your staff actions until you set it up.)
2. **Supabase auth settings** (Lovable Cloud → Authentication): keep the email link expiry at 1 hour or less, and turn on leaked-password protection.
3. **Stripe customer emails** (Stripe → Settings → Billing → Customer emails): turn on emails for expiring cards and failed payments.
4. **Enforce the full CSP** once the published site's CSP reports (in the security log) show no violations for a week; until then it runs in report-only mode.
5. **Legal review** of the Service Agreement, including off-session charges for extra hours and arrears.
6. **Run the live checks below once** on the published site.

## Follow-up (same day): further hardening

| Item | What was done |
|---|---|
| **Stripe webhook was rejecting real Stripe events** | The security log showed 30 "bad signature" events from 54.187.x.x, which are Stripe's own servers, not attackers: the app's webhook secret no longer matched the endpoint, so no Stripe event had been accepted since 30 Oct 02:37 UTC. Created a new endpoint (same URL and events), stored its secret server-side, disabled the old one, and confirmed a live test event was verified and recorded (31 Oct 11:16 UTC). **Action: click "Sync with Stripe now" on Billing rules** to pull in the invoices and subscription changes missed in that window (they include in_1UWRVv…, in_1UWIAr… and sub_1ULPrP…). Optionally delete the old STRIPE_WEBHOOK_SECRET value in Lovable's secrets. |
| **Full Content-Security-Policy enforced on the live site** | The published domain now enforces the full allow-list (scripts only from this site, Stripe and Lovable; no eval; frames only Stripe; connections only to Supabase, Stripe and the services the browser uses). Lovable's editor preview and local development keep report-only, because the editor itself uses eval. All previous CSP reports came from preview domains, none from the live site. Tested in src/test/request-guards.test.ts. |
| **Two-factor now required for all staff** | Turned on. Staff without an authenticator can still open the admin and set one up on the Staff page; every staff action is refused until they do. **Action: set up two-factor on the Staff page now** (one minute with any authenticator app), then sign in again with the code. |

Updated action list: actions 1 (staff two-factor, now just set yours up) and 4 (enforce CSP) from the list above are done; the Stripe sync is new.

## Live checks to run on the published site

```
curl -sI https://logo-welcome-studio.lovable.app/ | grep -iE "strict-transport|x-frame|content-security|permissions-policy"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://evil.example" -H "content-type: application/json" -d '{"email":"a@b.co"}' https://logo-welcome-studio.lovable.app/api/public/account-check   # expect 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST -d '{}' https://logo-welcome-studio.lovable.app/api/public/stripe/webhook   # expect 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://logo-welcome-studio.lovable.app/api/public/cron/collections   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://logo-welcome-studio.lovable.app/.env   # expect 403 or 404
```
