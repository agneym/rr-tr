import { useLayoutEffect } from "react";
import {
  createRootRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";

const memoryHistory = createMemoryHistory({
  initialEntries: [window.location.pathname + window.location.search],
});

function RouterSync() {
  const location = useRouterState({ select: (s) => s.location });

  useLayoutEffect(() => {
    const target =
      location.pathname + (location.searchStr || "") + (location.hash || "");
    const current =
      memoryHistory.location.pathname +
      memoryHistory.location.search +
      memoryHistory.location.hash;
    if (current !== target) {
      memoryHistory.replace(target);
    }
  }, [location.pathname, location.searchStr, location.hash]);

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
