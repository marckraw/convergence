# packages/ui: the design system

Read the root [`AGENTS.md`](../../AGENTS.md) first; this adds what is specific to `@convergence/ui`.

- Props in, events out. No app code, no app state, no `@/` imports, no Electron, no `window.electronAPI`.
- Tokens only: a colour, size, radius, shadow or duration comes from a token, never a one-off value.
  - `src/styles/tokens.css` holds every value. Each colour is `light-dark(LIGHT, DARK)`; only the `--terminal-*` family has one value (dark in both themes). `src/styles/theme.css` maps tokens onto Tailwind (`--color-canvas: var(--canvas)` makes `bg-canvas`), and its legacy bridge keeps the old shadcn names (`bg-background` …) painting until DS5.
  - The theme is `data-theme="light|dark"` on `<html>` (or a subtree), written by `applyTheme`; it sets `color-scheme`, which picks each token's half. `dark:` belongs inside this package only; app code writes tokens. Code that can't read CSS uses `useAppliedTheme()`.
  - To add a token: a literal in `light-dark()` (or `var(--other)` for the same role) with a comment saying what wears it; a `--color-<name>` (or `--shadow-`, `--text-` …) line in `theme.css`; its pairs in `apps/convergence/src/app/theme-contrast.pure.test.ts`; its swatch appears in `Foundations/Colors` by itself. A new utility name tailwind-merge can't know goes in `src/lib/cn.pure.ts`.
  - TypeScript mirrors (`src/motion/tokens.ts`, `src/styles/layout.tokens.ts`, `src/styles/terminal.tokens.ts`) have tests that keep them equal to `tokens.css`; change both together.
- One folder per part, `src/components/<name>/<name>.tsx`; several parts in one file are fine (shadcn style). `cn` and style constants live in `src/lib/`.
- Named exports only. Apps import from `@convergence/ui`; `src/index.ts` re-exports each name one by one.
- The tokens themselves are shown in `src/foundations/`, titled `Foundations/<Name>` (Colors, Type, Radii, Shadows, Control heights, Motion).
- Every part has stories beside it (`<name>.stories.tsx`), titled `Primitives/<Name>`, named `Default`, `Dark`, `Long`, `Busy`, `Failed`, `Empty`, `Disabled`, `ReducedMotion` where they apply. Play functions assert roles and behaviour, not classes. `npm run test:stories` runs each one in Chromium with axe; an exception is per story, narrow, and marked `a11y-known:`.
