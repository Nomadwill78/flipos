"use client";

import { useEffect } from "react";
import { ClerkProvider, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import type { Plan } from "@/app/lib/plan";

// Clerk is an account-only island. It never wraps the guest calculator or
// saved-deal restoration, so account loading cannot hold the workspace open.
export default function AccountControls({
  onPlan,
}: {
  onPlan: (plan: Plan | null) => void;
}) {
  return (
    <ClerkProvider appearance={{ theme: dark, variables: { colorPrimary: "#3d5afe" } }}>
      <AuthControls />
      <AccountPlanSync onPlan={onPlan} />
    </ClerkProvider>
  );
}

export function AuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <p role="status" className="text-base text-slate-400">Loading optional sign-in… You can keep analyzing.</p>;
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          title="Sign in to link your Pro subscription. Your deals stay in this browser."
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-base font-semibold text-slate-200 transition-colors hover:border-accent-500 hover:text-accent-400"
        >
          Sign in (optional)
        </button>
      </SignInButton>
    );
  }

  return (
    <span className="shrink-0 flex items-center">
      <UserButton />
    </span>
  );
}

/** Reads the account's webhook-verified plan without gating the workspace. */
export function AccountPlanSync({
  onPlan,
}: {
  onPlan: (plan: Plan | null) => void;
}) {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      onPlan(null);
      return;
    }
    onPlan(user.publicMetadata?.plan === "pro" ? "pro" : "free");
  }, [user, isLoaded, onPlan]);

  return null;
}
