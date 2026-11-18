import Stripe from "stripe";
import { isAuthConfigured } from "@/app/lib/authConfig";
import {
  PRO_ENTITLEMENT_COOKIE,
  clearCookie,
  readCookie,
  readSignedEntitlement,
  verifyStoredProEntitlement,
} from "@/app/lib/stripeEntitlements";

function freeResponse(headers = new Headers(), status = 200) {
  headers.set("Cache-Control", "no-store");
  return Response.json({ plan: "free" }, { headers, status });
}

export async function GET(request: Request) {
  const environment = process.env;
  if (!environment.STRIPE_SECRET_KEY) {
    return freeResponse(new Headers(), 503);
  }

  const cookie = readCookie(request.headers.get("cookie"), PRO_ENTITLEMENT_COOKIE);
  const entitlement = readSignedEntitlement(cookie, environment);
  if (!entitlement) {
    const headers = new Headers();
    if (cookie) headers.append("Set-Cookie", clearCookie(PRO_ENTITLEMENT_COOKIE, environment));
    return freeResponse(headers);
  }

  if (entitlement.userId) {
    if (!isAuthConfigured({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: environment.CLERK_SECRET_KEY,
    })) {
      return freeResponse();
    }

    try {
      const { auth } = await import("@clerk/nextjs/server");
      const currentUserId = (await auth()).userId;
      if (currentUserId !== entitlement.userId) return freeResponse();
    } catch (error) {
      console.error("Could not verify the account for a Pro entitlement", error);
      return freeResponse(new Headers(), 503);
    }
  }

  try {
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const verified = await verifyStoredProEntitlement(stripe, entitlement.sessionId, environment);
    if (
      !verified ||
      (verified.session.client_reference_id ?? null) !== entitlement.userId
    ) {
      const headers = new Headers();
      headers.append("Set-Cookie", clearCookie(PRO_ENTITLEMENT_COOKIE, environment));
      return freeResponse(headers);
    }
    return Response.json(
      { plan: "pro" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Stripe entitlement check failed:", error);
    return Response.json(
      { plan: "free", verificationUnavailable: true },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
