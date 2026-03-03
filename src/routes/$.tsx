import { createFileRoute } from "@tanstack/react-router";
import { Route as ReactRouterRoute } from "react-router-dom";

export const Route = createFileRoute("/$")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <h1>React Router Routes</h1>
      <p>This is a page for React Router Routes.</p>
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
