import { describe, expect, it } from "vitest";
import { isAuthConfigured } from "@/app/lib/authConfig";

describe("optional auth configuration", () => {
  it("is disabled without keys", () => {
    expect(isAuthConfigured({})).toBe(false);
  });
  it("is disabled with only a publishable key", () => {
    expect(isAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example" })).toBe(false);
  });
  it("is disabled with only a secret key", () => {
    expect(isAuthConfigured({ CLERK_SECRET_KEY: "sk_test_example" })).toBe(false);
  });
  it("is disabled with blank keys", () => {
    expect(isAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "  ", CLERK_SECRET_KEY: "sk_test_example" })).toBe(false);
  });
  it("is enabled only when both keys are present", () => {
    expect(isAuthConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example", CLERK_SECRET_KEY: "sk_test_example" })).toBe(true);
  });
});
