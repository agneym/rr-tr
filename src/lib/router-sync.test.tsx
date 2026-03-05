import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import ReactDOM from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory as createTanStackMemoryHistory,
  RouterProvider,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Router, useLocation as useRRLocation } from "react-router-dom";
import { RouterSync } from "./router-sync";
import { memoryHistory } from "./memory-history";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Poll until `fn` stops throwing or timeout is reached.
 * Vitest browser mode runs in a real browser, so we need to wait for
 * React renders + async router transitions to settle.
 */
async function waitFor(fn: () => void, { timeout = 3000, interval = 60 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      fn();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  // Final attempt — let it throw so vitest reports the real assertion failure
  fn();
}

// ---------------------------------------------------------------------------
// Observer components – render location info from each router into the DOM
// so tests can read them with simple querySelector calls.
// ---------------------------------------------------------------------------

/** Reads location from React Router v5's context */
function RRLocationObserver() {
  const location = useRRLocation();
  return (
    <div data-testid="rr-location">
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-search">{location.search}</span>
      <span data-testid="rr-hash">{location.hash}</span>
      <span data-testid="rr-state">
        {JSON.stringify(location.state ?? null)}
      </span>
    </div>
  );
}

/** Reads location from TanStack Router's context */
function TSLocationObserver() {
  const location = useRouterState({ select: (s) => s.location });
  return (
    <div data-testid="ts-location">
      <span data-testid="ts-pathname">{location.pathname}</span>
      <span data-testid="ts-search">{location.searchStr ?? ""}</span>
      <span data-testid="ts-hash">{location.hash}</span>
      <span data-testid="ts-state">
        {JSON.stringify(location.state ?? null)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test harness – spins up a minimal dual-router app identical in structure
// to the real app: TanStack Router on top, RRv5 MemoryRouter inside,
// RouterSync bridging them.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTestApp(initialPath: string): any {
  const rootRoute = createRootRoute({
    component: () => (
      <Router history={memoryHistory}>
        <RouterSync />
        <RRLocationObserver />
        <TSLocationObserver />
        <Outlet />
      </Router>
    ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="page-index">Index</div>,
  });

  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: () => <div data-testid="page-catchall">Catch All</div>,
  });

  const tsHistory = createTanStackMemoryHistory({
    initialEntries: [initialPath],
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, catchAllRoute]),
    history: tsHistory,
  });

  return { router, tsHistory };
}

// ---------------------------------------------------------------------------
// Per-test rendering
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: ReactDOM.Root;

function renderApp(initialPath = "/") {
  // Reset the shared RRv5 memoryHistory to the starting path
  memoryHistory.push(initialPath);

  const { router } = createTestApp(initialPath);

  container = document.createElement("div");
  container.id = "test-root";
  document.body.appendChild(container);
  root = ReactDOM.createRoot(container);
  root.render(<RouterProvider router={router} />);

  return { router };
}

/** Shorthand to read text content of a data-testid element */
function q(testId: string): string {
  return (
    container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? ""
  );
}

afterEach(() => {
  root?.unmount();
  container?.remove();
});

// ===========================================================================
// TEST SUITES
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Forward sync: TanStack Router navigates → React Router should follow
// ---------------------------------------------------------------------------

