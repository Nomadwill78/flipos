import Stripe from "stripe";
import { cookies } from "next/headers";
import { isAuthConfigured } from "@/app/lib/authConfig";
import { ENTITLEMENT_COOKIE, readCheckoutSession } from "@/app/lib/entitlementCookie";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const entitled = (subscription: Stripe.Subscription) => ["active", "trialing"].includes(subscription.status);

// No client-supplied plan, redirect parameter, or unsigned session id is trusted.
export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return Response.json({ plan: "free" }, { headers });
  const stripe = new Stripe(secret);
  try {
    if (isAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY })) {
      const { auth, clerkClient } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        const user = await (await clerkClient()).users.getUser(userId);
        const subscriptionId = user.privateMetadata?.stripeSubscriptionId;
        if (typeof subscriptionId === "string") {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.metadata.clerkUserId === userId && entitled(subscription)) {
            return Response.json({ plan: "pro" }, { headers });
          }
        }
      }
    }
    const sessionId = readCheckoutSession((await cookies()).get(ENTITLEMENT_COOKIE)?.value, secret);
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
      const subscription = session.subscription;
      if (session.mode === "subscription" && session.payment_status === "paid" &&
          session.metadata?.plan_id === "pro" && subscription && typeof subscription !== "string" && entitled(subscription)) {
        return Response.json({ plan: "pro" }, { headers });
      }
    }
    return Response.json({ plan: "free" }, { headers });
  } catch {
    return Response.json({ plan: "free", error: "Unable to verify subscription" }, { status: 503, headers });
  }
}
