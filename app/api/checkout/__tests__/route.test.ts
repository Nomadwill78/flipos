import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({ createSession: vi.fn() }));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { create: stripeMock.createSession } };
    constructor(secretKey: string) {
      if (secretKey !== "sk_test_unit") throw new Error("Unexpected Stripe test key");
    }
  },
}));

import { POST } from "../route";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_monthly");
  vi.stubEnv("STRIPE_PRICE_ANNUAL", "price_annual");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  vi.stubEnv("APP_URL", "https://flipos-tau.vercel.app");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  stripeMock.createSession.mockResolvedValue({
    id: "cs_test_created",
    url: "https://checkout.stripe.test/session",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function checkoutRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://flipos-tau.vercel.app/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout", () => {
  it("uses server-configured price and trusted URLs, and sets an HttpOnly claim cookie", async () => {
    const response = await POST(checkoutRequest(
      { interval: "annual" },
      { origin: "https://attacker.example", host: "attacker.example" }
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(stripeMock.createSession).toHaveBeenCalledWith(expect.objectContaining({
      success_url: "https://flipos-tau.vercel.app/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://flipos-tau.vercel.app/?checkout=cancelled",
      line_items: [{ price: "price_annual", quantity: 1 }],
      metadata: expect.objectContaining({
        plan_id: "pro",
        billing_period: "annual",
        offer_version: OFFER_VERSION,
        checkout_claim_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    }));
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("stores an anonymous analytics ID only when the request carries opt-in consent", async () => {
    const anonSessionId = "123e4567-e89b-42d3-a456-426614174000";
    const response = await POST(checkoutRequest({
      interval: "monthly",
      analytics: { consent_state: "granted", anon_session_id: anonSessionId },
    }));

    expect(response.status).toBe(200);
    expect(stripeMock.createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_monthly", quantity: 1 }],
      metadata: expect.objectContaining({
        plan_id: "pro",
        billing_period: "monthly",
        offer_version: OFFER_VERSION,
        analytics_consent: "granted",
        anon_session_id: anonSessionId,
      }),
    }));
  });

  it("returns a clear configuration error without creating a Stripe session", async () => {
    vi.stubEnv("STRIPE_PRICE_ANNUAL", "");
    const response = await POST(checkoutRequest({ interval: "annual" }));
    expect(response.status).toBe(503);
    expect(stripeMock.createSession).not.toHaveBeenCalled();
  });
});
