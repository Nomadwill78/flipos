import Stripe from "stripe";
import { isAuthConfigured } from "@/app/lib/authConfig";

// Creates a Stripe subscription Checkout Session for FlipOS Pro.
//
// Required environment variables (set in .env.local and Vercel):
//   STRIPE_SECRET_KEY      — from Stripe dashboard → Developers → API keys
//   STRIPE_PRICE_MONTHLY   — price id (price_…) for the $29/mo subscription
//   STRIPE_PRICE_ANNUAL    — price id (price_…) for the $290/yr subscription

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
  const priceAnnual = process.env.STRIPE_PRICE_ANNUAL;

  if (!secretKey || !priceMonthly || !priceAnnual) {
    return Response.json(
      {
        error:
          "Payments are being set up — check back very soon. Nothing was charged.",
      },
      { status: 503 }
    );
  }

  let interval: "monthly" | "annual" = "monthly";
  try {
    const body = await request.json();
    if (body?.interval === "annual") interval = "annual";
  } catch {
    // default to monthly
  }

  const origin =
    request.headers.get("origin") ??
    `https://${request.headers.get("host") ?? "flipos-tau.vercel.app"}`;

  // If the buyer is signed in, bind the subscription to their account so
  // the Stripe webhook can mark them Pro everywhere they sign in.
  let clerkUserId: string | null = null;
  if (isAuthConfigured({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  })) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      clerkUserId = (await auth()).userId;
    } catch {
      // not signed in — checkout still works, unlock is device-local
    }
  }

  try {
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
      subscription_data: clerkUserId
        ? { metadata: { clerkUserId } }
        : undefined,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return Response.json(
      { error: "Couldn't start checkout. Please try again in a moment." },
      { status: 500 }
    );
  }
}
