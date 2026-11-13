"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import FirstVisitLanding from "@/app/components/FirstVisitLanding";
import { createSampleDeal } from "@/app/lib/sample";
import { SAMPLE_ID, SAMPLE_VERSION, OFFER_VERSION } from "@/app/lib/analyticsConstants";
import { trackActivationEvent } from "@/app/lib/analyticsClient";

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
  const [firstVisit, setFirstVisit] = useState(true);
  const [sampleMode, setSampleMode] = useState(false);
  const [sampleDeal, setSampleDeal] = useState<Deal | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("analyzer");
  const [exporting, setExporting] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingReason, setPricingReason] = useState<"deals" | "pdf" | null>(null);
  const [pricingEntryPoint, setPricingEntryPoint] = useState("header_upgrade");
  const [welcomePro, setWelcomePro] = useState(false);
  const [accountPlan, setAccountPlan] = useState<Plan | null>(null);
  // Which deals have used their one free watermarked sample export
  const [freePdfUsed, setFreePdfUsed] = useState<Record<string, boolean>>({});
  const [sampleExported, setSampleExported] = useState(false);
  const checkoutReturn = useRef(false);
  const sampleStartedAt = useRef<number | null>(null);
  const analysisReported = useRef(false);
  const plan = usePlan();
  // Pro if paid on this device OR the signed-in account is Pro
  const isPro = plan === "pro" || accountPlan === "pro";

  // Handle the return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      checkoutReturn.current = true;
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
      if (saved.length > 0) {
        setDeals(saved); // eslint-disable-line react-hooks/set-state-in-effect
        setActiveId(saved[0].id);
        setFirstVisit(false);
      } else if (checkoutReturn.current) {
        const created = [newDeal()];
        setDeals(created);
        setActiveId(created[0].id);
        setFirstVisit(false);
      } else {
        setDeals([previewDeal()]);
        setActiveId(PREVIEW_ID);
        setFirstVisit(true);
      }
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
    if (dealsReady && deals?.some((deal) => deal.id !== PREVIEW_ID)) saveDeals(deals);
  }, [deals, dealsReady]);

  const activeDeal = useMemo(
    () => (sampleMode ? sampleDeal : deals?.find((d) => d.id === activeId) ?? null),
    [sampleMode, sampleDeal, deals, activeId]
  );

  function updateActiveDeal(patch: Partial<Deal>) {
    if (!dealsReady) return;
    if (sampleMode) {
      setSampleDeal((current) => current ? { ...current, ...patch, updatedAt: Date.now() } : current);
      return;
    }
    setDeals((prev) =>
      prev
        ? prev.map((d) =>
            d.id === activeId ? { ...d, ...patch, updatedAt: Date.now() } : d
          )
        : prev
    );
  }

  function handleStartSample() {
    if (!dealsReady) return;
    trackActivationEvent("landing_cta_clicked", "landing", {
      cta_id: "try_sample_deal",
      placement: "hero_primary",
      destination_path: "sample_flow",
      landing_variant: "first_visit_v1",
    });
    const example = createSampleDeal();
    setSampleDeal(example);
    setSampleMode(true);
    setFirstVisit(false);
    setTab("analyzer");
    sampleStartedAt.current = Date.now();
    analysisReported.current = false;
    trackActivationEvent("sample_started", "sample_flow", {
      sample_id: SAMPLE_ID,
      sample_version: SAMPLE_VERSION,
      entry_point: "landing",
      sample_mode: true,
    });
  }

  function handleResetSample() {
    const example = createSampleDeal();
    setSampleDeal(example);
    setTab("analyzer");
    sampleStartedAt.current = Date.now();
    analysisReported.current = false;
    trackActivationEvent("sample_started", "sample_flow", {
      sample_id: SAMPLE_ID,
      sample_version: SAMPLE_VERSION,
      entry_point: "sample_reset",
      sample_mode: true,
    });
  }

  function handleStartWorkspace() {
    if (!dealsReady) return;
    const hasOnlyPreview = deals?.length === 1 && deals[0].id === PREVIEW_ID;
    if (firstVisit || hasOnlyPreview) {
      const created = newDeal();
      setDeals([created]);
      setActiveId(created.id);
      setFirstVisit(false);
    }
    setSampleMode(false);
    setSampleDeal(null);
    setSampleExported(false);
    setTab("analyzer");
  }

  function openPricing(entryPoint: string, reason: "deals" | "pdf" | null = null) {
    setPricingEntryPoint(entryPoint);
    setPricingReason(reason);
    setPricingOpen(true);
  }

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "scope") {
      trackActivationEvent("scope_opened", "scope_builder", {
        scope_view_id: "scope_builder_v1",
        entry_point: sampleMode ? "sample_flow" : "workspace",
        sample_mode: sampleMode,
        analysis_stage: "scope_builder",
      });
    }
  }

  function handleSampleAnalysisComplete() {
    if (!sampleMode || analysisReported.current) return;
    analysisReported.current = true;
    const elapsedSeconds = Math.ceil((Date.now() - (sampleStartedAt.current ?? Date.now())) / 1000);
    const elapsedBucket = elapsedSeconds <= 10
      ? "0_10s"
      : elapsedSeconds <= 30
        ? "11_30s"
        : elapsedSeconds <= 60
          ? "31_60s"
          : "60s_plus";
    trackActivationEvent("first_analysis_complete", "sample_analysis", {
      analysis_mode: "flip",
      result_status: "success",
      sample_version: SAMPLE_VERSION,
      elapsed_bucket: elapsedBucket,
    });
  }

  function handlePricingViewed(entryPoint: string) {
    trackActivationEvent("pricing_viewed", "pricing_modal", {
      offer_version: OFFER_VERSION,
      plan_ids_shown: "free,pro",
      billing_periods_shown: "monthly,annual",
      entry_point: entryPoint,
    });
  }

  function handleNewDeal() {
    if (!dealsReady) return;
    if (!isPro && deals && deals.length >= FREE_DEAL_LIMIT) {
      openPricing("deal_limit", "deals");
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
      openPricing("pdf_limit", "pdf");
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
      if (sampleMode) {
        trackActivationEvent("sample_pdf_exported", "scope_builder", {
          export_format: "pdf",
          sample_version: SAMPLE_VERSION,
          export_mode: "sample",
          export_status: "success",
        });
      }
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

  if (firstVisit && !sampleMode && !restoreFailed) {
    return (
      <>
        <FirstVisitLanding
          disabled={!dealsReady}
          onTrySample={handleStartSample}
          onStartWorkspace={handleStartWorkspace}
          onViewPricing={() => openPricing("landing")}
        />
        <PricingModal
          open={pricingOpen}
          onClose={() => setPricingOpen(false)}
          reason={pricingReason}
          entryPoint={pricingEntryPoint}
          onPricingViewed={handlePricingViewed}
        />
      </>
    );
  }

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
                onClick={() => openPricing("header_upgrade")}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-accent-700/60 text-accent-400 hover:bg-accent-500/10 transition-colors"
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Deal switcher or isolated synthetic sample controls */}
          {sampleMode ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded-full border border-accent-700 bg-accent-950 px-3 py-1.5 text-base font-bold uppercase tracking-wide text-accent-200">
                Sample
              </span>
              <button
                onClick={handleResetSample}
                disabled={!dealsReady}
                className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-base font-semibold text-slate-200 hover:border-slate-500"
              >
                Reset sample
              </button>
              <button
                onClick={handleStartWorkspace}
                disabled={!dealsReady}
                className="shrink-0 rounded-lg bg-accent-500 px-3 py-1.5 text-base font-semibold text-white hover:bg-accent-400"
              >
                Exit sample
              </button>
            </div>
          ) : (
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
          )}

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
                onClick={() => handleTabChange(key)}
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

      {sampleMode && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div role="note" className="flex flex-col gap-3 rounded-xl border border-accent-800/70 bg-accent-950/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base leading-6 text-accent-100">
              <strong className="mr-2">Synthetic sample.</strong>
              This read-only example is never saved. Your existing deals stay untouched.
            </p>
            <button
              onClick={handleStartWorkspace}
              className="shrink-0 rounded-lg border border-accent-700 px-3 py-2 text-base font-semibold text-accent-100 hover:bg-accent-900/50"
            >
              Open my workspace
            </button>
          </div>
        </div>
      )}

      {sampleExported && !isPro && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-accent-800/60 bg-accent-950/30 px-4 py-3">
            <p className="text-sm text-accent-200/90">
              {sampleMode
                ? "Your illustrative sample PDF downloaded. It contains only synthetic data."
                : "Your sample scope PDF downloaded. Go Pro to remove the watermark and export every deal and revision."}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => openPricing("sample_pdf_success", "pdf")}
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
            <h1 id="workspace-heading" className="text-lg font-semibold">{sampleMode ? "Sample deal workspace" : "Your deal workspace"}</h1>
            <p className="mt-1 text-base text-slate-300">
              {sampleMode
                ? "Synthetic example only. It is read-only and is not saved."
                : "No sign-in required to analyze a deal. Deals are saved in this browser, not synced between devices."}
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
            <p className="mt-1 text-base text-slate-200">Your saved data has not been changed. Check that this browser allows site storage, then retry.</p>
            <button onClick={() => setRestoreAttempt((attempt) => attempt + 1)} className="mt-3 rounded-lg border border-amber-700 px-4 py-2 text-base font-semibold text-amber-100">Retry opening deals</button>
          </div>
        )}
        <fieldset disabled={!dealsReady || sampleMode} aria-busy={!dealsReady && !restoreFailed} className="min-w-0">
        {tab === "analyzer" ? (
          <DealAnalyzer
            form={activeDeal.form}
            onFormChange={(form) => updateActiveDeal({ form })}
            rehabFromScope={rehabFromScope}
            onGoToScope={() => handleTabChange("scope")}
            mainPhotoId={activeDeal.mainPhotoId}
            onMainPhotoChange={(mainPhotoId) => updateActiveDeal({ mainPhotoId })}
            onAnalysisComplete={handleSampleAnalysisComplete}
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
        entryPoint={pricingEntryPoint}
        onPricingViewed={handlePricingViewed}
      />

    </div>
  );
}
