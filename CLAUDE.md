I'm migrating a large app from react router v5 to tanstack router
This is a pretty large app with hundreds of routes, so I cannot migrate all at once.
To allow for a simple migration, I added both providers at once. But ran into a problem where the routing frameworks could not listen to each
other.
The solution we came up with was to allow for one framework to hold the context on browser URL - tanstack router being on the top.
React Router was switched from using BrowserRouter to MemoryRouter.
I have sync engine that syncs URL state between these frameworks @src/lib/router-sync.tsx

App uses:

- Rsbuild as bundler
- bun as package manager
- Vitest for tests on browser mode
- ESLint and Prettier
