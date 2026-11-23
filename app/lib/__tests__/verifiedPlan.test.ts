import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePlan } from "../plan";
let responsePlan = "free";
beforeEach(() => {
  responsePlan = "free";
  localStorage.setItem("flipos.plan.v1", "pro");
  window.history.replaceState({}, "", "/?checkout=success");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ plan: responsePlan }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState({}, "", "/"); });
it("ignores both the old Pro flag and the checkout success URL", async () => {
  const { result } = renderHook(() => usePlan());
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(result.current).toBe("free");
});
it("revokes Pro on a new server response after cancellation", async () => {
  responsePlan = "pro";
  const { result } = renderHook(() => usePlan());
  await waitFor(() => expect(result.current).toBe("pro"));
  responsePlan = "free";
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current).toBe("free"));
});
it("fails closed on an entitlement service error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const { result } = renderHook(() => usePlan());
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(result.current).toBe("free");
});
