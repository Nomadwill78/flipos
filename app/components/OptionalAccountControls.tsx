"use client";

import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Plan } from "@/app/lib/plan";

type AccountProps = { onPlan: (plan: Plan | null) => void };

// Optional auth is neither a server-rendering dependency nor an ancestor of
// the calculator. Its separate chunk can load after the guest workspace.
const AccountControls = dynamic<AccountProps>(() => import("./AuthControls"), {
  ssr: false,
  loading: () => <p role="status" className="text-base text-slate-400">Loading optional sign-in… You can keep analyzing.</p>,
});

class AccountBoundary extends Component<AccountProps & { children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("Optional FlipOS sign-in is unavailable", error);
    this.props.onPlan(null);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="shrink-0 sm:max-w-72">
          <p role="status" className="text-base text-slate-300">Sign-in is unavailable. You can still use the analyzer.</p>
          <button onClick={() => this.setState({ failed: false })} className="mt-2 rounded-lg border border-slate-700 px-4 py-2 text-base font-semibold text-slate-200">Retry sign-in</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function OptionalAccountControls({ onPlan }: AccountProps) {
  return (
    <AccountBoundary onPlan={onPlan}>
      <AccountControls onPlan={onPlan} />
    </AccountBoundary>
  );
}
