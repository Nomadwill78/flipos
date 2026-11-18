import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  retrieveSubscription: vi.fn(),
}));
const clerkAuthMock = vi.hoisted(() => vi.fn());

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: { retrieve: stripeMock.retrieveSession } };
    subscriptions = { retrieve: stripeMock.retrieveSubscription };
    constructor(secretKey: string) {
      if (secretKey !== "sk_test_unit") throw new Error("Unexpected Stripe test key");
    }
  },
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerkAuthMock }));

import { GET } from "../route";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";
import {
  PRO_ENTITLEMENT_COOKIE,
  signProEntitlement,
} from "@/app/lib/stripeEntitlements";

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
    },
    subscription: "sub_test_active",
    ...overrides,
  };
}

function request(cookie?: string) {
  return new Request("https://flipos.example/api/checkout/entitlement", {
    headers: cookie ? { cookie: `${PRO_ENTITLEMENT_COOKIE}=${encodeURIComponent(cookie)}` } : {},
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
  clerkAuthMock.mockReset().mockResolvedValue({ userId: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/checkout/entitlement", () => {
  it("returns Pro only while Stripe reports the signed session subscription active", async () => {
    const token = signProEntitlement(SESSION_ID, process.env)!;
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "pro" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns Free and clears a signed entitlement after subscription cancellation", async () => {
    stripeMock.retrieveSubscription.mockResolvedValueOnce({
      id: "sub_test_active",
      status: "canceled",
      metadata: {},
      items: { data: [{ price: { id: "price_annual" } }] },
    });
    const token = signProEntitlement(SESSION_ID, process.env)!;
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "free" });
    expect(response.headers.get("set-cookie")).toContain(`${PRO_ENTITLEMENT_COOKIE}=;`);
  });

  it("does not call Stripe when no server-signed entitlement cookie exists", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "free" });
    expect(stripeMock.retrieveSession).not.toHaveBeenCalled();
  });

  it("does not grant an account-bound cookie to a different or signed-out Clerk user", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_clerk");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_clerk");
    const token = signProEntitlement(SESSION_ID, process.env, Date.now(), "user_original")!;

    clerkAuthMock.mockResolvedValueOnce({ userId: "user_other" });
    const otherAccount = await GET(request(token));
    expect(await otherAccount.json()).toEqual({ plan: "free" });
    expect(stripeMock.retrieveSession).not.toHaveBeenCalled();

    const signedOut = await GET(request(token));
    expect(await signedOut.json()).toEqual({ plan: "free" });
    expect(stripeMock.retrieveSession).not.toHaveBeenCalled();
  });
});
