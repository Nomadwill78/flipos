"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  filterAnalyticsPageview,
  filterSpeedInsight,
  clearPendingAnalyticsRevocationIds,
  getPendingAnalyticsRevocationIds,
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from "@/app/lib/analyticsClient";
import type { AnalyticsConsent as ConsentChoice } from "@/app/lib/analyticsConstants";

export default function AnalyticsConsent() {
  const choice = useSyncExternalStore<ConsentChoice>(
    subscribeToAnalyticsConsent,
    getAnalyticsConsent,
    () => "unknown"
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revocationIds, setRevocationIds] = useState<string[]>([]);

  useEffect(() => {
    const ids = [...new Set([...getPendingAnalyticsRevocationIds(), ...revocationIds])].slice(0, 20);
    if (ids.length === 0) return;

    let current = true;
    void fetch("/api/analytics/consent-revocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonSessionIds: ids }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) return;
        clearPendingAnalyticsRevocationIds(ids);
        if (current) {
          setRevocationIds((pending) => pending.filter((id) => !ids.includes(id)));
        }
      })
      .catch(() => undefined);

    return () => {
      current = false;
    };
  }, [revocationIds]);

  function choose(nextChoice: Exclude<ConsentChoice, "unknown">) {
    const revokedSessionIds = setAnalyticsConsent(nextChoice);
    if (nextChoice === "denied") setRevocationIds(revokedSessionIds);
    setSettingsOpen(false);
  }

  const showChoices = choice === "unknown" || settingsOpen;

  return (
    <>
      {choice === "granted" && (
        <>
          <Analytics beforeSend={filterAnalyticsPageview} />
          <SpeedInsights beforeSend={filterSpeedInsight} />
        </>
      )}

      {showChoices ? (
        <aside
          role="region"
          aria-label="Optional analytics settings"
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/50 sm:inset-x-6 sm:bottom-6 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-white">Optional usage and performance measurement</h2>
              <p className="mt-2 text-base leading-6 text-slate-300">
                If you allow it, FlipOS measures page views, performance, and a short list of product events. Product events exclude deal inputs, property addresses, photos, and payment details. FlipOS adds no persistent user or device ID to these events, and page routes are sent without query strings.
              </p>
              <p className="mt-2 text-base leading-6 text-slate-400">
                For up to seven days after starting Checkout, a temporary anonymous session ID may be stored in this browser. If you withdraw consent, FlipOS queues it only until the server confirms suppression or the seven-day period expires.
              </p>
              <p className="mt-2 text-base text-slate-400">You can change this choice later in Privacy settings.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
              <button
                type="button"
                onClick={() => choose("granted")}
                className="rounded-lg bg-accent-500 px-4 py-2.5 text-base font-semibold text-white hover:bg-accent-400"
              >
                Allow optional analytics
              </button>
              <button
                type="button"
                onClick={() => choose("denied")}
                className="rounded-lg border border-slate-600 px-4 py-2.5 text-base font-semibold text-slate-200 hover:bg-slate-800"
              >
                Not now
              </button>
              {choice !== "unknown" && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg px-4 py-2.5 text-base font-semibold text-slate-400 hover:text-white"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="fixed bottom-3 right-3 z-40 rounded-full border border-slate-700 bg-slate-900 px-4 py-2.5 text-base font-semibold text-slate-300 shadow-lg hover:border-accent-500 hover:text-white sm:bottom-6 sm:right-6"
        >
          Privacy settings
        </button>
      )}
    </>
  );
}
