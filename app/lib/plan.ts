"use client";

import { useEffect, useState } from "react";
export type Plan = "free" | "pro";
export const PRICING = { monthly: 29, annual: 290 } as const;
export const FREE_DEAL_LIMIT = 1;

// Plan state is never persisted in localStorage. Account changes and tab focus
// revalidate with the server; cancellation is picked up at most a minute later.
export function usePlan(accountSignal: number = 0): Plan {
  const [plan, setVerifiedPlan] = useState<Plan>("free");
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const controller = new AbortController();
    async function refresh() {
      const current = ++sequence;
      try {
        const response = await fetch("/api/entitlement", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (active && current === sequence) setVerifiedPlan(response.ok && data.plan === "pro" ? "pro" : "free");
      } catch {
        if (active && current === sequence) setVerifiedPlan("free");
      }
    }
    // Discard any entitlement from the previous account while rechecking.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifiedPlan("free");
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => { active = false; controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [accountSignal]);
  return plan;
}

// ── Free sample PDF exports ───────────────────────────────────────────────────
// The free plan gets one watermarked "sample" scope PDF per deal, so users can
// experience the contractor handoff workflow before upgrading.

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
    // ignore — worst case the user gets another sample
  }
}
