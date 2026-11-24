import { createHmac, timingSafeEqual } from "node:crypto";

export const ENTITLEMENT_COOKIE = "flipos_checkout";
function signature(sessionId: string, secret: string): string {
  if (!secret) throw new Error("Billing is not configured");
  return createHmac("sha256", secret).update(`flipos-checkout-v1:${sessionId}`).digest("hex");
}
export function signCheckoutSession(sessionId: string, secret: string): string {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid checkout session");
  return `${sessionId}.${signature(sessionId, secret)}`;
}
export function readCheckoutSession(value: string | undefined, secret: string): string | null {
  if (!value || !secret) return null;
  const [id, supplied, extra] = value.split(".");
  if (extra || !/^cs_[A-Za-z0-9_]+$/.test(id) || !/^[a-f0-9]{64}$/.test(supplied ?? "")) return null;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(signature(id, secret))) ? id : null;
}
