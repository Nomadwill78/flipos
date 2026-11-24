import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cookie: undefined as string | undefined, retrieve: vi.fn(), subscription: vi.fn(), userId: null as string | null, getUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined }) }));
vi.mock("stripe", () => ({ default: class { checkout = { sessions: { retrieve: mocks.retrieve } }; subscriptions = { retrieve: mocks.subscription }; } }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: mocks.userId }), clerkClient: async () => ({ users: { getUser: mocks.getUser } }) }));
import { GET } from "../route";
import { signCheckoutSession } from "@/app/lib/entitlementCookie";
beforeEach(() => {
  vi.clearAllMocks(); mocks.cookie = undefined; mocks.userId = null;
  vi.stubEnv("STRIPE_SECRET_KEY", "test-only-key");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ""); vi.stubEnv("CLERK_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("server entitlement", () => {
  it("rejects an unsigned checkout id", async () => {
    mocks.cookie = "cs_test_paid";
    expect(await (await GET()).json()).toEqual({ plan: "free" });
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it.each(["active", "trialing"])("allows a verified paid guest subscription that is %s", async (status) => {
    mocks.cookie = signCheckoutSession("cs_test_paid", "test-only-key");
    mocks.retrieve.mockResolvedValue({ mode: "subscription", payment_status: "paid", metadata: { plan_id: "pro" }, subscription: { status } });
    const response = await GET();
    expect(await response.json()).toEqual({ plan: "pro" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["canceled", "past_due", "unpaid", "incomplete", "paused"])("revokes a %s subscription even with a valid cookie", async (status) => {
    mocks.cookie = signCheckoutSession("cs_test_paid", "test-only-key");
    mocks.retrieve.mockResolvedValue({ mode: "subscription", payment_status: "paid", metadata: { plan_id: "pro" }, subscription: { status } });
    expect(await (await GET()).json()).toEqual({ plan: "free" });
  });
  it("rejects completed checkout that is still unpaid", async () => {
    mocks.cookie = signCheckoutSession("cs_test_paid", "test-only-key");
    mocks.retrieve.mockResolvedValue({ mode: "subscription", payment_status: "unpaid", metadata: { plan_id: "pro" }, subscription: { status: "active" } });
    expect(await (await GET()).json()).toEqual({ plan: "free" });
  });
  it("fails closed when Stripe is unavailable", async () => {
    mocks.cookie = signCheckoutSession("cs_test_paid", "test-only-key"); mocks.retrieve.mockRejectedValue(new Error("offline"));
    const response = await GET(); expect(response.status).toBe(503); expect((await response.json()).plan).toBe("free");
  });
  it("rejects old account plan metadata as payment evidence", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test"); vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    mocks.userId = "user_a"; mocks.getUser.mockResolvedValue({ publicMetadata: { plan: "pro" }, privateMetadata: {} });
    expect(await (await GET()).json()).toEqual({ plan: "free" });
  });
  it("checks account subscription ownership", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test"); vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    mocks.userId = "user_a"; mocks.getUser.mockResolvedValue({ privateMetadata: { stripeSubscriptionId: "sub_a" } });
    mocks.subscription.mockResolvedValue({ status: "active", metadata: { clerkUserId: "user_b" } });
    expect(await (await GET()).json()).toEqual({ plan: "free" });
    mocks.subscription.mockResolvedValue({ status: "active", metadata: { clerkUserId: "user_a" } });
    expect(await (await GET()).json()).toEqual({ plan: "pro" });
  });
});
