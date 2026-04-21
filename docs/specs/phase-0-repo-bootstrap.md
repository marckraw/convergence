# Phase 0: Repository Bootstrap — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> This phase exists to make every later phase verifiable.
> Status: **DONE** (verified 2026-04-17)

## Objective

Create a disciplined Electron + React + TypeScript repository with working build, test, lint, and convention-checking toolchain. After this phase, every future phase can be verified by running the standard test gate commands.

## Success Criteria

All must be true before Phase 0 is complete:

1. `npm install` completes without errors
2. `npm run dev` opens an Electron window showing a placeholder app shell
3. `npm run build` produces a runnable production build
4. `npm run test:pure` runs and passes (at least one pure test)
5. `npm run test:unit` runs and passes (at least one unit test)
6. `npm run lint` passes with no errors
7. `npm run typecheck` passes with no type errors
8. `chaperone check --fix` passes
9. FSD-lite directory structure exists with `index.ts` barrel files per layer
10. Electron `main/`, `preload/` directories exist with working entry points
11. shadcn/ui is configured and at least one component (Button) is installed
12. Dark mode toggle works via CSS class strategy (shadcn default)

## Scope

### In scope

- Electron + React + TypeScript project setup via electron-vite
- FSD-lite renderer directory scaffolding (app, widgets, features, entities, shared)
- Electron main, preload, backend directory structure
- Tailwind CSS v4 + shadcn/ui integration
- Vitest with pure/unit test split
- ESLint 9 flat config + Prettier
- Chaperone configuration aligned with CLAUDE.md conventions
- Minimal app shell proving the full stack renders
- `.gitignore` for Electron + Node

### Out of scope

- Project entity or persistence (Phase 1)
- Any real backend logic (Phase 1+)
- Routing (not needed until multiple views exist)
- IPC communication (Phase 1)
- E2E test setup with Playwright (deferred — add when there are real user flows)

## Tech Decisions

| Decision                  | Choice                     | Rationale                                                 |
| ------------------------- | -------------------------- | --------------------------------------------------------- |
| Build tool                | electron-vite              | Single config for main + preload + renderer. Fast HMR.    |
| Tailwind integration      | `@tailwindcss/vite` plugin | Tailwind v4 CSS-first approach — no JS config file needed |
| shadcn component location | `src/shared/ui/`           | Fits FSD shared layer — accessible to all slices          |
| shadcn utility location   | `src/shared/lib/`          | `cn()` in `cn.pure.ts` — pure function, testable          |
| Test split                | Vitest `include` patterns  | `*.pure.test.ts` for pure, `*.test.ts(x)` for unit        |
| Window chrome             | System title bar           | Simplest for Phase 0 — customize later if needed          |
| Dark mode                 | CSS class strategy         | shadcn default — `dark` class on `<html>` toggles theme   |

## Deliverables

### Root configuration files

| File                      | What it does                                                                     |
| ------------------------- | -------------------------------------------------------------------------------- |
| `package.json`            | All dependencies, npm scripts, project metadata                                  |
| `electron.vite.config.ts` | electron-vite config mapping `electron/main`, `electron/preload`, `src/`         |
| `tsconfig.json`           | Renderer TypeScript config (strict, path alias `@/` → `src/`)                    |
| `tsconfig.node.json`      | Main and preload TypeScript config                                               |
| `vitest.config.ts`        | Vitest config with workspace or project-based pure/unit split                    |
| `eslint.config.ts`        | ESLint 9 flat config (TypeScript + React rules)                                  |
| `.prettierrc`             | Consistent formatting (semi: false, singleQuote: true, etc.)                     |
| `components.json`         | shadcn/ui CLI config pointing to `src/shared/ui/` and `src/shared/lib/`          |
| `.chaperone.json`         | Convention rules matching CLAUDE.md (FSD layers, file naming, import boundaries) |
| `.gitignore`              | `node_modules/`, `dist/`, `out/`, `.env`, OS files                               |

### Electron files

| File                        | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `electron/main/index.ts`    | Creates BrowserWindow, loads renderer in dev/prod, handles app lifecycle |
| `electron/preload/index.ts` | `contextBridge.exposeInMainWorld()` — empty API surface for Phase 0      |

### Renderer files

| File                             | What it does                                                  |
| -------------------------------- | ------------------------------------------------------------- |
| `src/index.html`                 | HTML entry: `<div id="root">`, script tag to `app/index.tsx`  |
| `src/app/index.tsx`              | `createRoot(document.getElementById('root')).render(<App />)` |
| `src/app/App.container.tsx`      | Root app container — wraps presentational with any providers  |
| `src/app/App.presentational.tsx` | App shell layout — placeholder content, proves stack works    |
| `src/app/global.css`             | `@import "tailwindcss"`, shadcn CSS variables, theme config   |
| `src/shared/lib/cn.pure.ts`      | `cn()` utility: `clsx` + `tailwind-merge`                     |
| `src/shared/ui/button.tsx`       | shadcn Button component (installed via CLI or manually)       |
| `src/shared/index.ts`            | Barrel export for shared layer                                |
| `src/entities/index.ts`          | Barrel export (empty — populated in Phase 1)                  |
| `src/features/index.ts`          | Barrel export (empty — populated in later phases)             |
| `src/widgets/index.ts`           | Barrel export (empty — populated in later phases)             |

### Test files

