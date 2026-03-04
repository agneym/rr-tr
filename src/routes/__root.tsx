import { useLayoutEffect } from "react";
import {
  createRootRoute,
  Link,
  Outlet,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";

function parseSearch(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const sp = new URLSearchParams(search);
  sp.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

const memoryHistory = createMemoryHistory({
  initialEntries: [window.location.pathname + window.location.search],
});

function RouterSync() {
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

const RootLayout = () => (
  <Router history={memoryHistory}>
    <RouterSync />
    <div className="p-2 flex gap-2">
      <Link to="/" className="[&.active]:font-bold">
        Home
      </Link>{" "}
      <Link to="/about" className="[&.active]:font-bold">
        About
      </Link>
      <Link to="/one" className="[&.active]:font-bold">
        One
      </Link>
      <Link to="/two" className="[&.active]:font-bold">
        Two
      </Link>
      <Link to="/three" className="[&.active]:font-bold">
        Three
      </Link>
    </div>
    <hr />
    <Outlet />
    <TanStackRouterDevtools />
  </Router>
);

export const Route = createRootRoute({ component: RootLayout });
