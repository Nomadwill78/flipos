export type Plan = "free" | "pro";

export const PRICING = {
  monthly: 29,
  annual: 290, // two months free vs 12 × $29 = $348
} as const;

export const FREE_DEAL_LIMIT = 1;

// Free-plan sample PDF exports are intentionally browser-local. Paid plan state
// is never read from or written to localStorage; it comes from Stripe/Clerk.
const FREE_PDF_KEY = "flipos.freePdfExports.v1";

export function readFreePdfExports(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FREE_PDF_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function markFreePdfExportUsed(dealId: string): void {
  try {
    const map = readFreePdfExports();
    map[dealId] = true;
    window.localStorage.setItem(FREE_PDF_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failures; the free sample remains available.
  }
}
