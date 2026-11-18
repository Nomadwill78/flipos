import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";
import {
  PRO_ENTITLEMENT_TTL_SECONDS,
  hashCheckoutClaimToken,
  readSignedEntitlement,
  serializeCookie,
  signProEntitlement,
  verifyPaidProCheckout,
} from "@/app/lib/stripeEntitlements";

const ENVIRONMENT = { STRIPE_SECRET_KEY: "sk_test_unit", NODE_ENV: "production" };
const NOW = 1_800_000_000_000;
const SESSION_ID = "cs_test_session_123";

describe("signed Pro entitlement cookies", () => {
  it("round-trips the Stripe session and optional account binding", () => {
    const token = signProEntitlement(SESSION_ID, ENVIRONMENT, NOW, "user_123");
    expect(readSignedEntitlement(token, ENVIRONMENT, NOW)).toEqual({
      sessionId: SESSION_ID,
      userId: "user_123",
    });
  });

  it("rejects a tampered token", () => {
    const token = signProEntitlement(SESSION_ID, ENVIRONMENT, NOW)!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(readSignedEntitlement(tampered, ENVIRONMENT, NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signProEntitlement(SESSION_ID, ENVIRONMENT, NOW)!;
    expect(readSignedEntitlement(
      token,
      ENVIRONMENT,
      NOW + PRO_ENTITLEMENT_TTL_SECONDS * 1000 + 1
    )).toBeNull();
  });

  it("marks production entitlement cookies HttpOnly, Secure, and time-limited", () => {
    const cookie = serializeCookie("flipos_pro_entitlement", "signed-value", ENVIRONMENT, 3600);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=3600");
  });

  it("accepts the owning account and rejects a different account for a browser-bound Checkout claim", async () => {
    const claim = "browser-claim-token";
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: SESSION_ID,
            mode: "subscription",
            status: "complete",
            payment_status: "paid",
            currency: "usd",
            amount_total: 29000,
            client_reference_id: "user_123",
            metadata: {
              plan_id: "pro",
              billing_period: "annual",
              offer_version: OFFER_VERSION,
              checkout_claim_hash: hashCheckoutClaimToken(claim),
            },
            subscription: {
              id: "sub_test",
              status: "active",
              metadata: {},
              items: { data: [{ price: { id: "price_annual" } }] },
            },
          }),
        },
      },
      subscriptions: { retrieve: async () => null },
    } as unknown as Stripe;
    const environment = {
      ...ENVIRONMENT,
      STRIPE_PRICE_MONTHLY: "price_monthly",
      STRIPE_PRICE_ANNUAL: "price_annual",
    };

    expect(await verifyPaidProCheckout(stripe, SESSION_ID, claim, environment, "user_123"))
      .not.toBeNull();
    expect(await verifyPaidProCheckout(stripe, SESSION_ID, claim, environment, "user_other"))
      .toBeNull();
  });
});
