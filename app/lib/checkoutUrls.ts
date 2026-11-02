const DEFAULT_PRODUCTION_ORIGIN = "https://flipos-tau.vercel.app";
const DEFAULT_DEVELOPMENT_ORIGIN = "http://localhost:3000";

type CheckoutUrlEnvironment = {
  APP_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

function trustedOrigin(candidate: string, allowLocalHttp: boolean): string {
  const url = new URL(candidate);
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const isAllowedLocalHttp = allowLocalHttp && url.protocol === "http:" && isLocalHost;

  if (url.protocol !== "https:" && !isAllowedLocalHttp) {
    throw new Error("Checkout return origin must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Checkout return origin must not contain credentials");
  }

  return url.origin;
}

/**
 * Build Stripe return URLs from server-controlled application configuration.
 * Never pass Origin or Host request headers to this function.
 */
export function getCheckoutReturnUrls(environment: CheckoutUrlEnvironment) {
  const isDevelopment = environment.NODE_ENV === "development";
  const previewHost = environment.VERCEL_ENV === "preview"
    ? environment.VERCEL_URL?.trim()
    : undefined;
  const productionHost = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  const candidate = previewHost
    ? `https://${previewHost}`
    : environment.APP_URL?.trim() || (productionHost ? `https://${productionHost}` : undefined) ||
      (isDevelopment ? DEFAULT_DEVELOPMENT_ORIGIN : DEFAULT_PRODUCTION_ORIGIN);
  const origin = trustedOrigin(candidate, isDevelopment);

  return {
    successUrl: new URL("/?checkout=success", origin).toString(),
    cancelUrl: new URL("/?checkout=cancelled", origin).toString(),
  };
}
