"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deal, ScopeItem, CustomRoom } from "@/app/lib/types";
import { scopeTotal, itemTotal } from "@/app/lib/types";
import { loadDeals, saveDeals, newDeal, dealLabel, emptyForm } from "@/app/lib/storage";
import { deletePhoto } from "@/app/lib/photos";
import {
  usePlan,
  setPlan,
  FREE_DEAL_LIMIT,
  readFreePdfExports,
  markFreePdfExportUsed,
  type Plan,
} from "@/app/lib/plan";
import OptionalAccountControls from "@/app/components/OptionalAccountControls";
import { dealVerdict } from "@/app/lib/analysis";
import DealAnalyzer from "@/app/components/DealAnalyzer";
import ScopeBuilder from "@/app/components/ScopeBuilder";
import PricingModal from "@/app/components/PricingModal";

type Tab = "analyzer" | "scope";

// Identical on the server and the first client render. This preview is never
// persisted: browser data must finish restoring before saving is enabled.
const PREVIEW_ID = "flipos-guest-preview";
function previewDeal(): Deal {
  return {
    id: PREVIEW_ID,
    createdAt: 0,
    updatedAt: 0,
    form: emptyForm(),
    scopeItems: [],
    contingencyEnabled: true,
  };
}

export default function FlipOSApp({ authEnabled = false }: { authEnabled?: boolean }) {
  const [deals, setDeals] = useState<Deal[] | null>(() => [previewDeal()]);
  const [activeId, setActiveId] = useState<string>(PREVIEW_ID);
  const [dealsReady, setDealsReady] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("analyzer");
  const [exporting, setExporting] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingReason, setPricingReason] = useState<"deals" | "pdf" | null>(null);
  const [welcomePro, setWelcomePro] = useState(false);
  const [accountPlan, setAccountPlan] = useState<Plan | null>(null);
  // Which deals have used their one free watermarked sample export
  const [freePdfUsed, setFreePdfUsed] = useState<Record<string, boolean>>({});
  const [sampleExported, setSampleExported] = useState(false);
  const plan = usePlan();
  // Pro if paid on this device OR the signed-in account is Pro
  const isPro = plan === "pro" || accountPlan === "pro";

  // Handle the return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setPlan("pro");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWelcomePro(true);
    }
    if (checkout) {
      params.delete("checkout");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // Restore browser data after hydration without waiting for optional auth.
  useEffect(() => {
    try {
      const saved = loadDeals();
      const restored = saved.length > 0 ? saved : [newDeal()];
      setDeals(restored); // eslint-disable-line react-hooks/set-state-in-effect
      setActiveId(restored[0].id);
      setFreePdfUsed(readFreePdfExports());
      setRestoreFailed(false);
      setDealsReady(true);
    } catch (error) {
      console.error("Could not restore FlipOS deals", error);
      setRestoreFailed(true);
    }
  }, [restoreAttempt]);

  // State (not a ref) prevents the first effect pass from saving the preview
  // over existing deals before the restored state has committed.
  useEffect(() => {
    if (dealsReady && deals) saveDeals(deals);
  }, [deals, dealsReady]);

  const activeDeal = useMemo(
    () => deals?.find((d) => d.id === activeId) ?? null,
    [deals, activeId]
  );

  function updateActiveDeal(patch: Partial<Deal>) {
    if (!dealsReady) return;
    setDeals((prev) =>
      prev
        ? prev.map((d) =>
            d.id === activeId ? { ...d, ...patch, updatedAt: Date.now() } : d
          )
        : prev
    );
  }

  function handleNewDeal() {
    if (!dealsReady) return;
    if (!isPro && deals && deals.length >= FREE_DEAL_LIMIT) {
      setPricingReason("deals");
      setPricingOpen(true);
      return;
    }
    const d = newDeal();
    setDeals((prev) => (prev ? [d, ...prev] : [d]));
    setActiveId(d.id);
    setTab("analyzer");
  }

  function handleDeleteDeal() {
    if (!dealsReady || !deals || !activeDeal) return;
    if (!window.confirm(`Delete "${dealLabel(activeDeal)}"? This can't be undone.`)) return;
    // best-effort cleanup of this deal's photos
    void deletePhoto(activeDeal.mainPhotoId);
    activeDeal.scopeItems.forEach((it) => void deletePhoto(it.photoId));
    const remaining = deals.filter((d) => d.id !== activeId);
    if (remaining.length === 0) {
      const d = newDeal();
      setDeals([d]);
      setActiveId(d.id);
    } else {
      setDeals(remaining);
      setActiveId(remaining[0].id);
    }
  }

  async function handleExportPdf() {
    if (!dealsReady || !activeDeal || exporting) return;
    const sample = !isPro;
    // Free plan: one watermarked sample per deal, then the paywall
    if (sample && freePdfUsed[activeDeal.id]) {
      setPricingReason("pdf");
      setPricingOpen(true);
      return;
    }
    // Don't let anyone (especially a one-shot sample) export an empty scope
    if (!activeDeal.scopeItems.some((it) => itemTotal(it) > 0)) {
      window.alert("Price at least one line item first — the PDF only includes priced work.");
      return;
    }
    setExporting(true);
    try {
      // PDF library loads only when needed — keeps the app fast
      const { downloadScopePdf } = await import("@/app/components/scopePdf");
      await downloadScopePdf(activeDeal, { watermark: sample });
      if (sample) {
        markFreePdfExportUsed(activeDeal.id);
        setFreePdfUsed((m) => ({ ...m, [activeDeal.id]: true }));
        setSampleExported(true);
      }
    } catch (err) {
      console.error("PDF export failed", err);
      window.alert("Sorry — the PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  // Scope total drives the rehab budget when the scope has real numbers in it
  const scopeRehab = activeDeal
    ? scopeTotal(activeDeal.scopeItems, activeDeal.contingencyEnabled)
    : 0;
  const rehabFromScope = scopeRehab > 0 ? scopeRehab : null;

  // Strategy-aware health badge: profit for flips, cash flow for holds
  const verdict = activeDeal ? dealVerdict(activeDeal.form, rehabFromScope) : null;

  if (!deals || !activeDeal) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-6" role="alert">
        <h1 className="text-2xl font-semibold">Your workspace could not open</h1>
        <p className="text-base text-slate-300">Reload to try again. No sign-in is required.</p>
        <button onClick={() => window.location.reload()} className="rounded-lg bg-accent-500 px-4 py-2 text-base font-semibold">Reload workspace</button>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-md bg-accent-500 flex items-center justify-center font-bold text-white text-xs select-none">
              FO
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-accent-400">Flip</span>
              <span className="text-slate-100">OS</span>
            </span>
            {isPro ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-500 text-white uppercase tracking-wider select-none">
                Pro
              </span>
            ) : (
              <button
                onClick={() => {
                  setPricingReason(null);
                  setPricingOpen(true);
                }}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-accent-700/60 text-accent-400 hover:bg-accent-500/10 transition-colors"
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Deal switcher */}
          <div className="flex items-center gap-2 min-w-0">
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              disabled={!dealsReady}
              className="max-w-40 sm:max-w-60 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500 truncate"
              title="Switch deal"
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {dealLabel(d)}
                </option>
              ))}
            </select>
            <button
              onClick={handleNewDeal}
              disabled={!dealsReady}
              className="shrink-0 bg-accent-500 hover:bg-accent-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              title="Start a new deal"
            >
              + New
            </button>
            <button
              onClick={handleDeleteDeal}
              disabled={!dealsReady}
              className="shrink-0 text-slate-500 hover:text-red-400 text-sm px-1.5 py-1.5 transition-colors"
              title="Delete this deal"
            >
              🗑
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {verdict && (
              <div
                className={`hidden md:block text-xs font-semibold px-2.5 py-1 rounded-full ${
                  verdict.positive
                    ? "bg-emerald-900/60 text-emerald-400 border border-emerald-800"
                    : "bg-red-900/60 text-red-400 border border-red-800"
                }`}
              >
                {verdict.label}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1">
          {(
            [
              ["analyzer", "Deal Analyzer"],
              ["scope", "Scope Builder"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              disabled={!dealsReady}
              className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-accent-500 text-accent-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {tab === "scope" && (
            <button
              onClick={handleExportPdf}
              disabled={!dealsReady || exporting}
              className="my-1 px-3 text-xs font-semibold rounded-lg border border-accent-700/60 text-accent-400 hover:bg-accent-500/10 disabled:opacity-50 transition-colors"
            >
              {exporting
                ? "Building PDF…"
                : isPro
                ? "⤓ Export PDF for GCs"
                : freePdfUsed[activeDeal.id]
                ? "⤓ Export PDF 🔒"
                : "⤓ Free sample PDF"}
            </button>
          )}
        </div>
      </header>

      {sampleExported && !isPro && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-800/60 bg-accent-950/30 px-4 py-3">
            <p className="text-sm text-accent-200/90">
              📄 Your sample scope PDF downloaded — that&apos;s exactly what your contractor
              gets. Go Pro to remove the watermark and export every deal, every revision.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setPricingReason("pdf");
                  setPricingOpen(true);
                }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-400 text-white transition-colors"
              >
                Remove watermark
              </button>
              <button
                onClick={() => setSampleExported(false)}
                className="text-accent-600 hover:text-accent-300 text-sm px-1"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {welcomePro && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="flex items-center justify-between rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-4 py-3">
            <p className="text-sm text-emerald-300">
              🎉 Welcome to <span className="font-bold">FlipOS Pro</span> — unlimited deals and PDF export are unlocked.
            </p>
            <button
              onClick={() => setWelcomePro(false)}
              className="text-emerald-500 hover:text-emerald-300 text-sm px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
        <section aria-labelledby="workspace-heading" className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 id="workspace-heading" className="text-lg font-semibold">Your deal workspace</h1>
            <p className="mt-1 text-base text-slate-300">
              No sign-in required to analyze a deal. Deals are saved in this browser, not synced between devices.
            </p>
          </div>
          {authEnabled && <OptionalAccountControls onPlan={setAccountPlan} />}
        </section>
        {!dealsReady && !restoreFailed && (
          <p role="status" className="mb-4 text-base text-slate-400">Opening this browser&apos;s saved deals…</p>
        )}
        {restoreFailed && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-800 bg-amber-950/30 p-4">
            <h2 className="text-lg font-semibold text-amber-200">Saved deals could not open</h2>
            <p className="mt-1 text-base text-slate-200">Your saved data has not been changed. Try again without signing in.</p>
            <button onClick={() => setRestoreAttempt((attempt) => attempt + 1)} className="mt-3 rounded-lg border border-amber-700 px-4 py-2 text-base font-semibold text-amber-100">Retry opening deals</button>
          </div>
        )}
        <fieldset disabled={!dealsReady} aria-busy={!dealsReady && !restoreFailed} className="min-w-0">
        {tab === "analyzer" ? (
          <DealAnalyzer
            form={activeDeal.form}
            onFormChange={(form) => updateActiveDeal({ form })}
            rehabFromScope={rehabFromScope}
            onGoToScope={() => setTab("scope")}
            mainPhotoId={activeDeal.mainPhotoId}
            onMainPhotoChange={(mainPhotoId) => updateActiveDeal({ mainPhotoId })}
          />
        ) : (
          <ScopeBuilder
            items={activeDeal.scopeItems}
            rooms={activeDeal.rooms ?? []}
            contingencyEnabled={activeDeal.contingencyEnabled}
            onItemsChange={(scopeItems: ScopeItem[]) => updateActiveDeal({ scopeItems })}
            onRoomsChange={(rooms: CustomRoom[]) => updateActiveDeal({ rooms })}
            onContingencyChange={(contingencyEnabled) =>
              updateActiveDeal({ contingencyEnabled })
            }
          />
        )}
        </fieldset>
      </main>

      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        reason={pricingReason}
      />

    </div>
  );
}
