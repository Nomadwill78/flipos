import { track } from "@vercel/analytics";
import type { BeforeSendEvent } from "@vercel/analytics";
import type { BeforeSendMiddleware } from "@vercel/speed-insights";
import {
  ACTIVATION_FLOW_VARIANT,
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_SCHEMA_VERSION,
  OFFER_VERSION,
  SAMPLE_ID,
  SAMPLE_VERSION,
  type ActivationEventName,
  type AnalyticsConsent,
} from "@/app/lib/analyticsConstants";
import { PRICING } from "@/app/lib/plan";

let consentPreference: AnalyticsConsent = "unknown";
let ephemeralSessionId: string | null = null;
const CONSENT_CHANGE_EVENT = "flipos-analytics-consent-change";
const PENDING_CHECKOUT_IDS_KEY = "flipos.pendingCheckoutAnalyticsIds.v1";
const PENDING_REVOCATIONS_KEY = "flipos.pendingAnalyticsRevocations.v1";
const PENDING_CHECKOUT_IDS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_ROUTE_IDS = new Set([
  "landing",
  "sample_flow",
  "sample_analysis",
  "scope_builder",
  "pricing_modal",
  "checkout",
  "stripe_webhook",
]);
const SAFE_PAGE_PATHS = new Set(["/", "/_not-found"]);

type EventValue = string | number | boolean | null;
type PropertyValidator = (value: EventValue) => boolean;

const stringOneOf = (allowed: string[]): PropertyValidator =>
  (value) => typeof value === "string" && allowed.includes(value);
const numberOneOf = (allowed: number[]): PropertyValidator =>
  (value) => typeof value === "number" && allowed.includes(value);
const isBoolean: PropertyValidator = (value) => typeof value === "boolean";
const isPurchaseReference: PropertyValidator = (value) =>
  typeof value === "string" && /^[0-9a-f]{20}$/.test(value);

const EVENT_PROPERTY_RULES: Record<ActivationEventName, Record<string, PropertyValidator>> = {
  landing_cta_clicked: {
    cta_id: stringOneOf(["try_sample_deal"]),
    placement: stringOneOf(["hero_primary"]),
    destination_path: stringOneOf(["sample_flow"]),
    landing_variant: stringOneOf([ACTIVATION_FLOW_VARIANT]),
  },
  sample_started: {
    sample_id: stringOneOf([SAMPLE_ID]),
    sample_version: stringOneOf([SAMPLE_VERSION]),
    entry_point: stringOneOf(["landing", "sample_reset"]),
    sample_mode: isBoolean,
  },
  first_analysis_complete: {
    analysis_mode: stringOneOf(["flip"]),
    result_status: stringOneOf(["success"]),
    sample_version: stringOneOf([SAMPLE_VERSION]),
    elapsed_bucket: stringOneOf(["0_10s", "11_30s", "31_60s", "60s_plus"]),
  },
  scope_opened: {
    scope_view_id: stringOneOf(["scope_builder_v1"]),
    entry_point: stringOneOf(["sample_flow", "workspace"]),
    sample_mode: isBoolean,
    analysis_stage: stringOneOf(["scope_builder"]),
  },
  sample_pdf_exported: {
    export_format: stringOneOf(["pdf"]),
    sample_version: stringOneOf([SAMPLE_VERSION]),
    export_mode: stringOneOf(["sample"]),
    export_status: stringOneOf(["success"]),
  },
  pricing_viewed: {
    offer_version: stringOneOf([OFFER_VERSION]),
    plan_ids_shown: stringOneOf(["free,pro"]),
    billing_periods_shown: stringOneOf(["monthly,annual"]),
    entry_point: stringOneOf([
      "landing",
      "header_upgrade",
      "deal_limit",
      "pdf_limit",
      "sample_pdf_success",
    ]),
  },
  checkout_started: {
    plan_id: stringOneOf(["pro"]),
    billing_period: stringOneOf(["monthly", "annual"]),
    price_amount: numberOneOf([PRICING.monthly, PRICING.annual]),
    currency: stringOneOf(["usd"]),
    offer_version: stringOneOf([OFFER_VERSION]),
    checkout_provider: stringOneOf(["stripe"]),
  },
  paid_success: {
    plan_id: stringOneOf(["pro"]),
    billing_period: stringOneOf(["monthly", "annual"]),
    price_amount: numberOneOf([PRICING.monthly, PRICING.annual]),
    currency: stringOneOf(["usd"]),
    offer_version: stringOneOf([OFFER_VERSION]),
    purchase_ref: isPurchaseReference,
  },
};

function filterEventProperties(
  eventName: ActivationEventName,
  properties: Record<string, EventValue>
): Record<string, EventValue> {
  const allowed = EVENT_PROPERTY_RULES[eventName];
  const filtered: Record<string, EventValue> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (allowed[key]?.(value)) filtered[key] = value;
  }

  return filtered;
}

function createUuid(): string {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (consentPreference !== "unknown") return consentPreference;

  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (stored === "granted" || stored === "denied") consentPreference = stored;
  } catch {
    // A blocked storage API leaves consent unknown, so tracking stays off.
  }

  return consentPreference;
}

function readPendingCheckoutAnalyticsIds(): string[] {
  try {
    const raw = window.localStorage.getItem(PENDING_CHECKOUT_IDS_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    const now = Date.now();
    const valid = entries.filter((entry) =>
      entry &&
      typeof entry.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id) &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt > now
    );
    if (valid.length !== entries.length) {
      window.localStorage.setItem(PENDING_CHECKOUT_IDS_KEY, JSON.stringify(valid));
    }
    return valid.map((entry) => entry.id);
  } catch {
    return [];
  }
}

