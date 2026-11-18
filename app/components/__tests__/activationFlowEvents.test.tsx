import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { trackMock, downloadPdfMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  downloadPdfMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@vercel/analytics", () => ({ track: trackMock }));
vi.mock("@/app/components/DealAnalyzer", async () => {
  const React = await import("react");
  return {
    default: function TestDealAnalyzer(props: { form: { address: string }; onAnalysisComplete?: () => void }) {
      const { form, onAnalysisComplete } = props;
      React.useEffect(() => onAnalysisComplete?.(), [onAnalysisComplete]);
      return <div data-testid="sample-analyzer">{form.address}</div>;
    },
  };
});
vi.mock("@/app/components/ScopeBuilder", () => ({ default: () => <div>Scope builder panel</div> }));
vi.mock("@/app/components/PricingModal", () => ({ default: () => null }));
vi.mock("@/app/components/OptionalAccountControls", () => ({ default: () => null }));
vi.mock("@/app/components/scopePdf", () => ({ downloadScopePdf: downloadPdfMock }));

import FlipOSApp from "@/app/components/FlipOSApp";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("flipos.analyticsConsent.v1", "granted");
  trackMock.mockReset();
  downloadPdfMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

function eventNames() {
  return trackMock.mock.calls.map(([name]) => name);
}

describe("first-visit activation events", () => {
  it("tracks only completed sample milestones and keeps the sample out of saved deals", async () => {
    render(<FlipOSApp />);
    const sampleCta = await screen.findByRole("button", { name: "Try a sample deal" });
    await waitFor(() => expect(sampleCta).toBeEnabled());
    fireEvent.click(sampleCta);

    expect(await screen.findByText("Sample deal workspace")).toBeInTheDocument();
    expect(await screen.findByTestId("sample-analyzer")).toHaveTextContent("Sample Property");
    await waitFor(() => expect(eventNames()).toContain("first_analysis_complete"));
    expect(eventNames()).toEqual(expect.arrayContaining([
      "landing_cta_clicked",
      "sample_started",
      "first_analysis_complete",
    ]));
    expect(eventNames().filter((name) => name === "first_analysis_complete")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Scope Builder" }));
    expect(await screen.findByText("Scope builder panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Free sample PDF/ }));
    await waitFor(() => expect(downloadPdfMock).toHaveBeenCalledTimes(1));
    expect(eventNames()).toContain("scope_opened");
    expect(eventNames()).toContain("sample_pdf_exported");
    expect(localStorage.getItem("flipos.deals.v1")).toBeNull();

    const sampleEvent = trackMock.mock.calls.find(([name]) => name === "sample_started");
    expect(sampleEvent?.[1]).toMatchObject({ sample_id: "flip_deal_demo", sample_version: "v1", sample_mode: true });
  });
});
