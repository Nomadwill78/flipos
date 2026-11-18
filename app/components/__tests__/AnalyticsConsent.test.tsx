import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="analytics-script" />,
}));
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <div data-testid="speed-script" />,
}));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("analytics consent controls", () => {
  it("keeps page and performance analytics off until opt-in and supports revocation", async () => {
    const { default: AnalyticsConsent } = await import("@/app/components/AnalyticsConsent");
    render(<AnalyticsConsent />);

    expect(await screen.findByRole("region", { name: "Optional analytics settings" })).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-script")).not.toBeInTheDocument();
    expect(screen.queryByTestId("speed-script")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow optional analytics" }));
    await waitFor(() => expect(screen.getByTestId("analytics-script")).toBeInTheDocument());
    expect(screen.getByTestId("speed-script")).toBeInTheDocument();
    expect(localStorage.getItem("flipos.analyticsConsent.v1")).toBe("granted");

    fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByTestId("analytics-script")).not.toBeInTheDocument());
    expect(screen.queryByTestId("speed-script")).not.toBeInTheDocument();
    expect(localStorage.getItem("flipos.analyticsConsent.v1")).toBe("denied");
  });

  it("posts queued Checkout IDs on opt-out and clears them only after the server accepts", async () => {
    const analytics = await import("@/app/lib/analyticsClient");
    analytics.setAnalyticsConsent("granted");
    const pendingId = analytics.getOrCreateEphemeralSessionIdForCheckout();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { default: AnalyticsConsent } = await import("@/app/components/AnalyticsConsent");
    render(<AnalyticsConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/analytics/consent-revocation");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ anonSessionIds: [pendingId] });
    await waitFor(() => expect(localStorage.getItem("flipos.pendingAnalyticsRevocations.v1")).toBeNull());
  });

  it("retains a failed revocation and retries it when the app loads again", async () => {
    const analytics = await import("@/app/lib/analyticsClient");
    analytics.setAnalyticsConsent("granted");
    const pendingId = analytics.getOrCreateEphemeralSessionIdForCheckout();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { default: AnalyticsConsent } = await import("@/app/components/AnalyticsConsent");
    render(<AnalyticsConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("flipos.pendingAnalyticsRevocations.v1")).toContain(pendingId);

    cleanup();
    render(<AnalyticsConsent />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(localStorage.getItem("flipos.pendingAnalyticsRevocations.v1")).toBeNull());
  });
});
