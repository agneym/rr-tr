import { useLayoutEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Action, Location } from "history";
import { memoryHistory } from "./memory-history";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loc can be a TanStack or history v4 location with different shapes
function buildPath(loc: any): string {
  // TanStack: searchStr is the string form, search is a parsed object
  // history v4: search is a string like "?foo=bar"
  const search =
    typeof loc.searchStr === "string"
      ? loc.searchStr
      : typeof loc.search === "string"
        ? loc.search
        : "";
  const hash = loc.hash
    ? loc.hash.startsWith("#")
      ? loc.hash
      : "#" + loc.hash
    : "";
  return loc.pathname + search + hash;
}

type TsAction =
  | { type: "PUSH" }
  | { type: "REPLACE" }
  | { type: "POP"; delta: number };

export function RouterSync() {
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });
  // Synchronous guard for forward→memory→reverse echoes (memory ops are sync,
  // so a boolean is reliable here).
  const isSyncingForward = useRef(false);
  // Path-based guard for reverse→TanStack→forward echoes. TanStack navigation
  // is async (router.history.go uses window.history.go; push/replace trigger
  // async route matching), so a boolean reset inline would be stale by the time
  // the forward-sync effect fires. Instead we record every path that reverse
  // sync has pushed and let forward sync clear them when it sees the echo.
  const pendingReversePaths = useRef(new Set<string>());
  const prevIndexRef = useRef(memoryHistory.index);
  const lastTsActionRef = useRef<TsAction | null>(null);

  // Intercept TanStack history methods to track the action type,
  // since TanStack's subscribe/location API doesn't expose it.
  useLayoutEffect(() => {
    const h = router.history;
    const origPush = h.push;
    const origReplace = h.replace;
    const origGo = h.go;
    const origBack = h.back;
    const origForward = h.forward;

    h.push = function (...args) {
      lastTsActionRef.current = { type: "PUSH" };
      return origPush.apply(this, args);
    };
    h.replace = function (...args) {
      lastTsActionRef.current = { type: "REPLACE" };
      return origReplace.apply(this, args);
    };
    h.go = function (delta) {
      lastTsActionRef.current = { type: "POP", delta };
      return origGo.call(this, delta);
    };
    h.back = function () {
      lastTsActionRef.current = { type: "POP", delta: -1 };
      return origBack.call(this);
    };
    h.forward = function () {
      lastTsActionRef.current = { type: "POP", delta: 1 };
      return origForward.call(this);
    };

    return () => {
      h.push = origPush;
      h.replace = origReplace;
      h.go = origGo;
      h.back = origBack;
      h.forward = origForward;
    };
  }, [router]);

  // Forward sync: TanStack Router → MemoryRouter
  useLayoutEffect(() => {
    const target = buildPath(location);

    // If this TanStack location change is an echo from reverse sync, skip it.
    if (pendingReversePaths.current.delete(target)) {
      // Clear stale action ref that the monkeypatch recorded during reverse sync.
      lastTsActionRef.current = null;
      return;
    }

    const current = buildPath(memoryHistory.location);
    const isPathChanged = current !== target;
    const isStateChanged =
      !isPathChanged &&
      JSON.stringify(location.state) !==
        JSON.stringify(memoryHistory.location.state);

    if (isPathChanged || isStateChanged) {
      isSyncingForward.current = true;
      const action = lastTsActionRef.current;
      lastTsActionRef.current = null;

      if (action?.type === "POP") {
        // Mirror the exact back/forward delta into memoryHistory.
        // Using the captured delta rather than a path-based lookup avoids
        // jumping to the wrong entry when the same path appears multiple
        // times in the history stack (e.g. /a → /b → /a).
        memoryHistory.go(action.delta);
      } else if (action?.type === "REPLACE") {
        memoryHistory.replace(target, location.state);
      } else {
        // PUSH or untracked (e.g. browser popstate) — grow the stack
        memoryHistory.push(target, location.state);
      }

      prevIndexRef.current = memoryHistory.index;
      isSyncingForward.current = false;
    }
  }, [location.pathname, location.searchStr, location.hash, location.state]);

  // Reverse sync: MemoryRouter → TanStack Router
  useLayoutEffect(() => {
    const unlisten = memoryHistory.listen(
      (memLocation: Location, action: Action) => {
        // Forward sync ops are synchronous (memory push/replace/go), so the
        // boolean guard is reliable here — the listener fires during the
        // memoryHistory call while isSyncingForward is still true.
        if (isSyncingForward.current) return;

        const currentIndex = memoryHistory.index;
        const prevIndex = prevIndexRef.current;
        prevIndexRef.current = currentIndex;

        if (action === "POP") {
          const delta = currentIndex - prevIndex;
          if (delta !== 0) {
            // Record the target so forward sync can detect the echo once
            // TanStack's async go() resolves.
            pendingReversePaths.current.add(buildPath(memLocation));
            router.history.go(delta);
          }
          return;
        }

        // PUSH or REPLACE
        const memPath = buildPath(memLocation);
        const tsPath = buildPath(router.state.location);
        const isPathChanged = memPath !== tsPath;
        const isStateChanged =
          !isPathChanged &&
          JSON.stringify(memLocation.state) !==
            JSON.stringify(router.state.location.state);

        if (isPathChanged || isStateChanged) {
          // Record the target so forward sync can detect the echo once
          // TanStack's async navigation resolves.
          pendingReversePaths.current.add(memPath);
          if (action === "REPLACE") {
            router.history.replace(
              memPath,
              memLocation.state as Record<string, unknown>,
            );
          } else {
            router.history.push(
              memPath,
              memLocation.state as Record<string, unknown>,
            );
          }
        }
      },
    );
    return unlisten;
  }, [router]);

  return null;
}
