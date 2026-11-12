export const ANALYTICS_CONSENT_KEY = "flipos.analyticsConsent.v1";
export const ANALYTICS_SCHEMA_VERSION = "1";
export const ACTIVATION_FLOW_VARIANT = "first_visit_v1";
export const OFFER_VERSION = "flipos_pro_2026_11_v1";
export const SAMPLE_ID = "flip_deal_demo";
export const SAMPLE_VERSION = "v1";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AnalyticsConsent = "unknown" | "granted" | "denied";

export type ActivationEventName =
  | "landing_cta_clicked"
  | "sample_started"
  | "first_analysis_complete"
  | "scope_opened"
  | "sample_pdf_exported"
  | "pricing_viewed"
  | "checkout_started"
  | "paid_success";