describe("Forward sync: TanStack → React Router", () => {
  it("syncs non-root initial path on mount", async () => {
    // Rendering with a non-"/" initial path should forward-sync
    // pathname + search + hash to RRv5 without any explicit navigation.
    renderApp("/start?x=1#heading");

    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/start");
      expect(q("rr-pathname")).toBe("/start");
      expect(q("rr-search")).toContain("x=1");
      expect(q("rr-hash")).toContain("heading");
    });
  });

  it("syncs pathname on TanStack navigation", async () => {
    // A user clicks a TanStack <Link to="/about">.
    // Code inside an RRv5 <Route> calls useLocation() — does it see /about?
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    await router.navigate({ to: "/about" });

    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/about");
      expect(q("rr-pathname")).toBe("/about");
    });
  });

  it("syncs search params from TanStack to React Router", async () => {
    // TanStack navigates with search params.
    // RRv5's useLocation().search should contain both params.
    // Note: TanStack JSON-serializes values, so use numbers to get clean output.
    const { router } = renderApp("/");

    await router.navigate({ to: "/", search: { foo: 1, baz: 42 } });

    await waitFor(() => {
      expect(q("ts-search")).toContain("foo=1");
      expect(q("rr-search")).toContain("foo=1");
      expect(q("rr-search")).toContain("baz=42");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Reverse sync: React Router (memoryHistory) navigates → TanStack follows
// ---------------------------------------------------------------------------

describe("Reverse sync: React Router → TanStack", () => {
  it("syncs history.push() to TanStack", async () => {
    // Legacy RRv5 code calls history.push("/legacy-page").
    // TanStack's useRouterState().location should show /legacy-page.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/legacy-page");

    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/legacy-page");
      expect(q("ts-pathname")).toBe("/legacy-page");
    });
  });

  it("syncs history.replace() to TanStack", async () => {
    // Legacy code calls history.replace("/replaced").
    // TanStack should navigate with replace semantics (no new history entry).
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.replace("/replaced");

    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/replaced");
      expect(q("ts-pathname")).toBe("/replaced");
    });
  });

  it("replace from RRv5 does not grow TanStack history stack", async () => {
    // When RRv5 calls history.replace(), the reverse sync should use
    // replace: true so TanStack's stack doesn't grow.
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    // Push via TanStack so we have a known back-entry
    await router.navigate({ to: "/anchor" });
    await waitFor(() => expect(q("rr-pathname")).toBe("/anchor"));

    // RRv5 replaces — TanStack should replace too, not push
    memoryHistory.replace("/replaced-by-rr");
    await waitFor(() => expect(q("ts-pathname")).toBe("/replaced-by-rr"));

    // Going back in TanStack should go to "/" (before /anchor),
    // because /anchor was replaced by the reverse sync.
    router.history.back();
    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/");
    });
  });

  it("syncs history.push with search params to TanStack", async () => {
    // RRv5 code pushes a URL with query string.
    // TanStack should parse the search and reflect it in its state.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/search?q=hello&page=2");

    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/search");
      expect(q("ts-search")).toContain("q=");
      expect(q("ts-search")).toContain("page=");
    });
  });
});

// ---------------------------------------------------------------------------
// 3. history.goBack / history.goForward
//
// KNOWN CONCERN: The sync engine's reverse listener only distinguishes
// REPLACE vs everything-else (treating POP as PUSH). When RRv5 fires
// history.goBack(), the listener receives a POP action and calls
// router.history.push(), which PUSHES a new TanStack history entry
// instead of going back. The URL will be correct, but TanStack's
// history stack will grow instead of unwinding.
// ---------------------------------------------------------------------------

describe("History navigation: goBack / goForward", () => {
  it("syncs history.goForward() after goBack()", async () => {
    // After going back, going forward should restore the next URL.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/step-1");
    await waitFor(() => expect(q("ts-pathname")).toBe("/step-1"));

    memoryHistory.push("/step-2");
    await waitFor(() => expect(q("ts-pathname")).toBe("/step-2"));

    memoryHistory.goBack();
    await waitFor(() => expect(q("ts-pathname")).toBe("/step-1"));

    memoryHistory.goForward();

    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/step-2");
      expect(q("ts-pathname")).toBe("/step-2");
    });
  });

  it("handles multiple sequential goBack() calls", async () => {
    // Push A → B → C, then go back twice. Should land on A.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/a");
    await waitFor(() => expect(q("ts-pathname")).toBe("/a"));

    memoryHistory.push("/b");
    await waitFor(() => expect(q("ts-pathname")).toBe("/b"));

    memoryHistory.push("/c");
    await waitFor(() => expect(q("ts-pathname")).toBe("/c"));

    memoryHistory.goBack();
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/b");
      expect(q("ts-pathname")).toBe("/b");
    });

    memoryHistory.goBack();
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/a");
      expect(q("ts-pathname")).toBe("/a");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Search params edge cases
// ---------------------------------------------------------------------------

