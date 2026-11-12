import Stripe from "stripe";
import { trackVerifiedPaidSuccess } from "@/app/lib/serverAnalytics";

// Stripe calls this endpoint when subscriptions change. It keeps the
// customer's plan in Clerk publicMetadata, which the app reads on sign-in.
//
// Required environment variables:
//   STRIPE_SECRET_KEY       — Stripe dashboard → Developers → API keys
//   STRIPE_WEBHOOK_SECRET   — created with the webhook endpoint (whsec_…)
//   CLERK_SECRET_KEY        — needed to update the user's plan
//
// Stripe webhook endpoint URL: https://<your-domain>/api/stripe-webhook
// Events to send: checkout.session.completed,
//                 customer.subscription.updated,
//                 customer.subscription.deleted

async function setUserPlan(userId: string, plan: "pro" | "free"): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY) return;
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan },
  });
}

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
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.client_reference_id) {
          await setUserPlan(session.client_reference_id, "pro");
        }
        try {
          await trackVerifiedPaidSuccess(session);
        } catch (err) {
          console.error("Paid-success analytics delivery failed", err);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.clerkUserId;
        if (userId) {
          const stillPro = ["active", "trialing", "past_due"].includes(sub.status);
          await setUserPlan(userId, stillPro ? "pro" : "free");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.clerkUserId;
        if (userId) await setUserPlan(userId, "free");
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handling error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}
