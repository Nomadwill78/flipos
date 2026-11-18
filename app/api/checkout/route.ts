import Stripe from "stripe";
import { isAuthConfigured } from "@/app/lib/authConfig";
import { getCheckoutReturnUrls } from "@/app/lib/checkoutUrls";
import { OFFER_VERSION, UUID_PATTERN } from "@/app/lib/analyticsConstants";
import {
  CHECKOUT_CLAIM_COOKIE,
  CHECKOUT_CLAIM_TTL_SECONDS,
  createCheckoutClaimToken,
  hashCheckoutClaimToken,
  serializeCookie,
} from "@/app/lib/stripeEntitlements";

// Creates a Stripe subscription Checkout Session for FlipOS Pro.
// Price selection is server-controlled; the return claim is never exposed to JS.
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
  const priceAnnual = process.env.STRIPE_PRICE_ANNUAL;

  if (!secretKey || !priceMonthly || !priceAnnual) {
    return Response.json(
      { error: "Payments are being set up — check back very soon. Nothing was charged." },
      { status: 503 }
    );
  }

  let interval: "monthly" | "annual" = "monthly";
  let analyticsSessionId: string | null = null;
  try {
    const body = await request.json();
    if (body?.interval === "annual") interval = "annual";
    if (
      body?.analytics?.consent_state === "granted" &&
      typeof body?.analytics?.anon_session_id === "string" &&
      UUID_PATTERN.test(body.analytics.anon_session_id)
    ) {
      analyticsSessionId = body.analytics.anon_session_id;
    }
  } catch {
    // Default to monthly. No client-supplied price is accepted.
  }

  let clerkUserId: string | null = null;
  if (isAuthConfigured({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  })) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      clerkUserId = (await auth()).userId;
    } catch {
      // Guest checkout remains available through the browser claim cookie.
    }
  }

  const checkoutClaim = createCheckoutClaimToken();
  try {
    const returnUrls = getCheckoutReturnUrls(process.env);
    const stripe = new Stripe(secretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: interval === "annual" ? priceAnnual : priceMonthly,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      client_reference_id: clerkUserId ?? undefined,
      metadata: {
        plan_id: "pro",
        billing_period: interval,
        offer_version: OFFER_VERSION,
        checkout_claim_hash: hashCheckoutClaimToken(checkoutClaim),
        ...(analyticsSessionId
          ? { analytics_consent: "granted", anon_session_id: analyticsSessionId }
          : {}),
      },
      subscription_data: clerkUserId
        ? { metadata: { clerkUserId } }
        : undefined,
      success_url: returnUrls.successUrl,
      cancel_url: returnUrls.cancelUrl,
    });

    if (!session.id || !session.url) {
      return Response.json(
        { error: "Stripe did not create a checkout link. Nothing was charged." },
        { status: 502 }
      );
    }

    return Response.json(
      { url: session.url },
      {
        headers: {
          "Set-Cookie": serializeCookie(
            CHECKOUT_CLAIM_COOKIE,
            checkoutClaim,
            process.env,
            CHECKOUT_CLAIM_TTL_SECONDS
          ),
        },
      }
    );
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return Response.json(
      { error: "Couldn't start checkout. Please try again in a moment." },
      { status: 500 }
    );
  }
}