describe("Search params edge cases", () => {
  it("handles special characters in search values", async () => {
    // Params with spaces, ampersands, equals signs encoded in values.
    // Both routers should preserve encoded values through the sync.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/search?q=hello%20world&tag=a%26b");

    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/search");
      // Verify the values survive the round-trip through parseSearch
      expect(q("ts-search")).toContain("q=");
      expect(q("rr-search")).toContain("q=");
    });
  });

  it.fails(
    "loses multi-value search params (TanStack serializer re-encodes them)",
    async () => {
      // TanStack Router's default search serializer parses ?tag=a&tag=b as
      // tag: ["a","b"] and re-serializes it as ?tag=["a","b"] (JSON-encoded).
      // This is TanStack Router behavior, not a sync engine bug.
      renderApp("/");
      await waitFor(() => expect(q("rr-pathname")).toBe("/"));

      memoryHistory.push("/filter?tag=react&tag=vue&tag=angular");

      await waitFor(() => {
        expect(q("ts-pathname")).toBe("/filter");
        const tsSearch = q("ts-search");
        expect(tsSearch).toContain("tag=react");
        expect(tsSearch).toContain("tag=vue");
        expect(tsSearch).toContain("tag=angular");
      });
    },
  );

  it("clears search params when navigating to a path without search", async () => {
    // Navigate to /foo?bar=1, then to /foo with no search.
    // Both routers should have empty search afterward.
    const { router } = renderApp("/");

    await router.navigate({ to: "/foo", search: { bar: 1 } });
    await waitFor(() => expect(q("rr-search")).toContain("bar=1"));

    await router.navigate({ to: "/foo", search: {} });
    await waitFor(() => {
      expect(q("ts-search")).toBe("");
      expect(q("rr-search")).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Hash sync
// ---------------------------------------------------------------------------

describe("Hash sync", () => {
  it("round-trips hash from TanStack → RR → TanStack", async () => {
    const { router } = renderApp("/");

    // TanStack sets hash
    await router.navigate({ to: "/page", hash: "top" });
    await waitFor(() => {
      expect(q("rr-hash")).toContain("top");
    });

    // RRv5 changes hash
    memoryHistory.push("/page#bottom");
    await waitFor(() => {
      expect(q("ts-hash")).toContain("bottom");
    });
  });

  it("clears hash when navigating to a path without hash", async () => {
    const { router } = renderApp("/");

    await router.navigate({ to: "/page", hash: "section" });
    await waitFor(() => expect(q("rr-hash")).toContain("section"));

    await router.navigate({ to: "/page" });
    await waitFor(() => {
      expect(q("ts-hash")).toBe("");
      expect(q("rr-hash")).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Location state passthrough
// ---------------------------------------------------------------------------

describe("Location state passthrough", () => {
  it("passes complex nested state from TanStack to RRv5", async () => {
    const { router } = renderApp("/");

    await router.navigate({
      to: "/detail",
      state: { user: { id: 1, name: "Alice" }, returnTo: "/list" },
    });

    await waitFor(() => {
      const rrState = JSON.parse(q("rr-state"));
      expect(rrState.user).toEqual({ id: 1, name: "Alice" });
      expect(rrState.returnTo).toBe("/list");
    });
  });

  it("passes state from RRv5 to TanStack", async () => {
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/modal", { backdrop: true, previousUrl: "/" });

    await waitFor(() => {
      const tsState = JSON.parse(q("ts-state"));
      expect(tsState.backdrop).toBe(true);
      expect(tsState.previousUrl).toBe("/");
    });
  });

  it("state survives a round-trip through both routers", async () => {
    // Navigate from TanStack with state, then navigate from RRv5,
    // then go back — does the original state survive?
    const { router } = renderApp("/");

    await router.navigate({
      to: "/first",
      state: { origin: "tanstack" },
    });
    await waitFor(() => expect(q("ts-pathname")).toBe("/first"));

    memoryHistory.push("/second", { origin: "rrv5" });
    await waitFor(() => expect(q("ts-pathname")).toBe("/second"));

    // Go back to /first — does state survive?
    memoryHistory.goBack();
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/first");
      // The original state should still be there in RRv5
      const rrState = JSON.parse(q("rr-state"));
      expect(rrState).toMatchObject({ origin: "tanstack" });
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Rapid / concurrent navigations
// ---------------------------------------------------------------------------

describe("Rapid navigations and race conditions", () => {
  it("settles to consistent state after rapid sequential navigations", async () => {
    // Fire many navigations from both routers in quick succession.
    // The sync should not loop and both routers should agree on final URL.
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/rapid-1");
    memoryHistory.push("/rapid-2");
    await router.navigate({ to: "/rapid-3" });
    memoryHistory.push("/rapid-4");

    await waitFor(() => {
      const rr = q("rr-pathname");
      const ts = q("ts-pathname");
      // Both routers MUST agree — this is the fundamental contract
      expect(rr).toBe(ts);
    });
  });

  it("handles alternating navigations from each router", async () => {
    // Alternate: TanStack → RRv5 → TanStack → RRv5.
    // Each step should fully sync before the next.
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    await router.navigate({ to: "/ts-1" });
    await waitFor(() => expect(q("rr-pathname")).toBe("/ts-1"));

    memoryHistory.push("/rr-1");
    await waitFor(() => expect(q("ts-pathname")).toBe("/rr-1"));

    await router.navigate({ to: "/ts-2" });
    await waitFor(() => expect(q("rr-pathname")).toBe("/ts-2"));

    memoryHistory.push("/rr-2");
    await waitFor(() => {
      expect(q("ts-pathname")).toBe("/rr-2");
      expect(q("rr-pathname")).toBe("/rr-2");
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("navigating to the same path is a no-op", async () => {
    // Should not error or cause re-sync.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/same");
    await waitFor(() => expect(q("ts-pathname")).toBe("/same"));

    memoryHistory.push("/same");

    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/same");
      expect(q("ts-pathname")).toBe("/same");
    });
  });

  it("handles paths with trailing slashes", async () => {
    // /about vs /about/ — do both routers normalize the same way?
    // If they don't, the sync engine might oscillate between the two forms.
    renderApp("/");

    memoryHistory.push("/about/");

    await waitFor(() => {
      const rr = q("rr-pathname");
      const ts = q("ts-pathname");
      expect(rr).toBe(ts);
    });
  });

  it("handles URL-encoded path segments", async () => {
    // Path with encoded characters (spaces, unicode).
    // Both routers should represent them consistently.
    renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    memoryHistory.push("/users/john%20doe/profile");

    await waitFor(() => {
      const rr = q("rr-pathname");
      const ts = q("ts-pathname");
      expect(rr).toBe(ts);
      expect(rr).toContain("john");
    });
  });

  it("handles search + hash + state all at once", async () => {
    // Navigate with everything set — the full location object.
    const { router } = renderApp("/");

    await router.navigate({
      to: "/complex",
      search: { a: 1, b: 2 },
      hash: "top",
      state: { myKey: "value" },
    });

    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/complex");
      expect(q("rr-search")).toContain("a=1");
      expect(q("rr-search")).toContain("b=2");
      expect(q("rr-hash")).toContain("top");
      const rrState = JSON.parse(q("rr-state"));
      expect(rrState).toMatchObject({ myKey: "value" });
    });
  });

  it("replace from TanStack does not grow memoryHistory stack", async () => {
    // When TanStack navigates, forward sync calls memoryHistory.replace().
    // The RRv5 history stack should not grow — verify by going back.
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    // Push via RRv5 so we have a known back-entry
    memoryHistory.push("/anchor");
    await waitFor(() => expect(q("ts-pathname")).toBe("/anchor"));

    // Now TanStack navigates — forward sync should REPLACE in memoryHistory
    await router.navigate({ to: "/replaced-dest", replace: true });
    await waitFor(() => expect(q("rr-pathname")).toBe("/replaced-dest"));

    // Going back in RRv5 should go to "/" (before /anchor), not to /anchor,
    // because the forward sync used replace — so /anchor was replaced.
    memoryHistory.goBack();
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/");
    });
  });
});

// ---------------------------------------------------------------------------
// 9. Bidirectional round-trip
// ---------------------------------------------------------------------------

describe("Bidirectional round-trip", () => {
  it("TanStack → RR → TanStack round-trip preserves sync", async () => {
    const { router } = renderApp("/");
    await waitFor(() => expect(q("rr-pathname")).toBe("/"));

    // TanStack navigates
    await router.navigate({ to: "/ts-page" });
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/ts-page");
      expect(q("ts-pathname")).toBe("/ts-page");
    });

    // RRv5 navigates
    memoryHistory.push("/rr-page");
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/rr-page");
      expect(q("ts-pathname")).toBe("/rr-page");
    });

    // TanStack navigates again
    await router.navigate({ to: "/ts-page-2" });
    await waitFor(() => {
      expect(q("rr-pathname")).toBe("/ts-page-2");
      expect(q("ts-pathname")).toBe("/ts-page-2");
    });
  });

  it("round-trips search + hash from each side", async () => {
    const { router } = renderApp("/");

    // TanStack sets search + hash
    await router.navigate({
      to: "/page",
      search: { id: 5 },
      hash: "details",
    });
    await waitFor(() => {
      expect(q("rr-search")).toContain("id=5");
      expect(q("rr-hash")).toContain("details");
    });

    // RRv5 changes search + hash
    memoryHistory.push("/page?id=10#summary");
    await waitFor(() => {
      expect(q("ts-search")).toContain("id=");
      expect(q("ts-hash")).toContain("summary");
    });
  });
});
