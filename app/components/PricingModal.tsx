"use client";

import { useEffect, useRef, useState } from "react";
import { PRICING, FREE_DEAL_LIMIT } from "@/app/lib/plan";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";
import {
  getAnalyticsConsent,
  getOrCreateEphemeralSessionIdForCheckout,
  trackActivationEvent,
} from "@/app/lib/analyticsClient";

type Interval = "monthly" | "annual";

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  /** Why the modal opened — tailors the headline */
  reason?: "deals" | "pdf" | null;
  entryPoint?: string;
  onPricingViewed?: (entryPoint: string) => void;
}

const FREE_FEATURES = [
  `${FREE_DEAL_LIMIT} active deal`,
  "Full Deal Analyzer (ROI, 70% rule, cost stack)",
  "Scope Builder with all three tiers",
  "Property & scope item photos",
  "1 free watermarked sample PDF per deal",
];

const PRO_FEATURES = [
  "Unlimited deals",
  "Unlimited watermark-free scope PDFs",
  "Photos embedded in PDF bids",
  "Priority support",
];

export default function PricingModal({
  open,
  onClose,
  reason,
  entryPoint = "pricing_modal",
  onPricingViewed,
}: PricingModalProps) {
  const [interval, setInterval] = useState<Interval>("annual");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const trackedOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      trackedOpen.current = false;
      return;
    }
    if (trackedOpen.current) return;
    trackedOpen.current = true;
    onPricingViewed?.(entryPoint);
  }, [open, entryPoint, onPricingViewed]);

  if (!open) return null;

  const headline =
    reason === "deals"
      ? "You've hit the free plan's deal limit"
      : reason === "pdf"
      ? "You've seen the sample — go watermark-free"
      : "Upgrade to FlipOS Pro";

  async function handleUpgrade() {
    setLoading(true);
    setNotice(null);
    try {
      const consentGranted = getAnalyticsConsent() === "granted";
      const anonSessionId = consentGranted
        ? getOrCreateEphemeralSessionIdForCheckout()
        : null;
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval,
          ...(anonSessionId
            ? { analytics: { consent_state: "granted", anon_session_id: anonSessionId } }
            : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        trackActivationEvent("checkout_started", "checkout", {
          plan_id: "pro",
          billing_period: interval,
          price_amount: PRICING[interval],
          currency: "usd",
          offer_version: OFFER_VERSION,
          checkout_provider: "stripe",
        });
        window.location.href = data.url;
        return;
      }
      setNotice(
        data.error ||
          "Payments are being set up — check back very soon. Nothing was charged."
      );
    } catch {
      setNotice("Couldn't reach the payment server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const monthlyEquiv = (PRICING.annual / 12).toFixed(2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-bold text-slate-100">{headline}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-lg leading-none px-1"
            title="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-400 mb-5">
          Go Pro to run unlimited deals and hand polished scope-of-work PDFs to your contractors.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Free */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
            <h3 className="font-semibold text-slate-200">Free</h3>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-bold text-slate-100">$0</span>
              <span className="text-slate-500 text-sm"> forever</span>
            </div>
            <ul className="space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-slate-400">
                  <span className="text-slate-600">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="relative rounded-xl border border-accent-700/70 bg-accent-950/15 p-5">
            <span className="absolute -top-2.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-500 text-white uppercase tracking-wider">
              Best for working flippers
            </span>
            <h3 className="font-semibold text-accent-400 mb-3">FlipOS Pro</h3>

            {/* Both billing options always visible and selectable */}
            <div className="space-y-2 mb-4">
              {/* Monthly */}
              <button
                onClick={() => setInterval("monthly")}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  interval === "monthly"
                    ? "border-accent-500 bg-accent-500/10"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      interval === "monthly" ? "border-accent-500" : "border-slate-600"
                    }`}
                  >
                    {interval === "monthly" && (
                      <span className="w-2 h-2 rounded-full bg-accent-500" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-200">Monthly</span>
                </span>
                <span className="text-slate-100">
                  <span className="text-xl font-bold">${PRICING.monthly}</span>
                  <span className="text-slate-500 text-xs"> /mo</span>
                </span>
              </button>

              {/* Annual */}
              <button
                onClick={() => setInterval("annual")}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  interval === "annual"
                    ? "border-accent-500 bg-accent-500/10"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      interval === "annual" ? "border-accent-500" : "border-slate-600"
                    }`}
                  >
                    {interval === "annual" && (
                      <span className="w-2 h-2 rounded-full bg-accent-500" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-slate-200">Annual</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400 uppercase tracking-wide">
                    2 months free
                  </span>
                </span>
                <span className="text-slate-100 text-right">
                  <span className="text-xl font-bold">${PRICING.annual}</span>
                  <span className="text-slate-500 text-xs"> /yr</span>
                  <span className="block text-[10px] text-emerald-400">
                    ≈ ${monthlyEquiv}/mo
                  </span>
                </span>
              </button>
            </div>

            <ul className="space-y-2 mb-5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-accent-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-white font-bold text-sm transition-colors"
            >
              {loading
                ? "Opening secure checkout…"
                : interval === "monthly"
                ? `Upgrade — $${PRICING.monthly}/mo`
                : `Upgrade — $${PRICING.annual}/yr`}
            </button>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              Secure payment by Stripe · Cancel anytime
            </p>
          </div>
        </div>

        {notice && (
          <p className="mt-4 text-sm text-accent-400 bg-accent-950/30 border border-accent-900/50 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        <p className="text-xs text-slate-500 mt-4 text-center">
          One flip pays for years of Pro. A single bad rehab estimate costs more than a decade of it.
        </p>
      </div>
    </div>
  );
}
