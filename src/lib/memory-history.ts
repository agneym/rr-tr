import { createMemoryHistory } from "history";

export const memoryHistory = createMemoryHistory({
  initialEntries: [
    window.location.pathname + window.location.search + window.location.hash,
  ],
});
