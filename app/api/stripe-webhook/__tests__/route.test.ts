import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({ constructEvent: vi.fn() }));
const paidAnalyticsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setAccountPlanMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEventAsync: stripeMock.constructEvent };
    constructor(secretKey: string) {
      if (secretKey !== "sk_test_webhook") throw new Error("Unexpected Stripe test key");
    }
  },
}));
vi.mock("@/app/lib/serverAnalytics", () => ({ trackVerifiedPaidSuccess: paidAnalyticsMock }));
vi.mock("@/app/lib/accountEntitlements", () => ({ setAccountPlan: setAccountPlanMock }));

import { POST } from "../route";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_webhook");
  stripeMock.constructEvent.mockReset();
  paidAnalyticsMock.mockReset().mockResolvedValue(undefined);
  setAccountPlanMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

function request() {
  return new Request("https://flipos.example/api/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "{}",
  });
}

describe("POST /api/stripe-webhook", () => {
  it("does not process an unverified webhook", async () => {
    stripeMock.constructEvent.mockRejectedValue(new Error("Invalid signature"));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(paidAnalyticsMock).not.toHaveBeenCalled();
    expect(setAccountPlanMock).not.toHaveBeenCalled();
  });

  it("does not grant an account plan from checkout completion alone", async () => {
    const session = {
      id: "cs_test_session",
      client_reference_id: "user_123",
      payment_status: "paid",
      mode: "subscription",
    };
    stripeMock.constructEvent.mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: session },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(paidAnalyticsMock).toHaveBeenCalledWith(session);
    expect(setAccountPlanMock).not.toHaveBeenCalled();
  });

  it("grants Pro from a verified active subscription lifecycle event", async () => {
    stripeMock.constructEvent.mockResolvedValue({
      type: "customer.subscription.created",
      data: { object: { metadata: { clerkUserId: "user_123" }, status: "active" } },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(setAccountPlanMock).toHaveBeenCalledWith("user_123", "pro");
  });

  it("removes Pro for a delinquent subscription according to the strict active-status policy", async () => {
    stripeMock.constructEvent.mockResolvedValue({
      type: "customer.subscription.updated",
      data: { object: { metadata: { clerkUserId: "user_123" }, status: "past_due" } },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(setAccountPlanMock).toHaveBeenCalledWith("user_123", "free");
  });

  it("removes Pro when the subscription is deleted", async () => {
    stripeMock.constructEvent.mockResolvedValue({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { clerkUserId: "user_123" }, status: "canceled" } },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(setAccountPlanMock).toHaveBeenCalledWith("user_123", "free");
  });

  it("acknowledges payment webhooks even if optional paid-success analytics is unavailable", async () => {
    stripeMock.constructEvent.mockResolvedValue({
      type: "checkout.session.async_payment_succeeded",
      data: { object: { id: "cs_test_retry", payment_status: "paid", mode: "subscription" } },
    });
    paidAnalyticsMock.mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(200);
  });
});
