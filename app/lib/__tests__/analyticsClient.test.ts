import { beforeEach, describe, expect, it, vi } from "vitest";

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track: trackMock }));

beforeEach(() => {
  localStorage.clear();
  trackMock.mockReset();
  vi.resetModules();
});

describe("privacy-conscious activation analytics", () => {
  it("sends no events before a visitor opts in", async () => {
    const analytics = await import("@/app/lib/analyticsClient");

    expect(analytics.trackActivationEvent("sample_started", "sample_flow", { sample_mode: true })).toBe(false);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("adds the common envelope and reuses only an in-memory session ID after opt-in", async () => {
    const analytics = await import("@/app/lib/analyticsClient");
    analytics.setAnalyticsConsent("granted");

    expect(analytics.trackActivationEvent("sample_started", "/deal/123 Main St", { sample_mode: true })).toBe(false);
    expect(analytics.trackActivationEvent("sample_started", "sample_flow", {
      sample_id: "flip_deal_demo",
      sample_version: "v1",
      sample_mode: true,
      address: "123 Main St",
      purchase_price: 150000,
      event_id: "caller-value",
    })).toBe(true);
    analytics.trackActivationEvent("scope_opened", "scope_builder", { sample_mode: true });

    const first = trackMock.mock.calls[0][1] as Record<string, unknown>;
    const second = trackMock.mock.calls[1][1] as Record<string, unknown>;
    expect(first).toMatchObject({
      schema_version: "1",
      flow_variant: "first_visit_v1",
      route_id: "sample_flow",
      consent_state: "granted",
      sample_id: "flip_deal_demo",
    });
    expect(first.event_id).toEqual(expect.any(String));
    expect(first.event_ts_utc).toEqual(expect.any(String));
    expect(first.event_id).not.toBe("caller-value");
    expect(first.anon_session_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second.anon_session_id).toBe(first.anon_session_id);
    expect(first).not.toHaveProperty("address");
    expect(first).not.toHaveProperty("purchase_price");
  });

  it("forgets the in-memory session ID when another tab revokes consent", async () => {
    const analytics = await import("@/app/lib/analyticsClient");
    analytics.setAnalyticsConsent("granted");
    const previousId = analytics.getOrCreateEphemeralSessionIdForCheckout();
    const unsubscribe = analytics.subscribeToAnalyticsConsent(() => {});

    localStorage.setItem("flipos.analyticsConsent.v1", "denied");
    window.dispatchEvent(new StorageEvent("storage", {
      key: "flipos.analyticsConsent.v1",
      newValue: "denied",
    }));
    expect(analytics.getAnalyticsConsent()).toBe("denied");

    analytics.setAnalyticsConsent("granted");
    expect(analytics.getOrCreateEphemeralSessionIdForCheckout()).not.toBe(previousId);
    unsubscribe();
  });

  it("strips query strings from page and performance routes and cancels tracking after rejection", async () => {
    const analytics = await import("@/app/lib/analyticsClient");
    analytics.setAnalyticsConsent("granted");

    expect(analytics.filterAnalyticsPageview({
      type: "pageview",
      url: "https://flipos.example/?checkout=success&property=secret",
    })).toEqual({ type: "pageview", url: "/" });
    expect(analytics.filterSpeedInsight({
      type: "vital",
      url: "https://flipos.example/?address=secret",
    })).toMatchObject({ url: "/" });
    expect(analytics.filterAnalyticsPageview({
      type: "pageview",
      url: "https://flipos.example/123%20Main%20St",
    })).toBeNull();

    analytics.setAnalyticsConsent("denied");
    expect(analytics.filterAnalyticsPageview({ type: "pageview", url: "https://flipos.example/" })).toBeNull();
    expect(analytics.filterSpeedInsight({ type: "vital", url: "https://flipos.example/" })).toBeNull();
    expect(analytics.trackActivationEvent("sample_started", "sample_flow", { sample_mode: true })).toBe(false);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
