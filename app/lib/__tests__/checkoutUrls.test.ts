import { describe, expect, it } from "vitest";
import { getCheckoutReturnUrls } from "@/app/lib/checkoutUrls";

describe("getCheckoutReturnUrls", () => {
  it("uses an explicitly configured app origin and discards any path", () => {
    expect(getCheckoutReturnUrls({ APP_URL: "https://flipos.example/app", NODE_ENV: "production" })).toEqual({
      successUrl: "https://flipos.example/?checkout=success",
      cancelUrl: "https://flipos.example/?checkout=cancelled",
    });
  });

  it("uses the platform deployment hostname for a preview", () => {
    expect(getCheckoutReturnUrls({ VERCEL_ENV: "preview", VERCEL_URL: "flipos-git-fix-team.vercel.app" }).successUrl)
      .toBe("https://flipos-git-fix-team.vercel.app/?checkout=success");
  });

  it("uses the configured production hostname when available", () => {
    expect(getCheckoutReturnUrls({ VERCEL_PROJECT_PRODUCTION_URL: "flipos.example", NODE_ENV: "production" }).cancelUrl)
      .toBe("https://flipos.example/?checkout=cancelled");
  });

  it("uses the documented production domain as a safe fallback", () => {
    expect(getCheckoutReturnUrls({ NODE_ENV: "production" }).successUrl)
      .toBe("https://flipos-tau.vercel.app/?checkout=success");
  });

  it("allows an explicit localhost URL only in development", () => {
    expect(getCheckoutReturnUrls({ APP_URL: "http://localhost:3001", NODE_ENV: "development" }).cancelUrl)
      .toBe("http://localhost:3001/?checkout=cancelled");
  });

  it("rejects insecure non-local configured origins", () => {
    expect(() => getCheckoutReturnUrls({ APP_URL: "http://flipos.example", NODE_ENV: "production" }))
      .toThrow("Checkout return origin must use HTTPS");
  });
});