| File                             | What it tests                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `src/shared/lib/cn.pure.test.ts` | `cn()` merges classes correctly, handles conditionals, resolves Tailwind conflicts |
| `src/app/App.container.test.tsx` | App mounts and renders placeholder content without crashing                        |

### App shell (Phase 0 visual)

```
┌──────────────────────────────────────────┐
│ Convergence                       _ □ x  │  ← system title bar
├──────────────────────────────────────────┤
│                                          │
│                                          │
│              Convergence                 │
│                                          │
│      UI-first desktop app for            │
│      managing agent work.                │
│                                          │
│           Phase 0 — Ready                │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

Minimal. No routing, no sidebar, no real content. Proves Electron + React + Tailwind + shadcn render correctly end-to-end.

## Implementation Order

Steps should be executed roughly in this sequence. Each step should be verifiable before moving to the next.

### Step 1: Project initialization

- Update `package.json` with all dependencies and scripts
- Create `.gitignore`
- Run `npm install`
- **Verify:** `npm install` succeeds, `node_modules/` exists

### Step 2: TypeScript configuration

- Create `tsconfig.json` for renderer (strict mode, `@/` path alias, jsx: react-jsx)
- Create `tsconfig.node.json` for Electron main and preload
- **Verify:** `npx tsc --noEmit` runs (may have no files yet)

### Step 3: electron-vite configuration

- Create `electron.vite.config.ts`
- Configure main entry: `electron/main/index.ts`
- Configure preload entry: `electron/preload/index.ts`
- Configure renderer root: `src/`
- Add Tailwind Vite plugin to renderer config
- **Verify:** config file parses without error

### Step 4: Electron main + preload

- Create `electron/main/index.ts` — app ready → create window → load URL (dev) or file (prod)
- Create `electron/preload/index.ts` — `contextBridge.exposeInMainWorld('electronAPI', {})`
- **Verify:** `npm run dev` opens an Electron window (blank at this point)

### Step 5: Renderer entry + Tailwind

- Create `src/index.html` with `<div id="root">`
- Create `src/app/global.css` with Tailwind import and shadcn CSS variables
- Create `src/app/index.tsx` — React 19 `createRoot` entry
- Create `src/app/App.container.tsx` and `src/app/App.presentational.tsx`
- **Verify:** `npm run dev` shows styled placeholder content in the Electron window

### Step 6: shadcn/ui setup

- Create `components.json` pointing to `src/shared/ui/` and `src/shared/lib/`
- Create `src/shared/lib/cn.pure.ts` — `cn()` utility (clsx + tailwind-merge)
- Install Button component into `src/shared/ui/`
- Use Button in App.presentational to prove it renders
- **Verify:** Button renders with correct Tailwind styling

### Step 7: FSD layer scaffolding

- Create barrel `index.ts` files for: `src/shared/`, `src/entities/`, `src/features/`, `src/widgets/`
- Ensure empty layers export nothing (just a comment or empty export)
- **Verify:** All barrel files exist, `npm run typecheck` passes

### Step 8: Vitest setup

- Create `vitest.config.ts` with pure and unit test configurations
- Add test scripts to `package.json`
- Create `src/shared/lib/cn.pure.test.ts` — test `cn()` with class merging, conditionals, conflicts
- Create `src/app/App.container.test.tsx` — test that App mounts and renders expected content
- **Verify:** `npm run test:pure` passes, `npm run test:unit` passes

### Step 9: ESLint + Prettier

- Create `eslint.config.ts` — flat config with TypeScript, React, import rules
- Create `.prettierrc`
- Add lint/format scripts to `package.json`
- Fix any lint errors in existing files
- **Verify:** `npm run lint` passes, `npm run format` passes

### Step 10: Chaperone setup

- Create `.chaperone.json` with rules matching CLAUDE.md conventions
- Run `chaperone check --fix`
- Fix any issues
- **Verify:** `chaperone check --fix` passes cleanly

### Step 11: Production build verification

- Run `npm run build`
- Verify output in `dist/` or `out/`
- **Verify:** build succeeds without errors

## Verification Gate

All commands must pass before Phase 0 is complete:

```bash
npm install                  # no errors
npm run dev                  # Electron window opens, placeholder visible
npm run build                # production build succeeds
npm run test:pure            # passes (cn utility tests)
npm run test:unit            # passes (App render test)
npm run lint                 # no errors
npm run typecheck            # no type errors
chaperone check --fix        # passes
```

## Dependencies to Install

### Production

- `react`, `react-dom` — UI framework
- `zustand` — state management (used from Phase 1, install now to avoid churn)
- `clsx`, `tailwind-merge` — for `cn()` utility
- `class-variance-authority` — shadcn dependency for component variants
- `lucide-react` — icon library (shadcn default)

### Development

- `electron` — desktop framework
- `electron-vite` — build tooling
- `vite` — bundler
- `@tailwindcss/vite`, `tailwindcss` — styling
- `typescript` — language
- `@types/react`, `@types/react-dom` — type definitions
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` — testing
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks` — linting
- `prettier` — formatting

## Risks

| Risk                                          | Mitigation                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| electron-vite custom paths don't work cleanly | Fall back to default structure and alias in tsconfig                 |
| Tailwind v4 + shadcn compatibility issues     | Pin to known-working versions; fall back to Tailwind v3 if blocking  |
| chaperone rules too strict for initial setup  | Start with core rules only, expand per-phase                         |
| Node 24 + Electron compatibility              | Electron bundles its own Node; renderer and build use system Node 24 |
