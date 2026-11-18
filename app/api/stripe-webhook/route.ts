import Stripe from "stripe";
import { setAccountPlan } from "@/app/lib/accountEntitlements";
import { trackVerifiedPaidSuccess } from "@/app/lib/serverAnalytics";

// Stripe calls this endpoint for signed subscription lifecycle events.
// Account Pro access follows the subscription's verified active status.
// Paid-success analytics is optional and must never block payment fulfillment.
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return new Response("Billing webhook not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(secretKey);
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        try {
          await trackVerifiedPaidSuccess(event.data.object as Stripe.Checkout.Session);
        } catch {
          console.warn("Paid-success analytics was skipped; payment webhook processing continues.");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.clerkUserId;
        if (userId) {
          const entitled = ["active", "trialing"].includes(subscription.status);
          await setAccountPlan(userId, entitled ? "pro" : "free");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.clerkUserId;
        if (userId) await setAccountPlan(userId, "free");
        break;
      }
    }
  } catch (error) {
    console.error("Webhook entitlement handling failed:", error);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}
