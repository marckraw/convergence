# packages/ui: the design system

Read the root [`AGENTS.md`](../../AGENTS.md) first; this adds what is specific to `@convergence/ui`.

- Props in, events out. No app code, no app state, no `@/` imports, no Electron, no `window.electronAPI`.
- Tokens only: colors, radii and motion come from `src/styles/theme.css`, never a one-off value.
- One folder per part, `src/components/<name>/<name>.tsx`; several parts in one file are fine (shadcn style). `cn` and style constants live in `src/lib/`.
- Named exports only. Apps import from `@convergence/ui`; `src/index.ts` re-exports each name one by one.
- Every part has stories beside it (`<name>.stories.tsx`), titled `Primitives/<Name>`, named `Default`, `Dark`, `Long`, `Busy`, `Failed`, `Empty`, `Disabled`, `ReducedMotion` where they apply. Play functions assert roles and behaviour, not classes. `npm run test:stories` runs each one in Chromium with axe; an exception is per story, narrow, and marked `a11y-known:`.
