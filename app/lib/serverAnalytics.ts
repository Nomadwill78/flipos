import { createHash, randomUUID } from "node:crypto";
import { track } from "@vercel/analytics/server";
import type Stripe from "stripe";
import {
  ACTIVATION_FLOW_VARIANT,
  ANALYTICS_SCHEMA_VERSION,
  OFFER_VERSION,
  UUID_PATTERN,
} from "@/app/lib/analyticsConstants";

const PROCESSING_TTL_SECONDS = 15 * 60;
const COMPLETED_TTL_SECONDS = 90 * 24 * 60 * 60;
const CONSENT_REVOKED_TTL_SECONDS = 90 * 24 * 60 * 60;
const COMPLETE_CLAIM_SCRIPT =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then redis.call("SET", KEYS[1], "done", "EX", ARGV[2]); return 1 else return 0 end';
const RELEASE_CLAIM_SCRIPT =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

type RedisConfig = { url: string; token: string };
type PaidSuccessClaim = { config: RedisConfig; key: string; token: string };

function getRedisConfig(): RedisConfig {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Paid-success analytics requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("UPSTASH_REDIS_REST_URL must use HTTPS");
  }

  return { url: parsedUrl.toString(), token };
}

async function redisCommand<T>(config: RedisConfig, command: string[]): Promise<T> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash Redis request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new Error("Upstash Redis command failed");
  return payload.result as T;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function consentRevocationKey(anonSessionId: string): string {
  return `flipos:analytics:consent-revoked:v1:${hashIdentifier(anonSessionId)}`;
}

function paidSuccessKey(sessionId: string): string {
  return `flipos:analytics:paid-success:v1:${hashIdentifier(sessionId)}`;
}

export async function recordPaidSuccessConsentRevocations(anonSessionIds: string[]): Promise<void> {
  const config = getRedisConfig();
  const uniqueIds = [...new Set(anonSessionIds)].filter((id) => UUID_PATTERN.test(id)).slice(0, 20);
  for (const anonSessionId of uniqueIds) {
    await redisCommand(config, [
      "SET",
      consentRevocationKey(anonSessionId),
      "revoked",
      "EX",
      String(CONSENT_REVOKED_TTL_SECONDS),
    ]);
  }
}

async function claimPaidSuccess(sessionId: string, config: RedisConfig): Promise<PaidSuccessClaim | null> {
  const key = paidSuccessKey(sessionId);
  const token = randomUUID();

  const claimResult = await redisCommand<string | null>(config, [
    "SET",
    key,
    token,
    "NX",
    "EX",
    String(PROCESSING_TTL_SECONDS),
  ]);
  if (claimResult === "OK") return { config, key, token };

  const currentValue = await redisCommand<string | null>(config, ["GET", key]);
  if (currentValue === "done") return null;
  if (currentValue !== null) {
    throw new Error("A paid-success webhook for this session is already processing");
  }

  // The first claim may have expired between SET and GET. Make one fresh attempt.
  const retryToken = randomUUID();
  const retryResult = await redisCommand<string | null>(config, [
    "SET",
    key,
    retryToken,
    "NX",
    "EX",
    String(PROCESSING_TTL_SECONDS),
  ]);
  if (retryResult === "OK") return { config, key, token: retryToken };

  const latestValue = await redisCommand<string | null>(config, ["GET", key]);
  if (latestValue === "done") return null;
  throw new Error("A paid-success webhook for this session is already processing");
}

async function completePaidSuccessClaim(claim: PaidSuccessClaim): Promise<void> {
  const result = await redisCommand<number>(claim.config, [
    "EVAL",
    COMPLETE_CLAIM_SCRIPT,
    "1",
    claim.key,
    claim.token,
    String(COMPLETED_TTL_SECONDS),
  ]);
  if (result !== 1) throw new Error("Could not finalize the paid-success deduplication claim");
}

async function releasePaidSuccessClaim(claim: PaidSuccessClaim): Promise<void> {
  await redisCommand<number>(claim.config, [
    "EVAL",
    RELEASE_CLAIM_SCRIPT,
    "1",
    claim.key,
    claim.token,
  ]);
}

export async function trackVerifiedPaidSuccess(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription" || session.payment_status !== "paid") return;

  const metadata = session.metadata;
  const billingPeriod = metadata?.billing_period;
  const anonSessionId = metadata?.anon_session_id;
  const amount = session.amount_total;
  const currency = session.currency;

  if (
    metadata?.analytics_consent !== "granted" ||
    metadata?.plan_id !== "pro" ||
    metadata?.offer_version !== OFFER_VERSION ||
    (billingPeriod !== "monthly" && billingPeriod !== "annual") ||
    !anonSessionId ||
    !UUID_PATTERN.test(anonSessionId) ||
    amount === null ||
    !Number.isFinite(amount) ||
    !currency
  ) {
    return;
  }

  const config = getRedisConfig();
  const claim = await claimPaidSuccess(session.id, config);
  if (!claim) return;

  // Check revocation after taking the per-session claim and immediately before sending.
  // Events already accepted by the analytics provider cannot be recalled.
  const revocation = await redisCommand<string | null>(config, [
    "GET",
    consentRevocationKey(anonSessionId),
  ]);
  if (revocation === "revoked") {
    await releasePaidSuccessClaim(claim);
    return;
  }

  const purchaseRef = createHash("sha256").update(session.id).digest("hex").slice(0, 20);
  try {
    await track(
      "paid_success",
      {
        event_id: randomUUID(),
        event_ts_utc: new Date().toISOString(),
        schema_version: ANALYTICS_SCHEMA_VERSION,
        anon_session_id: anonSessionId,
        flow_variant: ACTIVATION_FLOW_VARIANT,
        route_id: "stripe_webhook",
        device_class: "unknown",
        consent_state: "granted",
        plan_id: "pro",
        billing_period: billingPeriod,
        price_amount: amount / 100,
        currency,
        offer_version: OFFER_VERSION,
        purchase_ref: purchaseRef,
      },
      // Do not forward request headers, which could include IP, cookie, or user-agent data.
      { headers: {} }
    );
  } catch (error) {
    try {
      await releasePaidSuccessClaim(claim);
    } catch {
      console.error("Could not release the paid-success deduplication claim");
    }
    throw error;
  }

  // If this write fails, keep the processing lease until it expires.
  await completePaidSuccessClaim(claim);
}
