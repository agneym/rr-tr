import { createFileRoute } from "@tanstack/react-router";
import {
  Route as ReactRouterRoute,
  Link as RRLink,
  useLocation,
} from "react-router-dom";

export const Route = createFileRoute("/$")({
  component: RouteComponent,
});

function LocationState() {
  const { state } = useLocation<{ message?: string }>();
  if (!state?.message) return null;
  return <p>State from navigation: {state.message}</p>;
}

function RouteComponent() {
  return (
    <div>
      <h1>React Router Routes</h1>
      <p>This is a page for React Router Routes.</p>
      <div className="flex gap-2 my-2">
        <RRLink to="/one">RRv5 → One</RRLink>{" "}
        <RRLink to="/two">RRv5 → Two</RRLink>{" "}
        <RRLink
          to={{ pathname: "/three", state: { message: "Hello from RRv5!" } }}
        >
          RRv5 → Three (with state)
        </RRLink>
      </div>
      <LocationState />
      <ReactRouterRoute path="/one">
        <div>One</div>
      </ReactRouterRoute>
      <ReactRouterRoute path="/two">
        <div>Two</div>
      </ReactRouterRoute>
      <ReactRouterRoute path="/three">
        <div>Three</div>
      </ReactRouterRoute>
    </div>
  );
}
