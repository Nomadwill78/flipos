import { describe, it, expect } from "vitest";
import { signCheckoutSession, readCheckoutSession } from "../entitlementCookie";
describe("checkout capability cookie", () => {
  it("accepts only the original server signature", () => {
    const value = signCheckoutSession("cs_test_a", "secret-a");
    expect(readCheckoutSession(value, "secret-a")).toBe("cs_test_a");
    expect(readCheckoutSession(value.replace("cs_test_a", "cs_test_b"), "secret-a")).toBeNull();
    expect(readCheckoutSession(value, "secret-b")).toBeNull();
    expect(readCheckoutSession(value + ".extra", "secret-a")).toBeNull();
    expect(readCheckoutSession("cs_test_a.☃", "secret-a")).toBeNull();
    expect(readCheckoutSession(value, "")).toBeNull();
  });
});
