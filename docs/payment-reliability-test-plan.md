# FlipOS Payment Reliability Test Plan

## Current status and production guardrail

This PR is review-only. It changes application code, tests, and documentation on `fix/payment-entitlement-reliability`. It must not be merged or deployed as part of this task. Vercel deployments are disabled for this branch in `vercel.json`.

Production remains on rollback deployment `dpl_BmEp8efzaNzjAw4T8WXCag2NyizT`, running commit `da8808f6b87f3c1ad7d48b82e9fe747e5cc0b369`. No production alias, environment variable, Stripe live product or price, or live payment is part of this work.

## Payment acceptance criteria

The implementation is acceptable for staging only when every criterion below is met:

1. **A browser URL cannot grant Pro.** `?checkout=success`, a missing or modified `session_id`, a cancel URL, or a directly called endpoint never unlocks Pro without a server-verified Stripe Checkout Session and the matching short-lived HttpOnly browser claim.
2. **Checkout is server-priced.** The client can choose only the supported billing interval. It cannot submit a price ID, amount, plan, user identity, or success URL that overrides server configuration.
3. **The paid session is valid for this offer.** Stripe must report a completed subscription Checkout Session, paid status, USD currency, the expected Pro offer metadata and billing interval, and a subscription containing the configured price ID. A foreign session, a session from another browser claim, an invalid price, or an unpaid, incomplete, canceled, or non-subscription session is rejected.
4. **Account identity stays bound.** If Checkout was initiated by a signed-in Clerk user, verification and later browser entitlement checks must match that same Clerk user and the Stripe session's `client_reference_id`. A different or signed-out user must not inherit the account-bound Pro cookie.
5. **Entitlement cookies fail closed.** The Pro cookie is server-signed, HttpOnly, Secure in production, SameSite=Lax, time-limited, and never written to localStorage. A missing, expired, malformed, or tampered cookie cannot grant Pro. Each app-load entitlement check revalidates the session and subscription with Stripe; canceled or otherwise non-entitled subscriptions return Free.
6. **Account plan follows subscription lifecycle.** Signature-verified subscription-created and subscription-updated events grant Pro only for `active` or `trialing` status. `past_due`, canceled, and other non-entitled states set Free. A deleted subscription sets Free. Checkout completion alone does not update Clerk plan metadata.
7. **Analytics cannot block payment fulfillment.** Stripe webhook signatures are still mandatory. Paid-success analytics is emitted only for eligible paid sessions, deduplicated by Checkout Session when isolated Upstash is configured, and any analytics or Redis failure is acknowledged without making Stripe retry payment fulfillment. Account synchronization failures remain retryable.
8. **Consent withdrawal suppresses future paid-success tracking.** With analytics consent granted, the temporary anonymous Checkout ID is retained locally for no more than seven days. On opt-out, only IDs explicitly queued for revocation are sent to the revocation endpoint. They remain queued until the server acknowledges storage, are retried on a later app load if needed, and expire within seven days. When a hashed suppression marker is stored before the webhook, that webhook must not emit paid-success analytics. No property/deal data, payment details, cookies, IP address, or user-agent headers are sent to analytics.
9. **Checkout failures do not charge by themselves.** A failed, rejected, or canceled verification changes no entitlement and does not create another Checkout Session or charge. Duplicate webhook deliveries do not duplicate a paid-success analytics event.

## Validation sequence

### 1. Offline checks in the pull request

Run these commands from the repository root after dependency installation:

```bash
npm test
npm run lint
npm run type-check
npm run build
```

All four commands must exit successfully. The tests must cover direct and modified success URLs, absent browser claim, foreign/replayed sessions, invalid Checkout price/status/currency/mode, account-binding mismatch, expired and tampered cookies, subscription cancellation, webhook signature rejection, subscription lifecycle handling, analytics deduplication, analytics outage behavior, and consent opt-out/revocation. These checks use mocked Stripe and storage calls and must make no network payment requests.

### 2. Isolated Stripe test-mode verification, only after prerequisites exist

Use a separate test-mode Stripe account or isolated test environment. Do not use production credentials or production prices. Complete one monthly and one annual test subscription, then verify that the matching browser receives Pro only after server verification. Cancel one test subscription and verify that its entitlement returns to Free. Repeat with a direct success URL, altered session ID, foreign browser claim, and signed-in account mismatch; each must remain Free. Deliver test webhooks twice and confirm one paid-success event at most. Do not run live charges.

### 3. Consent and optional services

With a separate non-production Upstash database, start Checkout while opted in, withdraw consent before the paid-success webhook, and confirm that the server suppression marker prevents that event. Verify that the identifier is stored hashed and expires. Simulate a failed revocation request, confirm the ID remains queued, then load the app again and verify the queue clears only after a successful response. Repeat with Upstash unavailable and confirm account subscription updates and payment webhook acknowledgement still succeed while optional analytics is skipped. With Clerk test credentials, verify created, updated, delinquent, canceled, and deleted subscription states against the plan policy.

## External prerequisites not available in this review task

An isolated staging environment is not currently established. No staging deployment or live integration test should be attempted until all of the following are provisioned separately from production:

- A Stripe test-mode secret key and test recurring monthly and annual price IDs whose amounts match the intended FlipOS offer.
- A Stripe test webhook signing secret forwarding the five documented events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- A dedicated preview/staging hostname and isolated deployment project with no production aliases.
- Optional Clerk development/test keys and a test account for account-bound subscription checks.
- Optional non-production Upstash REST URL and token if testing analytics deduplication and consent-revocation persistence.

Upstash is not required to verify payments or grant entitlements. Until its isolated settings are provided, paid-success analytics persistence and revocation-marker tests remain covered only by offline mocks. Production environment variables remain untouched.

## Review and release gates

1. The PR stays a draft until the offline checks pass and reviewers approve the exact diff.
2. Keep Vercel deployment suppression enabled for `fix/payment-entitlement-reliability` throughout review. If a deploy-related status appears, do not promote it or change aliases; investigate the Vercel Git integration settings separately.
3. After isolated staging prerequisites are approved, execute the test-mode sequence above and attach its results to the PR. Do not remove deployment suppression until a separate staging workflow is approved.
4. A later production release requires a separate explicit approval, successful isolated staging results, a fresh review of the production rollback target, and a planned production deployment. This PR itself does not authorize that release.

## SMART execution steps

| Step | Owner | Due | Measurable output |
|---|---|---|---|
| Finish offline validation | PR author | Before marking this PR ready for review | `npm test`, `npm run lint`, `npm run type-check`, and `npm run build` all exit successfully; record the passing results in the PR. |
| Provision isolated test prerequisites | Environment owner | Within five business days after staging access is approved | A separate staging hostname, Stripe test key and prices, webhook secret, and optional separate Clerk/Upstash test settings are available. No production alias or environment variable changes. |
| Execute payment and consent matrix | Reviewer/test lead | Within two business days after prerequisites are available | Complete the test-mode cases above, attach results to the PR, and confirm zero live charges. |
| Decide release readiness | Release owner | Before any merge or production change | Review every acceptance criterion and staging result, then record a separate approval or list blocking failures. This PR does not grant that approval. |

## Related records

- [Payment reliability issue #16](https://github.com/Nomadwill78/flipos/issues/16)
- [Merged release PR #15](https://github.com/Nomadwill78/flipos/pull/15)
- [Vercel project configuration reference](https://vercel.com/docs/project-configuration)
