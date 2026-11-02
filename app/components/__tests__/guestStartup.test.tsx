import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import type { DealForm } from "@/app/lib/types";
import * as storage from "@/app/lib/storage";
import FlipOSApp from "@/app/components/FlipOSApp";

const clerk = vi.hoisted(() => ({
  loaded: false,
  signedIn: false,
  fail: false,
  user: null as { publicMetadata: { plan: string } } | null,
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => {
    if (clerk.fail) throw new Error("Account service unavailable");
    return <>{children}</>;
  },
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <button>Account</button>,
  useUser: () => ({ isLoaded: clerk.loaded, isSignedIn: clerk.signedIn, user: clerk.user }),
}));
vi.mock("@clerk/themes", () => ({ dark: {} }));
vi.mock("@/app/components/DealAnalyzer", () => ({
  default: ({ form, onFormChange }: { form: DealForm; onFormChange: (form: DealForm) => void }) => (
    <section aria-label="Deal analyzer">
      <label>Property address<input value={form.address} onChange={(event) => onFormChange({ ...form, address: event.target.value })} /></label>
    </section>
  ),
}));
vi.mock("@/app/components/ScopeBuilder", () => ({ default: () => <div>Scope builder</div> }));
vi.mock("@/app/components/PricingModal", () => ({ default: () => null }));

beforeEach(() => {
  localStorage.clear();
  clerk.loaded = false;
  clerk.signedIn = false;
  clerk.fail = false;
  clerk.user = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function addressInput() {
  return screen.getByRole("textbox", { name: "Property address" });
}

describe("public guest startup", () => {
  it("server-renders the analyzer and no-account guidance instead of a loading-only screen", () => {
    const html = renderToString(<FlipOSApp />);
    expect(html).toContain("Property address");
    expect(html).toContain("No sign-in required to analyze a deal.");
    expect(html).not.toContain("Loading your deals");
    expect(localStorage.getItem("flipos.deals.v1")).toBeNull();
  });

  it("opens an editable guest deal without auth or saved browser data", async () => {
    render(<FlipOSApp />);
    await waitFor(() => expect(addressInput()).toBeEnabled());
    expect(screen.queryByText(/Opening this browser/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in/ })).not.toBeInTheDocument();
    fireEvent.change(addressInput(), { target: { value: "123 Main St" } });
    expect(JSON.parse(localStorage.getItem("flipos.deals.v1")!)[0].form.address).toBe("123 Main St");
  });

  it("restores saved deals without ever persisting the server preview over them", async () => {
    const saved = storage.newDeal();
    saved.form.address = "456 Saved Ave";
    localStorage.setItem("flipos.deals.v1", JSON.stringify([saved]));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<FlipOSApp />);
    await waitFor(() => expect(addressInput()).toHaveValue("456 Saved Ave"));
    const dealWrites = writes.mock.calls.filter(([key]) => key === "flipos.deals.v1");
    expect(dealWrites.length).toBeGreaterThan(0);
    for (const [, value] of dealWrites) {
      expect(JSON.parse(value)[0].id).toBe(saved.id);
      expect(JSON.parse(value)[0].form.address).toBe("456 Saved Ave");
    }
  });

  it("does not overwrite malformed saved JSON", async () => {
    const raw = "invalid-json";
    localStorage.setItem("flipos.deals.v1", raw);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<FlipOSApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your saved data has not been changed");
    expect(addressInput()).toBeDisabled();
    expect(writes.mock.calls.filter(([key]) => key === "flipos.deals.v1")).toHaveLength(0);
    expect(localStorage.getItem("flipos.deals.v1")).toBe(raw);
  });

  it("does not overwrite existing deals when reads fail but writes remain available", async () => {
    const saved = storage.newDeal();
    saved.form.address = "Keep this deal";
    const raw = JSON.stringify([saved]);
    localStorage.setItem("flipos.deals.v1", raw);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "flipos.deals.v1") throw new Error("Temporary storage read failure");
      return originalGetItem.call(localStorage, key);
    });
    const writes = vi.spyOn(Storage.prototype, "setItem");

    render(<FlipOSApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your saved data has not been changed");
    expect(addressInput()).toBeDisabled();
    expect(writes.mock.calls.filter(([key]) => key === "flipos.deals.v1")).toHaveLength(0);
    expect(originalGetItem.call(localStorage, "flipos.deals.v1")).toBe(raw);
  });

  it("offers a retry instead of endless loading and does not write data after startup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(storage, "loadDeals").mockImplementationOnce(() => { throw new Error("Unexpected startup failure"); });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(<FlipOSApp />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your saved data has not been changed");
    expect(addressInput()).toBeDisabled();
    expect(writes.mock.calls.filter(([key]) => key === "flipos.deals.v1")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry opening deals" }));
    await waitFor(() => expect(addressInput()).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("optional account controls", () => {
  it("keeps the analyzer editable while Clerk is still loading", async () => {
    render(<FlipOSApp authEnabled />);
    await waitFor(() => expect(addressInput()).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("Loading optional sign-in");
  });

  it("labels signed-out account access as optional", async () => {
    clerk.loaded = true;
    render(<FlipOSApp authEnabled />);
    expect(await screen.findByRole("button", { name: "Sign in (optional)" })).toBeEnabled();
    expect(addressInput()).toBeEnabled();
  });

  it("contains a Clerk render failure, preserves the guest workspace, and retries only sign-in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clerk.fail = true;
    render(<FlipOSApp authEnabled />);
    await waitFor(() => expect(addressInput()).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sign-in is unavailable"));
    fireEvent.change(addressInput(), { target: { value: "789 Guest Blvd" } });
    clerk.fail = false;
    clerk.loaded = true;
    fireEvent.click(screen.getByRole("button", { name: "Retry sign-in" }));
    expect(await screen.findByRole("button", { name: "Sign in (optional)" })).toBeInTheDocument();
    expect(addressInput()).toHaveValue("789 Guest Blvd");
  });

  it("still applies a signed-in account's Pro plan", async () => {
    clerk.loaded = true;
    clerk.signedIn = true;
    clerk.user = { publicMetadata: { plan: "pro" } };
    render(<FlipOSApp authEnabled />);
    await waitFor(() => expect(screen.getByText("Pro", { exact: true })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(addressInput()).toBeEnabled();
  });
});
