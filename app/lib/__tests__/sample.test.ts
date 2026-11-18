import { describe, expect, it } from "vitest";
import { createSampleDeal } from "@/app/lib/sample";
import { SAMPLE_ID } from "@/app/lib/analyticsConstants";
import { computeResults } from "@/app/lib/analysis";
import { scopeTotal } from "@/app/lib/types";

describe("synthetic sample deal", () => {
  it("uses only fictional values and is ready to analyze without a real address", () => {
    const sample = createSampleDeal();

    expect(sample.id).toBe(SAMPLE_ID);
    expect(sample.form.address).toBe("Sample Property");
    expect(sample.form.purchasePrice).toBe("150000");
    expect(sample.form.rehabBudget).toBe("46000");
    expect(sample.form.arv).toBe("275000");
    expect(computeResults(sample.form, null)).not.toBeNull();
    expect(JSON.stringify(sample)).not.toMatch(/\b\d{1,5}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road)\b/);
  });

  it("has priced synthetic scope items and returns a fresh copy for reset", () => {
    const first = createSampleDeal();
    const second = createSampleDeal();

    expect(first.scopeItems.length).toBeGreaterThan(0);
    expect(scopeTotal(first.scopeItems, first.contingencyEnabled)).toBe(Number(first.form.rehabBudget));
    first.scopeItems[0].description = "Changed only in the first sample";
    expect(second.scopeItems[0].description).not.toBe(first.scopeItems[0].description);
  });
});
