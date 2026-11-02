import { describe, it, expect, beforeEach, vi } from "vitest";
import { dealLabel, emptyForm, newDeal, loadDeals, saveDeals } from "@/app/lib/storage";
import type { Deal } from "@/app/lib/types";

// ── emptyForm ─────────────────────────────────────────────────────────────────

describe("emptyForm", () => {
  it("returns correct default values", () => {
    const form = emptyForm();
    expect(form.address).toBe("");
    expect(form.purchasePrice).toBe("");
    expect(form.rehabBudget).toBe("");
    expect(form.arv).toBe("");
    expect(form.holdingDays).toBe("");
    expect(form.financingType).toBe("cash");
    expect(form.hardMoneyRate).toBe("12");
    expect(form.hardMoneyPoints).toBe("2");
  });
});

// ── newDeal ───────────────────────────────────────────────────────────────────

describe("newDeal", () => {
  it("returns a deal with a non-empty id", () => {
    const deal = newDeal();
    expect(deal.id).toBeTruthy();
    expect(typeof deal.id).toBe("string");
  });

  it("has createdAt and updatedAt timestamps", () => {
    const before = Date.now();
    const deal = newDeal();
    const after = Date.now();
    expect(deal.createdAt).toBeGreaterThanOrEqual(before);
    expect(deal.createdAt).toBeLessThanOrEqual(after);
    expect(deal.updatedAt).toBe(deal.createdAt);
  });

  it("starts with an empty form", () => {
    const deal = newDeal();
    expect(deal.form).toEqual(emptyForm());
  });

  it("starts with scope items array", () => {
    const deal = newDeal();
    expect(Array.isArray(deal.scopeItems)).toBe(true);
    expect(deal.scopeItems.length).toBeGreaterThan(0);
  });

  it("has contingency enabled by default", () => {
    const deal = newDeal();
    expect(deal.contingencyEnabled).toBe(true);
  });

  it("generates unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newDeal().id));
    expect(ids.size).toBe(20);
  });
});

// ── dealLabel ─────────────────────────────────────────────────────────────────

describe("dealLabel", () => {
  function makeDeal(address: string): Deal {
    return { ...newDeal(), form: { ...emptyForm(), address } };
  }

  it("returns the address when set", () => {
    expect(dealLabel(makeDeal("123 Main St"))).toBe("123 Main St");
  });

  it("returns 'Untitled deal' when address is empty", () => {
    expect(dealLabel(makeDeal(""))).toBe("Untitled deal");
  });

  it("returns 'Untitled deal' when address is only whitespace", () => {
    expect(dealLabel(makeDeal("   "))).toBe("Untitled deal");
  });
});

// ── loadDeals / saveDeals ─────────────────────────────────────────────────────

describe("loadDeals / saveDeals", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loadDeals returns empty array when nothing is stored", () => {
    expect(loadDeals()).toEqual([]);
  });

  it("round-trips deals through localStorage", () => {
    const deals = [newDeal(), newDeal()];
    saveDeals(deals);
    const loaded = loadDeals();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(deals[0].id);
    expect(loaded[1].id).toBe(deals[1].id);
  });

  it("throws on invalid JSON instead of treating the store as empty", () => {
    localStorage.setItem("flipos.deals.v1", "not-json{{{");
    expect(() => loadDeals()).toThrow();
  });

  it("throws when the stored value is not an array", () => {
    localStorage.setItem("flipos.deals.v1", JSON.stringify({ not: "an array" }));
    expect(() => loadDeals()).toThrow("Saved deals are not stored as a list");
  });

  it("throws when any stored entry is malformed instead of dropping saved data", () => {
    const good = newDeal();
    const raw = JSON.stringify([good, { broken: true }, null]);
    localStorage.setItem("flipos.deals.v1", raw);
    expect(() => loadDeals()).toThrow("Saved deals contain unreadable entries");
    expect(localStorage.getItem("flipos.deals.v1")).toBe(raw);
  });

  it("surfaces localStorage read failures to the caller", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    expect(() => loadDeals()).toThrow("Storage blocked");
  });

  it("saveDeals handles localStorage quota errors gracefully", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveDeals([newDeal()])).not.toThrow();
  });
});
