import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  retrieveSubscription: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { retrieve: stripeMock.retrieveSession } };
    subscriptions = { retrieve: stripeMock.retrieveSubscription };
    constructor(secretKey: string) {
      if (secretKey !== "sk_test_unit") throw new Error("Unexpected Stripe test key");
    }
  },
}));

import { POST } from "../route";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";
import {
  CHECKOUT_CLAIM_COOKIE,
  hashCheckoutClaimToken,
} from "@/app/lib/stripeEntitlements";

const CLAIM = "offline-test-browser-claim";
const SESSION_ID = "cs_test_paid_session";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 29000,
    client_reference_id: null,
    metadata: {
      plan_id: "pro",
      billing_period: "annual",
      offer_version: OFFER_VERSION,
      checkout_claim_hash: hashCheckoutClaimToken(CLAIM),
    },
    subscription: "sub_test_active",
    ...overrides,
  };
}

function request(sessionId: string, claim = CLAIM) {
  return new Request("https://flipos.example/api/checkout/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: claim ? `${CHECKOUT_CLAIM_COOKIE}=${encodeURIComponent(claim)}` : "",
    },
    body: JSON.stringify({ sessionId }),
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
  vi.stubEnv("STRIPE_PRICE_MONTHLY", "price_monthly");
  vi.stubEnv("STRIPE_PRICE_ANNUAL", "price_annual");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  vi.stubEnv("NODE_ENV", "test");
  stripeMock.retrieveSession.mockReset().mockResolvedValue(session());
  stripeMock.retrieveSubscription.mockReset().mockResolvedValue({
    id: "sub_test_active",
    status: "active",
    metadata: {},
    items: { data: [{ price: { id: "price_annual" } }] },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/checkout/verify", () => {
  it("grants a signed HttpOnly entitlement only after verifying the browser-bound paid subscription", async () => {
    const response = await POST(request(SESSION_ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "pro" });
    expect(stripeMock.retrieveSession).toHaveBeenCalledWith(SESSION_ID, { expand: ["subscription"] });
    expect(response.headers.get("set-cookie")).toContain("flipos_pro_entitlement=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain(`${CHECKOUT_CLAIM_COOKIE}=;`);
  });

  it("does not accept a direct or modified Checkout success URL without its browser claim cookie", async () => {
    const response = await POST(request(SESSION_ID, ""));
    expect(response.status).toBe(403);
    expect(await response.json()).toHaveProperty("error");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a foreign or replayed session not bound to this browser claim", async () => {
    stripeMock.retrieveSession.mockResolvedValueOnce(session({
      id: "cs_test_foreign_session",
      metadata: {
        ...session().metadata,
        checkout_claim_hash: hashCheckoutClaimToken("another-browser-claim"),
      },
    }));
    const response = await POST(request("cs_test_foreign_session"));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["unpaid", { payment_status: "unpaid" }],
    ["incomplete", { status: "open" }],
    ["one-time mode", { mode: "payment" }],
    ["wrong currency", { currency: "eur" }],
    ["wrong plan", { metadata: { plan_id: "free" } }],
    ["wrong price", {}],
  ])("rejects %s sessions", async (label, overrides) => {
    if (label === "wrong price") {
      stripeMock.retrieveSubscription.mockResolvedValueOnce({
        id: "sub_test_active",
        status: "active",
        metadata: {},
        items: { data: [{ price: { id: "price_monthly" } }] },
      });
    } else {
      stripeMock.retrieveSession.mockResolvedValueOnce(session(overrides as Record<string, unknown>));
    }
    const response = await POST(request(SESSION_ID));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
