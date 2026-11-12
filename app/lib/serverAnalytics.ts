import { createHash, randomUUID } from "node:crypto";
import { track } from "@vercel/analytics/server";
import type Stripe from "stripe";
import {
  ACTIVATION_FLOW_VARIANT,
  ANALYTICS_SCHEMA_VERSION,
  OFFER_VERSION,
  UUID_PATTERN,
} from "@/app/lib/analyticsConstants";

export async function trackVerifiedPaidSuccess(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription" || session.payment_status !== "paid") return;

  const metadata = session.metadata;
  const billingPeriod = metadata?.billing_period;
  const sessionId = metadata?.anon_session_id;
  const amount = session.amount_total;
  const currency = session.currency;

  if (
    metadata?.analytics_consent !== "granted" ||
    metadata?.plan_id !== "pro" ||
    metadata?.offer_version !== OFFER_VERSION ||
    (billingPeriod !== "monthly" && billingPeriod !== "annual") ||
    !sessionId ||
    !UUID_PATTERN.test(sessionId) ||
    amount === null ||
    !Number.isFinite(amount) ||
    !currency
  ) {
    return;
  }

  const purchaseRef = createHash("sha256").update(session.id).digest("hex").slice(0, 20);

  await track(
    "paid_success",
    {
      event_id: randomUUID(),
      event_ts_utc: new Date().toISOString(),
      schema_version: ANALYTICS_SCHEMA_VERSION,
      anon_session_id: sessionId,
      flow_variant: ACTIVATION_FLOW_VARIANT,
      route_id: "stripe_webhook",
      device_class: "unknown",
      consent_state: "granted",
      plan_id: "pro",
      billing_period: billingPeriod,
      price_amount: amount / 100,
      currency,
      offer_version: OFFER_VERSION,
      purchase_ref: purchaseRef,
    },
    // Do not forward request headers, which could include IP, cookie, or user-agent data.
    { headers: {} }
  );
}
