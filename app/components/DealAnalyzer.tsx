"use client";

import { useEffect, useMemo } from "react";
import type { DealForm, FinancingType, Strategy } from "@/app/lib/types";
import { STRATEGIES } from "@/app/lib/types";
import { computeResults, DEFAULT_ASSUMPTIONS } from "@/app/lib/analysis";
import { MainPhotoPicker } from "@/app/components/PhotoPicker";
import RentalAnalyzer from "@/app/components/RentalAnalyzer";
import BrrrrAnalyzer from "@/app/components/BrrrrAnalyzer";
import CommercialAnalyzer from "@/app/components/CommercialAnalyzer";
import {
  usd,
  usdExact,
  pct,
  inputClass,
  LabelText,
  MoneyField,
  SuffixField,
  AssumptionField,
  CostRow,
  Segmented,
  MetricGrid,
  EmptyState,
  RehabField,
  ScopeSyncHint,
  InputCard,
  TotalRow,
  RuleCard,
  InfoCard,
  VerdictCard,
} from "@/app/components/analyzerUi";

// Flip math lives in app/lib/analysis now; re-exported here so existing
// imports keep working.
export { computeResults, DEFAULT_ASSUMPTIONS } from "@/app/lib/analysis";
export type { Results, Assumptions } from "@/app/lib/analysis";

const FLIP_FINANCING_OPTIONS = [
  { key: "cash" as FinancingType, label: "Cash" },
  { key: "hardmoney" as FinancingType, label: "Hard Money" },
];

interface DealAnalyzerProps {
  form: DealForm;
  onFormChange: (form: DealForm) => void;
  rehabFromScope: number | null;
  onGoToScope: () => void;
  mainPhotoId: string | null | undefined;
  onMainPhotoChange: (photoId: string | null) => void;
  onAnalysisComplete?: () => void;
}

export default function DealAnalyzer(props: DealAnalyzerProps) {
  const { form, onFormChange, mainPhotoId, onMainPhotoChange } = props;
  const strategy: Strategy = form.strategy ?? "flip";

  // Photo, strategy picker, and address — shared by every strategy screen.
  const common = (
    <>
      <MainPhotoPicker photoId={mainPhotoId} onChange={onMainPhotoChange} />

      <div className="mb-4">
        <LabelText>Strategy</LabelText>
        <Segmented
          options={STRATEGIES}
          value={strategy}
          onChange={(s) => onFormChange({ ...form, strategy: s })}
        />
      </div>

      <div className="mb-4">
        <LabelText>Property Address</LabelText>
        <input
          type="text"
          value={form.address}
          onChange={(e) => onFormChange({ ...form, address: e.target.value })}
          placeholder="123 Main St, City, ST 00000"
          className={inputClass("px-3")}
        />
      </div>
    </>
  );

  if (strategy === "rental") return <RentalAnalyzer {...props} common={common} />;
  if (strategy === "brrrr") return <BrrrrAnalyzer {...props} common={common} />;
  if (strategy === "commercial") return <CommercialAnalyzer {...props} common={common} />;
  return <FlipAnalyzer {...props} common={common} />;
}

// ── Flip ──────────────────────────────────────────────────────────────────────

