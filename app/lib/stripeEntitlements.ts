import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type Stripe from "stripe";
import { OFFER_VERSION } from "@/app/lib/analyticsConstants";

export const CHECKOUT_CLAIM_COOKIE = "flipos_checkout_claim";
export const PRO_ENTITLEMENT_COOKIE = "flipos_pro_entitlement";
export const CHECKOUT_CLAIM_TTL_SECONDS = 30 * 60;
export const PRO_ENTITLEMENT_TTL_SECONDS = 365 * 24 * 60 * 60;

export type StripeBillingEnvironment = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  NODE_ENV?: string;
};

export function createCheckoutClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCheckoutClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function cookieAttributes(environment: StripeBillingEnvironment, maxAge: number): string {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (environment.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function serializeCookie(
  name: string,
  value: string,
  environment: StripeBillingEnvironment,
  maxAge: number
): string {
  return `${name}=${encodeURIComponent(value)}; ${cookieAttributes(environment, maxAge)}`;
}

export function clearCookie(name: string, environment: StripeBillingEnvironment): string {
  return `${name}=; ${cookieAttributes(environment, 0)}`;
}

function signingKey(environment: StripeBillingEnvironment): string | null {
  if (!environment.STRIPE_SECRET_KEY) return null;
  return createHmac("sha256", environment.STRIPE_SECRET_KEY)
    .update("flipos-pro-entitlement-cookie-v1")
    .digest("hex");
}

export function signProEntitlement(
  sessionId: string,
  environment: StripeBillingEnvironment,
  now = Date.now(),
  userId: string | null = null
): string | null {
  const key = signingKey(environment);
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({
    sessionId,
    userId,
    expiresAt: now + PRO_ENTITLEMENT_TTL_SECONDS * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export type SignedEntitlement = { sessionId: string; userId: string | null };

export function readSignedEntitlement(
  value: string | null,
  environment: StripeBillingEnvironment,
  now = Date.now()
): SignedEntitlement | null {
  const key = signingKey(environment);
  if (!key || !value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = createHmac("sha256", key).update(payload).digest("base64url");
  if (!constantTimeEquals(suppliedSignature, expectedSignature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sessionId?: unknown;
      userId?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof decoded.sessionId !== "string" ||
      !/^cs_[A-Za-z0-9_]+$/.test(decoded.sessionId) ||
      (decoded.userId !== undefined && decoded.userId !== null && typeof decoded.userId !== "string") ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= now
    ) {
      return null;
    }
    return {
      sessionId: decoded.sessionId,
      userId: typeof decoded.userId === "string" ? decoded.userId : null,
    };
  } catch {
    return null;
  }
}

export function readSignedEntitlementSessionId(
  value: string | null,
  environment: StripeBillingEnvironment,
  now = Date.now()
): string | null {
  return readSignedEntitlement(value, environment, now)?.sessionId ?? null;
}

async function retrieveActivePaidProSubscription(
  stripe: Stripe,
  sessionId: string,
  environment: StripeBillingEnvironment
): Promise<{ session: Stripe.Checkout.Session; subscription: Stripe.Subscription } | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  const metadata = session.metadata;
  if (
    session.id !== sessionId ||
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    !session.amount_total ||
    metadata?.plan_id !== "pro" ||
    metadata.offer_version !== OFFER_VERSION ||
    (metadata.billing_period !== "monthly" && metadata.billing_period !== "annual")
  ) {
    return null;
  }

  const configuredPrice = metadata.billing_period === "monthly"
    ? environment.STRIPE_PRICE_MONTHLY
    : environment.STRIPE_PRICE_ANNUAL;
  if (!configuredPrice) return null;

  let subscription: Stripe.Subscription | null = null;
  if (typeof session.subscription === "string") {
    subscription = await stripe.subscriptions.retrieve(session.subscription);
  } else if (session.subscription) {
    subscription = session.subscription;
  }

  if (
    !subscription ||
    !["active", "trialing"].includes(subscription.status) ||
    !subscription.items.data.some((item) => item.price.id === configuredPrice)
  ) {
    return null;
  }

  const linkedUserId = session.client_reference_id;
  if (
    linkedUserId &&
    subscription.metadata.clerkUserId &&
    subscription.metadata.clerkUserId !== linkedUserId
  ) {
    return null;
  }

  return { session, subscription };
}

export async function verifyPaidProCheckout(
  stripe: Stripe,
  sessionId: string,
  claimToken: string | null,
  environment: StripeBillingEnvironment,
  currentUserId: string | null = null
): Promise<{ session: Stripe.Checkout.Session; subscription: Stripe.Subscription } | null> {
  if (!claimToken) return null;
  const result = await retrieveActivePaidProSubscription(stripe, sessionId, environment);
  if (!result) return null;
  const { session } = result;

  if (!constantTimeEquals(
    session.metadata?.checkout_claim_hash ?? "",
    hashCheckoutClaimToken(claimToken)
  )) {
    return null;
  }
  if (session.client_reference_id && session.client_reference_id !== currentUserId) {
    return null;
  }

  return result;
}

/** Revalidates a previously claimed session using the server-signed entitlement cookie. */
export async function verifyStoredProEntitlement(
  stripe: Stripe,
  sessionId: string,
  environment: StripeBillingEnvironment
): Promise<{ session: Stripe.Checkout.Session; subscription: Stripe.Subscription } | null> {
  return retrieveActivePaidProSubscription(stripe, sessionId, environment);
}
