import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Router } from "react-router-dom";
import { RouterSync } from "../lib/router-sync";
import { memoryHistory } from "../lib/memory-history";

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
