import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordRevocationsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/app/lib/serverAnalytics", () => ({
  recordPaidSuccessConsentRevocations: recordRevocationsMock,
}));

import { POST } from "../route";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function request(anonSessionIds: unknown) {
  return new Request("https://flipos.example/api/analytics/consent-revocation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ anonSessionIds }),
  });
}

beforeEach(() => recordRevocationsMock.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.clearAllMocks());

describe("POST /api/analytics/consent-revocation", () => {
  it("records valid pending anonymous sessions and returns no identifiers", async () => {
    const response = await POST(request([SESSION_ID]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: 1 });
    expect(recordRevocationsMock).toHaveBeenCalledWith([SESSION_ID]);
  });

  it("rejects malformed or excessive identifiers", async () => {
    const invalid = await POST(request(["not-a-uuid"]));
    expect(invalid.status).toBe(400);
    const excessive = await POST(request(Array.from({ length: 21 }, () => SESSION_ID)));
    expect(excessive.status).toBe(400);
    expect(recordRevocationsMock).not.toHaveBeenCalled();
  });

  it("reports a retryable server error if durable revocation storage is unavailable", async () => {
    recordRevocationsMock.mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await POST(request([SESSION_ID]));
    expect(response.status).toBe(503);
  });
});
