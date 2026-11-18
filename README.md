# FlipOS — Fix & Flip Deal Analyzer

> Analyze a deal in seconds. Know your numbers before you write an offer.

**Live app → [flipos-tau.vercel.app](https://flipos-tau.vercel.app)**

---

## What is FlipOS?

FlipOS is a browser-based tool for real estate investors who flip houses. Enter a property's numbers — purchase price, rehab budget, ARV, and holding period — and get an instant, itemized breakdown of every dollar at stake: total cost stack, gross profit, ROI, 70% rule check, daily holding cost, and net profit after tax.

Beyond the financial analysis, a built-in **Scope Builder** lets you walk a property and build a line-item rehab estimate across 12 areas of a home. The scope total flows automatically into the deal analysis. Pro users can export a contractor-ready PDF scope of work to hand to their GCs.

No account is required. First-time visitors can inspect a fictional, read-only sample before choosing whether to create a real deal. The sample is not saved. User-created deals stay in the current browser and are not synced between devices.

---

## Target Users

| User | How they use FlipOS |
|---|---|
| **Active house flippers** | Analyze deals on the go before making an offer |
| **Wholesalers** | Quickly run the 70% rule and MAO calculation for buyers |
| **Real estate agents** | Run investor-friendly numbers for flipper clients |
| **New investors** | Learn the cost structure of a flip deal with pre-filled assumptions |
| **General contractors** | Receive a professional PDF scope-of-work from the investor |

---

## Key Features

### Deal Analyzer
- **Itemized cost stack** — purchase price, rehab, buy closing costs (1.5%), sell closing costs (8% ARV), carrying costs (0.5%/month), hard money interest and points
- **Cash or hard money financing** — toggle between deal types; enter annual rate and points for hard money
- **Real-time calculations** — every metric updates as you type, no submit button
- **70% rule check** — pass/fail badge with maximum allowable purchase price displayed
- **Daily holding cost** — how much the deal costs per day while you own it
- **Net profit after 32% tax** — what you actually keep
- **ARV margin bar** — visual indicator of costs as a % of after-repair value

### Scope Builder
- **12 property areas** — Systems & Mechanical, Exterior, Kitchen, Bathrooms, Bedrooms, Living Areas, Laundry, Garage, Basement & Attic, Landscaping, Pool & Outbuildings, General Conditions
- **72+ default line items** — pre-loaded with typical cost range hints per category
- **Custom rooms** — add Bedroom 2, Hall Bath, Bonus Room, and more with one tap
- **15% contingency toggle** — add or remove a buffer with one click
- **Scope → analyzer sync** — scope total automatically becomes the rehab budget (with "FROM SCOPE" badge)
- **Per-item photos** — attach site photos to individual line items

### Photos
- Property cover photo on the deal card
- Line-item photos in the Scope Builder
- All photos stored in IndexedDB (stays within localStorage limits)
- Photos embedded in PDF export

### PDF Export *(Pro)*
- Contractor-ready scope-of-work document
- Grouped by property area
- Includes property photo, line-item photos, quantities, unit costs, and totals
- 15% contingency shown as a separate line

### Multi-Deal Management
- Create and switch between unlimited deals *(Pro)* or 1 deal *(Free)*
- Each deal persists across refreshes and sessions
- Delete deals with confirmation

### Freemium / Payments
- **Free forever** — 1 deal, full analyzer, full scope builder, photos
- **Pro** — $29/month or $290/year (≈ $24.17/month); unlimited deals + PDF export
- Stripe Checkout with subscription management
- Optional Clerk sign-in for account-bound Pro access. User-created deal data remains browser-local and is not synced.

### Privacy-conscious analytics
- Page views, performance signals, and product events are off until visitors opt in and can be turned off later.
- Product events use a versioned allow-list. Property addresses, deal inputs, photos, and payment details are not sent.
- Page and performance routes omit query strings.
- Paid-success events come only from signature-verified Stripe webhooks, are deduplicated by Checkout Session with Upstash Redis, and do not forward IP, cookie, or user-agent headers. Redis or analytics outages never block Stripe payment fulfillment.
- Delayed-payment successes are measured from Stripe's `checkout.session.async_payment_succeeded` event.
- After a Checkout return, FlipOS verifies the completed paid subscription directly with Stripe before issuing a signed HttpOnly browser entitlement. Account-bound plan updates follow Stripe subscription lifecycle webhooks.
- If a visitor withdraws analytics consent, a temporary anonymous Checkout ID can be sent to a short-lived server-side suppression marker so a later paid-success event is not sent.

---

## Screenshots

> Add screenshots by dropping images into `public/screenshots/` and updating the paths below.

**Deal Analyzer**
```
[screenshot: deal-analyzer.png]
Inputs on the left, live cost stack and metrics on the right.
Two-column desktop layout, single-column mobile.
```

**Scope Builder**
```
[screenshot: scope-builder.png]
Collapsible property areas, line-item editing, contingency toggle.
```

**PDF Export**
```
[screenshot: pdf-export.png]
Contractor-ready scope of work with property photo header.
```

**Pricing Modal**
```
[screenshot: pricing-modal.png]
Free vs Pro comparison with selectable monthly/annual billing.
```

---

## Installation

### Prerequisites
- Node.js 20+
- npm 9+

### Local setup

```bash
# Clone the repo
git clone https://github.com/Nomadwill78/Clearview.git
cd Clearview

# Install dependencies
npm install

# Copy the environment variable template
cp .env.example .env.local

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs fully without any environment variables — auth is disabled and the payment API returns a friendly 503.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in values as needed. Most variables are optional. Stripe test keys and test-mode price IDs are required to exercise Checkout. Upstash Redis is only for opted-in paid-success analytics deduplication and consent-revocation markers. If it is unavailable, payment fulfillment continues and the optional analytics event is skipped.

```env
# ── CLERK (optional) ──────────────────────────────────────────────────────────
# Auth is disabled and the Sign in button is hidden until these are set.
# Get these from clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# ── STRIPE (optional) ─────────────────────────────────────────────────────────
# Checkout returns a 503 until all three are set. Use test-mode values for
# local testing and an isolated staging project. Never use live values in tests.
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MONTHLY=price_...   # test-mode $29/month subscription
STRIPE_PRICE_ANNUAL=price_...    # test-mode $290/year subscription

# ── STRIPE WEBHOOK (optional) ─────────────────────────────────────────────────
# Required for signed webhook delivery and account-bound subscription sync.
# Create a webhook endpoint in Stripe pointing to:
#   https://your-isolated-domain.com/api/stripe-webhook
# Events: checkout.session.completed, checkout.session.async_payment_succeeded,
#         customer.subscription.created, customer.subscription.updated,
#         customer.subscription.deleted
STRIPE_WEBHOOK_SECRET=whsec_...

# ── PAID-SUCCESS ANALYTICS DEDUPLICATION (Upstash Redis) ───────────────────────
# Optional, analytics-only. Needed to deduplicate opted-in paid-success
# events and honor consent withdrawals. It is not required for payment grants.
# Use a non-production Upstash database for local/staging tests.
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Stripe setup (for payments)

1. For local validation or an isolated staging environment, use Stripe test mode and create two **recurring test prices**:
   - $29.00 / month → copy the `price_...` ID to `STRIPE_PRICE_MONTHLY`
   - $290.00 / year → copy the `price_...` ID to `STRIPE_PRICE_ANNUAL`
3. Set the test-mode `STRIPE_SECRET_KEY`; never use a live key for the review or test plan.
4. For local webhook verification, use Stripe CLI to forward test events to `http://localhost:3000/api/stripe-webhook` and set its generated signing secret as `STRIPE_WEBHOOK_SECRET`. For isolated staging, create a test-mode endpoint and subscribe to all five events listed above.
5. Upstash is optional. If testing analytics consent revocation, configure a separate non-production Upstash database. Missing Upstash settings must not prevent account entitlement updates or acknowledge failures to Stripe.

### Clerk setup (optional, for account-bound Pro)

1. Create a Clerk app at [clerk.com](https://clerk.com)
2. Copy the Publishable Key and Secret Key into your env file
3. Enable the `plan` field in Clerk public metadata. The webhook writes `{ plan: "pro" | "free" }` from subscription lifecycle events; Checkout success alone does not update an account plan.

---

## Deployment

The project is pre-configured for **zero-config Vercel deployment**.

### Vercel (recommended)

1. Push to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository
3. Vercel auto-detects Next.js — no build settings to change
4. Add your environment variables in the Vercel project settings
5. Deploy

**Auto-deploy behavior:**
- `main` branch → production (`flipos-tau.vercel.app`)
- Other branches → preview URL unless that branch is disabled in `git.deploymentEnabled` in `vercel.json`.

### Self-hosted

```bash
npm run build
npm start
```

The app runs on port 3000. Put it behind any reverse proxy (nginx, Caddy, etc.).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Browser                          │
│                                                      │
│  ┌──────────────┐   ┌──────────────────────────┐   │
│  │  Deal data   │   │  Photos (compressed JPEG) │   │
│  │ localStorage │   │       IndexedDB           │   │
│  └──────┬───────┘   └────────────┬─────────────┘   │
│         │                        │                   │
│  ┌──────▼────────────────────────▼─────────────┐   │
│  │            FlipOSApp (client component)       │   │
│  │   Multi-deal state · Tab routing · Plan gate  │   │
│  └──────┬────────────────────────┬──────────────┘   │
│         │                        │                   │
│  ┌──────▼──────┐        ┌────────▼──────────┐       │
│  │ DealAnalyzer│        │   ScopeBuilder    │       │
│  │ Real-time   │        │ 12 areas · rooms  │       │
│  │ calculations│        │ photos · PDF      │       │
│  └─────────────┘        └───────────────────┘       │
└──────────────────────────┬──────────────────────────┘
                           │ API calls
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼─────┐    ┌───────▼──────┐   ┌──────▼──────┐
   │  Stripe  │    │   Clerk      │   │   Vercel    │
   │ Checkout │    │   Auth       │   │  Analytics  │
   │ Webhook  │    │   (optional) │   │             │
   └──────────┘    └──────────────┘   └─────────────┘
```

### Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Clerk (optional) |
| Payments | Stripe Subscriptions |
| PDF | @react-pdf/renderer (lazy-loaded) |
| Analytics | Vercel Web Analytics |
| Hosting | Vercel |

### Data flow

- **Deals** are stored as JSON in `localStorage` under `flipos.deals.v1`. No server database — the app is fully client-side for core features.
- **Photos** are canvas-compressed (1400px main / 900px item) and stored in IndexedDB to stay within localStorage size limits.
- **Plan state** is never granted from a success URL or browser-local storage. Guest Pro access uses a signed HttpOnly cookie issued only after server-side Stripe verification and revalidated against the active subscription. When Clerk auth is enabled, account-bound plan state is written to Clerk `publicMetadata` from Stripe subscription lifecycle webhooks.

### Key files

```
app/
├── components/
│   ├── FlipOSApp.tsx       # Root client component — state, routing, deals
│   ├── DealAnalyzer.tsx    # Deal form + calculations + results UI
│   ├── ScopeBuilder.tsx    # Itemized rehab scope editor
│   ├── PhotoPicker.tsx     # Photo upload/compress/display
│   ├── PricingModal.tsx    # Free vs Pro upgrade modal
│   ├── AuthControls.tsx    # Clerk sign-in button + plan sync
│   └── scopePdf.tsx        # PDF generation (lazy-loaded)
├── api/
│   ├── checkout/route.ts   # POST → create server-priced Stripe checkout session
│   ├── checkout/verify/route.ts # POST → verify returned Checkout Session
│   ├── checkout/entitlement/route.ts # GET → revalidate signed browser entitlement
│   └── stripe-webhook/route.ts  # POST → sync subscription lifecycle to Clerk
└── lib/
    ├── types.ts            # All TypeScript interfaces + calculation helpers
    ├── storage.ts          # Deal load/save (localStorage)
    ├── photos.ts           # IndexedDB photo store + compression
    ├── plan.ts             # Freemium plan state hook
    ├── scopeTemplate.ts    # Default line items for new deals
    └── authConfig.ts       # Auth feature flag (checks env var)
```

---

## Roadmap

### In progress
- [ ] Cloud sync — deals backed up and accessible across devices (Clerk-gated)

### Planned
- [ ] Comparable sales lookup — pull ARV comps from public records
- [ ] Lender templates — save hard money terms for repeat lenders
- [ ] Deal sharing — generate a read-only link to share a deal with partners
- [ ] Mobile app — native iOS/Android wrapper
- [ ] Rehab cost database — regional labor and material cost benchmarks
- [ ] Portfolio view — track all active and completed flips in one dashboard
- [ ] Profit tracking — log actuals vs estimates after the flip sells

### Someday / maybe
- [ ] MLS integration for automated ARV pulls
- [ ] GC bid management — collect and compare bids against the scope
- [ ] Tax reporting — profit/loss summaries by tax year

---

## License

Private — all rights reserved. Not open for redistribution or commercial use without written permission.

---

*Built with [Claude Code](https://claude.ai/code)*