function rememberPendingCheckoutAnalyticsId(id: string): boolean {
  try {
    const current = readPendingCheckoutAnalyticsIds();
    const now = Date.now();
    const entries = current.map((pendingId) => ({
      id: pendingId,
      expiresAt: now + PENDING_CHECKOUT_IDS_TTL_MS,
    }));
    if (!entries.some((entry) => entry.id === id)) {
      entries.push({ id, expiresAt: now + PENDING_CHECKOUT_IDS_TTL_MS });
    }
    window.localStorage.setItem(PENDING_CHECKOUT_IDS_KEY, JSON.stringify(entries.slice(-20)));
    return true;
  } catch {
    return false;
  }
}

function readPendingAnalyticsRevocationIds(): string[] {
  try {
    const raw = window.localStorage.getItem(PENDING_REVOCATIONS_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    const valid = entries.filter((entry) =>
      entry &&
      typeof entry.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id) &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt > Date.now()
    );
    if (valid.length !== entries.length) {
      window.localStorage.setItem(PENDING_REVOCATIONS_KEY, JSON.stringify(valid));
    }
    return valid.map((entry) => entry.id);
  } catch {
    return [];
  }
}

function queueAnalyticsRevocations(ids: string[]): void {
  if (ids.length === 0) return;
  try {
    const now = Date.now();
    const existing = readPendingAnalyticsRevocationIds();
    const entries = existing.map((id) => ({ id, expiresAt: now + PENDING_CHECKOUT_IDS_TTL_MS }));
    for (const id of ids) {
      if (!entries.some((entry) => entry.id === id)) {
        entries.push({ id, expiresAt: now + PENDING_CHECKOUT_IDS_TTL_MS });
      }
    }
    window.localStorage.setItem(PENDING_REVOCATIONS_KEY, JSON.stringify(entries.slice(-20)));
  } catch {
    // The current page can still attempt the request using its in-memory IDs.
  }
}

export function getPendingAnalyticsRevocationIds(): string[] {
  return readPendingAnalyticsRevocationIds();
}

export function clearPendingAnalyticsRevocationIds(ids: string[]): void {
  const completed = new Set(ids);
  try {
    const raw = window.localStorage.getItem(PENDING_REVOCATIONS_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return;
    const remaining = entries.filter((entry) =>
      entry &&
      typeof entry.id === "string" &&
      !completed.has(entry.id) &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt > Date.now()
    );
    if (remaining.length === 0) window.localStorage.removeItem(PENDING_REVOCATIONS_KEY);
    else window.localStorage.setItem(PENDING_REVOCATIONS_KEY, JSON.stringify(remaining));
  } catch {
    // A failed local cleanup is safe: the server endpoint is idempotent.
  }
}

export function setAnalyticsConsent(choice: Exclude<AnalyticsConsent, "unknown">): string[] {
  const revokedSessionIds = choice === "denied"
    ? [...new Set([...readPendingCheckoutAnalyticsIds(), ...(ephemeralSessionId ? [ephemeralSessionId] : [])])].slice(0, 20)
    : [];
  consentPreference = choice;
  if (choice === "denied") {
    ephemeralSessionId = null;
    queueAnalyticsRevocations(revokedSessionIds);
    try {
      window.localStorage.removeItem(PENDING_CHECKOUT_IDS_KEY);
    } catch {
      // The revocation queue or current-page state still retains the IDs when available.
    }
  }

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  } catch {
    // The current page still honors the in-memory choice. A reload defaults to off.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  }
  return revokedSessionIds;
}

export function subscribeToAnalyticsConsent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorageChange = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) {
      consentPreference = "unknown";
      if (event.key === null || event.newValue !== "granted") ephemeralSessionId = null;
      onChange();
    }
  };

  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

function getEphemeralSessionId(): string {
  if (!ephemeralSessionId) ephemeralSessionId = createUuid();
  return ephemeralSessionId;
}

function getDeviceClass(): string {
  const width = window.innerWidth;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function createEventEnvelope(routeId: string) {
  if (typeof window === "undefined" || getAnalyticsConsent() !== "granted") return null;

  return {
    event_id: createUuid(),
    event_ts_utc: new Date().toISOString(),
    schema_version: ANALYTICS_SCHEMA_VERSION,
    anon_session_id: getEphemeralSessionId(),
    flow_variant: ACTIVATION_FLOW_VARIANT,
    route_id: routeId,
    device_class: getDeviceClass(),
    consent_state: "granted" as const,
  };
}

export function trackActivationEvent(
  name: ActivationEventName,
  routeId: string,
  properties: Record<string, string | number | boolean | null>
): boolean {
  if (!SAFE_ROUTE_IDS.has(routeId)) return false;
  const envelope = createEventEnvelope(routeId);
  if (!envelope) return false;

  try {
    track(name, { ...envelope, ...filterEventProperties(name, properties) });
    return true;
  } catch {
    return false;
  }
}

function safeRoute(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = new URL(url, window.location.origin).pathname;
    return SAFE_PAGE_PATHS.has(path) ? path : null;
  } catch {
    return null;
  }
}

export function filterAnalyticsPageview(event: BeforeSendEvent): BeforeSendEvent | null {
  if (getAnalyticsConsent() !== "granted") return null;
  const path = safeRoute(event.url);
  return path ? { ...event, url: path } : null;
}

export const filterSpeedInsight: BeforeSendMiddleware = (event) => {
  if (getAnalyticsConsent() !== "granted") return null;
  const path = safeRoute(event.url);
  return path ? { ...event, url: path } : null;
};

export function getOrCreateEphemeralSessionIdForCheckout(): string | null {
  if (getAnalyticsConsent() !== "granted" || typeof window === "undefined") return null;
  const sessionId = getEphemeralSessionId();
  return rememberPendingCheckoutAnalyticsId(sessionId) ? sessionId : null;
}
