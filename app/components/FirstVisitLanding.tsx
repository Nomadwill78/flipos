"use client";

interface FirstVisitLandingProps {
  disabled: boolean;
  onTrySample: () => void;
  onStartWorkspace: () => void;
  onViewPricing: () => void;
}

const SAMPLE_METRICS = [
  ["Purchase price", "$150,000"],
  ["Rehab budget", "$46,000"],
  ["After-repair value", "$275,000"],
] as const;

export default function FirstVisitLanding({
  disabled,
  onTrySample,
  onStartWorkspace,
  onViewPricing,
}: FirstVisitLandingProps) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-500 text-base font-bold text-white">FO</div>
            <div>
              <p className="text-lg font-bold tracking-tight"><span className="text-accent-400">Flip</span>OS</p>
              <p className="text-base text-slate-400">Fix and flip deal analysis</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onViewPricing}
            disabled={disabled}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-base font-semibold text-slate-200 transition-colors hover:border-accent-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            View plans
          </button>
        </header>

        <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-20" aria-labelledby="landing-title">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-accent-800 bg-accent-950/50 px-4 py-2 text-base font-semibold uppercase tracking-[0.12em] text-accent-200">
              Analyze before you make an offer
            </p>
            <h1 id="landing-title" className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Know the numbers before you write the offer.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              See the cost stack, test the 70% rule, and shape a rehab scope in one focused workspace. Start with a synthetic example, then move to your own deal when you are ready.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onTrySample}
                disabled={disabled}
                className="rounded-xl bg-accent-500 px-6 py-4 text-base font-bold text-white shadow-lg shadow-accent-950/50 transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Try a sample deal
              </button>
              <button
                type="button"
                onClick={onStartWorkspace}
                disabled={disabled}
                className="rounded-xl border border-slate-700 px-6 py-4 text-base font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start with my own deal
              </button>
            </div>
            <p className="mt-5 text-base text-slate-400">
              No sign-in required. Your real deals are saved in this browser and are not synced between devices.
            </p>
          </div>

          <aside className="relative overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/30 sm:p-8" aria-label="Synthetic sample deal preview">
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full border border-accent-500/20 shadow-[0_0_0_24px_rgba(61,90,254,0.04),0_0_0_48px_rgba(61,90,254,0.03)]" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold uppercase tracking-[0.12em] text-accent-300">Illustrative example</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">Sample flip snapshot</h2>
                </div>
                <span className="rounded-full border border-accent-700 bg-accent-950 px-3 py-1.5 text-base font-bold text-accent-200">SAMPLE</span>
              </div>
              <div className="mt-6 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950/60 px-4">
                {SAMPLE_METRICS.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-4">
                    <span className="text-base text-slate-300">{label}</span>
                    <span className="font-mono text-base font-semibold tabular-nums text-white">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-base leading-6 text-slate-300">
                  This is fictional sample data. It is read-only, stays separate from saved deals, and is never included in analytics.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-800/70 p-4">
                  <h3 className="text-base font-semibold text-white">Deal Analyzer</h3>
                  <p className="mt-2 text-base leading-6 text-slate-300">Review projected costs, returns, and the 70% rule.</p>
                </div>
                <div className="rounded-xl bg-slate-800/70 p-4">
                  <h3 className="text-base font-semibold text-white">Scope Builder</h3>
                  <p className="mt-2 text-base leading-6 text-slate-300">See itemized rehab work and export a sample PDF.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <footer className="border-t border-slate-800 py-5 text-base text-slate-400">
          FlipOS works without an account. Use the sample to inspect the workflow or open a separate real deal.
        </footer>
      </div>
    </main>
  );
}
