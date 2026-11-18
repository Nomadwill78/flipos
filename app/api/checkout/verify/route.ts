import Stripe from "stripe";
import { isAuthConfigured } from "@/app/lib/authConfig";
import { setAccountPlan } from "@/app/lib/accountEntitlements";
import {
  CHECKOUT_CLAIM_COOKIE,
  PRO_ENTITLEMENT_COOKIE,
  PRO_ENTITLEMENT_TTL_SECONDS,
  clearCookie,
  readCookie,
  serializeCookie,
  signProEntitlement,
  verifyPaidProCheckout,
} from "@/app/lib/stripeEntitlements";

export async function POST(request: Request) {
  const environment = process.env;
  if (!environment.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Payment verification is not configured." }, { status: 503 });
  }

  let sessionId: unknown;
  try {
    sessionId = (await request.json())?.sessionId;
  } catch {
    return Response.json({ error: "A Checkout Session is required." }, { status: 400 });
  }
  if (typeof sessionId !== "string" || sessionId.length > 255) {
    return Response.json({ error: "A Checkout Session is required." }, { status: 400 });
  }

  let currentUserId: string | null = null;
  if (isAuthConfigured({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: environment.CLERK_SECRET_KEY,
  })) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      currentUserId = (await auth()).userId;
    } catch {
      // Guest sessions are verified with their browser claim cookie.
    }
  }

  const claimToken = readCookie(request.headers.get("cookie"), CHECKOUT_CLAIM_COOKIE);
  try {
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const verified = await verifyPaidProCheckout(
      stripe,
      sessionId,
      claimToken,
      environment,
      currentUserId
    );
    if (!verified) {
      return Response.json(
        { error: "This payment could not be verified for this browser." },
        { status: 403 }
      );
    }

    const entitlement = signProEntitlement(
      verified.session.id,
      environment,
      Date.now(),
      verified.session.client_reference_id ?? null
    );
    if (!entitlement) {
      return Response.json({ error: "Payment verification is not configured." }, { status: 503 });
    }

    if (verified.session.client_reference_id && currentUserId) {
      try {
        await setAccountPlan(currentUserId, "pro");
      } catch (error) {
        // Stripe remains authoritative; the webhook can retry account synchronization.
        console.error("Could not sync verified Checkout Session to Clerk", error);
      }
    }

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeCookie(PRO_ENTITLEMENT_COOKIE, entitlement, environment, PRO_ENTITLEMENT_TTL_SECONDS)
    );
    headers.append("Set-Cookie", clearCookie(CHECKOUT_CLAIM_COOKIE, environment));
    return Response.json({ plan: "pro" }, { headers });
  } catch (error) {
    console.error("Stripe Checkout verification failed:", error);
    return Response.json({ error: "Payment verification is temporarily unavailable." }, { status: 503 });
  }
}
