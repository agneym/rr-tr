import { useLayoutEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Action, Location } from "history";
import { memoryHistory } from "./memory-history";

function parseSearch(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const sp = new URLSearchParams(search);
  sp.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function RouterSync() {
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });
  const isSyncing = useRef(false);

  // Forward sync: TanStack Router → MemoryRouter
  useLayoutEffect(() => {
    if (isSyncing.current) return;

    const target = buildPath(location);
    const current = buildPath(memoryHistory.location);
    if (current !== target) {
      isSyncing.current = true;
      memoryHistory.replace(target, location.state);
      isSyncing.current = false;
    }
  }, [location.pathname, location.searchStr, location.hash, location.state]);

  // Reverse sync: MemoryRouter → TanStack Router
  useLayoutEffect(() => {
    const unlisten = memoryHistory.listen(
      (memLocation: Location, action: Action) => {
        if (isSyncing.current) return;

        const memPath = buildPath(memLocation);
        const tsPath = buildPath(router.state.location);
        if (memPath !== tsPath) {
          isSyncing.current = true;
          router.navigate({
            to: memLocation.pathname,
            search: parseSearch(memLocation.search),
            hash: memLocation.hash,
            state: memLocation.state as Record<string, unknown>,
            replace: action === "REPLACE",
          });
          isSyncing.current = false;
        }
      },
    );
    return unlisten;
  }, [router]);

  return null;
}
