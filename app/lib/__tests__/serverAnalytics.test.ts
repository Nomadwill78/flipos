import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const trackMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@vercel/analytics/server", () => ({ track: trackMock }));

import { OFFER_VERSION } from "@/app/lib/analyticsConstants";
import { trackVerifiedPaidSuccess } from "@/app/lib/serverAnalytics";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_private_checkout_reference",
    mode: "subscription",
    payment_status: "paid",
    amount_total: 29000,
    currency: "usd",
    metadata: {
      plan_id: "pro",
      billing_period: "annual",
      offer_version: OFFER_VERSION,
      analytics_consent: "granted",
      anon_session_id: SESSION_ID,
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

beforeEach(() => trackMock.mockClear());

describe("verified paid-success analytics", () => {
  it("tracks only a paid, opt-in subscription with minimal, opaque properties", async () => {
    const session = paidSession();
    await trackVerifiedPaidSuccess(session);

    expect(trackMock).toHaveBeenCalledTimes(1);
    const [eventName, properties, options] = trackMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ];
    expect(eventName).toBe("paid_success");
    expect(properties).toMatchObject({
      schema_version: "1",
      anon_session_id: SESSION_ID,
      flow_variant: "first_visit_v1",
      route_id: "stripe_webhook",
      device_class: "unknown",
      consent_state: "granted",
      plan_id: "pro",
      billing_period: "annual",
      price_amount: 290,
      currency: "usd",
      offer_version: OFFER_VERSION,
    });
    expect(properties.event_id).toEqual(expect.any(String));
    expect(properties.event_ts_utc).toEqual(expect.any(String));
    expect(properties.purchase_ref).toMatch(/^[0-9a-f]{20}$/);
    expect(properties.purchase_ref).not.toBe(session.id);
    expect(properties).not.toHaveProperty("customer");
    expect(properties).not.toHaveProperty("email");
    expect(properties).not.toHaveProperty("customer_id");
    expect(options).toEqual({ headers: {} });
  });

  it("does not track unpaid or non-consented sessions", async () => {
    await trackVerifiedPaidSuccess(paidSession({ payment_status: "unpaid" }));
    await trackVerifiedPaidSuccess(paidSession({
      metadata: { plan_id: "pro", billing_period: "monthly", offer_version: OFFER_VERSION },
    }));
    expect(trackMock).not.toHaveBeenCalled();
  });
});
