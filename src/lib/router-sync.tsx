import { useLayoutEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { memoryHistory } from "./memory-history";

function parseSearch(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const sp = new URLSearchParams(search);
  sp.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export function RouterSync() {
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });

  // Forward sync: TanStack Router → MemoryRouter
  useLayoutEffect(() => {
    const target =
      location.pathname + (location.searchStr || "") + (location.hash || "");
    const current =
      memoryHistory.location.pathname +
      memoryHistory.location.search +
      memoryHistory.location.hash;
    if (current !== target) {
      memoryHistory.replace(target, location.state);
    }
  }, [location.pathname, location.searchStr, location.hash, location.state]);

  // Reverse sync: MemoryRouter → TanStack Router
  useLayoutEffect(() => {
    const unlisten = memoryHistory.listen((memLocation) => {
      const memPath =
        memLocation.pathname + memLocation.search + memLocation.hash;
      const tsLocation = router.state.location;
      const tsPath =
        tsLocation.pathname +
        (tsLocation.searchStr || "") +
        (tsLocation.hash || "");
      if (memPath !== tsPath) {
        router.navigate({
          to: memLocation.pathname,
          search: parseSearch(memLocation.search),
          hash: memLocation.hash,
          state: memLocation.state as Record<string, unknown>,
        });
      }
    });
    return unlisten;
  }, [router]);

  return null;
}
