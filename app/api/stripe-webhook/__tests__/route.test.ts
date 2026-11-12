import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({ constructEvent: vi.fn() }));
const paidAnalyticsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEventAsync: stripeMock.constructEvent };
    constructor(secretKey: string) {
      if (secretKey !== "sk_test_webhook") throw new Error("Unexpected Stripe test key");
    }
  },
}));
vi.mock("@/app/lib/serverAnalytics", () => ({ trackVerifiedPaidSuccess: paidAnalyticsMock }));

import { POST } from "../route";

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_webhook");
  vi.stubEnv("CLERK_SECRET_KEY", "");
  stripeMock.constructEvent.mockReset();
  paidAnalyticsMock.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

function request() {
  return new Request("https://flipos.example/api/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "{}",
  });
}

describe("POST /api/stripe-webhook conversion measurement", () => {
  it("does not pass an unverified webhook to paid-success analytics", async () => {
    stripeMock.constructEvent.mockRejectedValue(new Error("Invalid signature"));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(paidAnalyticsMock).not.toHaveBeenCalled();
  });

  it("passes the Checkout Session to the event handler only after signature verification", async () => {
    const session = {
      id: "cs_test_session",
      client_reference_id: null,
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
  });
});
