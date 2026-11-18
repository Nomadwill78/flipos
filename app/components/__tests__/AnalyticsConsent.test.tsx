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
afterEach(() => cleanup());

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
});
