import type { Deal, DealForm } from "./types";
import { defaultScopeItems, newId } from "./scopeTemplate";

const STORAGE_KEY = "flipos.deals.v1";

export function emptyForm(): DealForm {
  return {
    address: "",
    purchasePrice: "",
    rehabBudget: "",
    arv: "",
    holdingDays: "",
    financingType: "cash",
    hardMoneyRate: "12",
    hardMoneyPoints: "2",
    strategy: "flip",
    holdFinancing: "loan",
  };
}

export function newDeal(): Deal {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    form: emptyForm(),
    scopeItems: defaultScopeItems(),
    contingencyEnabled: true,
  };
}

export function loadDeals(): Deal[] {
  if (typeof window === "undefined") return [];
  // Only an actually absent key means "new workspace". Storage access,
  // parsing, or shape errors must reach the caller so it can avoid replacing
  // data that may still be recoverable.
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Saved deals are not stored as a list");
  }

  const validDeals = parsed.filter(
    (value): value is Deal => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const deal = value as Partial<Deal>;
      return (
        typeof deal.id === "string" &&
        typeof deal.form === "object" &&
        deal.form !== null &&
        !Array.isArray(deal.form) &&
        Array.isArray(deal.scopeItems)
      );
    }
  );
  if (validDeals.length !== parsed.length) {
    throw new Error("Saved deals contain unreadable entries");
  }
  return validDeals;
}

export function saveDeals(deals: Deal[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
  } catch {
    // storage full or blocked — fail silently, app still works in memory
  }
}

// Strategy tags in the deal switcher. Flips are the default, so they stay
// untagged and existing deals read exactly as they did before.
const STRATEGY_TAGS: Record<string, string> = {
  rental: "Rental",
  brrrr: "BRRRR",
  commercial: "Commercial",
};

export function dealLabel(deal: Deal): string {
  const base = deal.form.address.trim() || "Untitled deal";
  const tag = deal.form.strategy ? STRATEGY_TAGS[deal.form.strategy] : undefined;
  return tag ? `${base} · ${tag}` : base;
}