function FlipAnalyzer({
  form,
  onFormChange,
  rehabFromScope,
  onGoToScope,
  onAnalysisComplete,
  common,
}: DealAnalyzerProps & { common: React.ReactNode }) {
  const set = (patch: Partial<DealForm>) => onFormChange({ ...form, ...patch });
  const isHM = form.financingType === "hardmoney";
  const scopeLinked = rehabFromScope !== null;

  const results = useMemo(() => computeResults(form, rehabFromScope), [form, rehabFromScope]);

  useEffect(() => {
    if (results) onAnalysisComplete?.();
  }, [results, onAnalysisComplete]);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-6 space-y-6 lg:space-y-0">
      {/* ── INPUTS ── */}
      <section className="space-y-4">
        <InputCard>
          {common}

          {/* 2-col price grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MoneyField
              label="Purchase Price"
              value={form.purchasePrice}
              placeholder="250000"
              onChange={(v) => set({ purchasePrice: v })}
            />
            <MoneyField
              label="ARV"
              value={form.arv}
              placeholder="380000"
              onChange={(v) => set({ arv: v })}
            />
            <RehabField
              value={form.rehabBudget}
              onChange={(v) => set({ rehabBudget: v })}
              rehabFromScope={rehabFromScope}
              onGoToScope={onGoToScope}
            />
            <SuffixField
              label="Holding Period"
              value={form.holdingDays}
              placeholder="90"
              suffix="days"
              onChange={(v) => set({ holdingDays: v })}
            />
          </div>

          <ScopeSyncHint rehabFromScope={rehabFromScope} onGoToScope={onGoToScope} />

          {/* Financing toggle */}
          <div className="mb-4">
            <LabelText>Financing Type</LabelText>
            <Segmented
              options={FLIP_FINANCING_OPTIONS}
              value={form.financingType}
              onChange={(financingType) => set({ financingType })}
            />
          </div>

          {/* Hard money options */}
          {isHM && (
            <div className="rounded-lg border border-accent-900/40 bg-accent-950/20 p-3">
              <p className="text-xs text-accent-600/80 mb-3 uppercase tracking-wider font-medium">
                Hard Money Terms
              </p>
              <div className="grid grid-cols-2 gap-3">
                <SuffixField
                  label="Annual Rate"
                  value={form.hardMoneyRate}
                  placeholder="12"
                  suffix="%"
                  step="0.5"
                  onChange={(v) => set({ hardMoneyRate: v })}
                />
                <SuffixField
                  label="Points"
                  value={form.hardMoneyPoints}
                  placeholder="2"
                  suffix="%"
                  step="0.5"
                  onChange={(v) => set({ hardMoneyPoints: v })}
                />
              </div>
            </div>
          )}
        </InputCard>

        {/* Editable assumptions */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Assumptions
            </p>
            <button
              onClick={() =>
                set({
                  buyClosingPct: "",
                  sellClosingPct: "",
                  monthlyCarryPct: "",
                  taxRatePct: "",
                })
              }
              className="text-[10px] font-medium text-slate-500 hover:text-accent-400 transition-colors"
            >
              Reset defaults
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <AssumptionField
              label="Buy closing"
              value={form.buyClosingPct ?? ""}
              placeholder={String(DEFAULT_ASSUMPTIONS.buyClosingPct)}
              onChange={(v) => set({ buyClosingPct: v })}
            />
            <AssumptionField
              label="Sell closing"
              value={form.sellClosingPct ?? ""}
              placeholder={String(DEFAULT_ASSUMPTIONS.sellClosingPct)}
              onChange={(v) => set({ sellClosingPct: v })}
            />
            <AssumptionField
              label="Carry / mo"
              value={form.monthlyCarryPct ?? ""}
              placeholder={String(DEFAULT_ASSUMPTIONS.monthlyCarryPct)}
              onChange={(v) => set({ monthlyCarryPct: v })}
            />
            <AssumptionField
              label="Tax rate"
              value={form.taxRatePct ?? ""}
              placeholder={String(DEFAULT_ASSUMPTIONS.taxRatePct)}
              onChange={(v) => set({ taxRatePct: v })}
            />
          </div>
          <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
            Sell closing (% of ARV) covers agent commission plus transfer taxes &amp; fees — tune
            it to your market. Blank fields use the defaults shown.
          </p>
        </div>
      </section>

      {/* ── RESULTS ── */}
      <section className="space-y-4">
        {results ? (
          <>
            {/* Verdict — the one loud read on every deal */}
            <VerdictCard
              address={form.address.trim()}
              amount={usd(Math.abs(results.grossProfit))}
              positive={results.grossProfit > 0}
              badge={results.grossProfit > 0 ? "▲ Profitable" : "▼ Loss"}
              caption={`Projected gross profit · ARV ${usd(parseFloat(form.arv))}`}
            />

            {/* Cost Stack */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h2 className="text-sm font-semibold text-accent-400 uppercase tracking-wider mb-4">
                Cost Stack Breakdown
              </h2>
              <div className="space-y-0.5">
                <CostRow label="Purchase Price" value={results.costStack.purchasePrice} />
                <CostRow
                  label={scopeLinked ? "Rehab Budget (from scope)" : "Rehab Budget"}
                  value={results.costStack.rehabBudget}
                />
                <CostRow
                  label={`Buy Closing Costs (${results.assumptions.buyClosingPct}%)`}
                  value={results.costStack.buyClosingCosts}
                />
                <CostRow
                  label={`Sell Closing Costs (${results.assumptions.sellClosingPct}% ARV)`}
                  value={results.costStack.sellClosingCosts}
                />
                <CostRow
                  label={`Carrying Costs (${results.assumptions.monthlyCarryPct}%/mo × ${parseFloat(form.holdingDays) > 0 ? (parseFloat(form.holdingDays) / 30).toFixed(1) : "0"}mo)`}
                  value={results.costStack.carryingCosts}
                />
                {isHM && (
                  <>
                    <CostRow
                      label={`Hard Money Interest (${form.hardMoneyRate}% APR)`}
                      value={results.costStack.hardMoneyInterest}
                    />
                    <CostRow
                      label={`Hard Money Points (${form.hardMoneyPoints}%)`}
                      value={results.costStack.hardMoneyPointsCost}
                    />
                  </>
                )}
              </div>
              <TotalRow label="Total Cost Stack" value={results.costStack.total} />

              {/* ARV cost bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Costs as % of ARV</span>
                  <span className="text-slate-400 tabular-nums">
                    {pct(results.costPct)} of {usd(parseFloat(form.arv))}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      results.grossProfit > 0 ? "bg-accent-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, results.arvPct)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-600">$0</span>
                  <span
                    className={`font-medium tabular-nums ${
                      results.grossProfit > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {results.grossProfit >= 0 ? "+" : ""}
                    {pct((results.grossProfit / parseFloat(form.arv)) * 100)} margin
                  </span>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <MetricGrid
              metrics={[
                {
                  label: "ROI",
                  value: pct(results.roi),
                  positive: results.roi > 0,
                  sub: "on total invested",
                },
                {
                  label: "Net After Tax",
                  value: usd(results.netAfterTax),
                  positive: results.netAfterTax > 0,
                  sub: `${results.assumptions.taxRatePct}% tax rate`,
                },
                {
                  label: "Margin",
                  value: pct((results.grossProfit / parseFloat(form.arv)) * 100),
                  positive: results.grossProfit > 0,
                  sub: "of ARV",
                },
              ]}
            />

            {/* 70% Rule + Daily Holding */}
            <div className="grid grid-cols-2 gap-3">
              <RuleCard
                passes={results.seventyPctPasses}
                title="70% Rule"
                subtitle="Max allowable purchase"
                value={usd(results.maxAllowable)}
                footnote="(ARV × 70%) − Rehab"
                failMessage={
                  results.maxAllowable > 0
                    ? `Negotiate ${usd(
                        results.costStack.purchasePrice - results.maxAllowable
                      )} off to pass`
                    : "Rehab is too high — no purchase price passes at this ARV"
                }
              />

              <InfoCard
                icon="◷"
                title="Daily Hold Cost"
                subtitle={isHM ? "Carry + financing per day" : "Carry costs per day"}
                value={usd(results.dailyHoldingCost)}
                footnote={
                  isHM ? (
                    <>
                      Carry {usdExact(results.dailyCarry)} · Interest{" "}
                      {usdExact(results.dailyInterest)}
                      {results.dailyPoints > 0 && <> · Points {usdExact(results.dailyPoints)}</>} /day
                      × {form.holdingDays} days
                    </>
                  ) : (
                    <>× {form.holdingDays} days</>
                  )
                }
              />
            </div>
          </>
        ) : (
          <EmptyState subtitle="Fill in purchase price, ARV, rehab, and holding period" />
        )}
      </section>
    </div>
  );
}
