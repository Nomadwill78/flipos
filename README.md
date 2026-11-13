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
- Paid-success events come only from signature-verified Stripe webhooks, are deduplicated by Checkout Session with Upstash Redis, and do not forward IP, cookie, or user-agent headers.
- Delayed-payment successes are measured from Stripe's `checkout.session.async_payment_succeeded` event.

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

Copy `.env.example` to `.env.local` and fill in values as needed. Most variables are optional. Upstash Redis credentials are required to record opted-in paid-success analytics; without them, that webhook returns an error so Stripe can retry delivery.

```env
# ── CLERK (optional) ──────────────────────────────────────────────────────────
# Auth is disabled and the Sign in button is hidden until these are set.
# Get these from clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# ── STRIPE (optional) ─────────────────────────────────────────────────────────
# Checkout returns a 503 until all three are set.
# Get the secret key from dashboard.stripe.com → Developers → API Keys
# Create two subscription prices in Stripe and paste the price_... IDs here.
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_MONTHLY=price_...   # $29/month subscription
STRIPE_PRICE_ANNUAL=price_...    # $290/year subscription

# ── STRIPE WEBHOOK (optional) ─────────────────────────────────────────────────
# Required only for account-bound Pro (syncs plan via Clerk publicMetadata).
# Create a webhook endpoint in Stripe pointing to:
#   https://your-domain.com/api/stripe-webhook
# Events: checkout.session.completed, customer.subscription.updated,
#         checkout.session.async_payment_succeeded,
#         customer.subscription.deleted
STRIPE_WEBHOOK_SECRET=whsec_...

# ── PAID-SUCCESS ANALYTICS DEDUPLICATION (Upstash Redis) ───────────────────────
# Required to atomically suppress duplicate Checkout Session events.
# Create an Upstash Redis database and copy its REST URL and REST token.
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### Stripe setup (for payments)

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create two **recurring** prices:
   - $29.00 / month → copy the `price_...` ID to `STRIPE_PRICE_MONTHLY`
   - $290.00 / year → copy the `price_...` ID to `STRIPE_PRICE_ANNUAL`
3. Set `STRIPE_SECRET_KEY` from your Stripe dashboard
4. For webhooks: add an endpoint at `https://your-domain.com/api/stripe-webhook`, subscribe to the four events listed above, and copy the signing secret to `STRIPE_WEBHOOK_SECRET`
5. To enable deduplicated paid-success analytics, create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the app environment.

### Clerk setup (for account-bound Pro)

1. Create a Clerk app at [clerk.com](https://clerk.com)
2. Copy the Publishable Key and Secret Key into your env file
3. Enable the `plan` field in Clerk public metadata (the webhook handler writes `{ plan: "pro" | "free" }` there)

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
- Any other branch → preview URL (posted as a PR comment)

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
- **Plan state** is stored device-locally in `localStorage` after a Stripe Checkout success redirect. When Clerk auth is enabled, plan state is also written to Clerk `publicMetadata` via the Stripe webhook, making Pro account-bound.

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
│   ├── checkout/route.ts   # POST → create Stripe checkout session
│   └── stripe-webhook/route.ts  # POST → sync plan to Clerk on payment
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
