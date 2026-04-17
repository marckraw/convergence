# Convergence — Project Spec

> Supersedes `docs/plans/bootstrap-roadmap.md` as the authoritative planning document.
> Companion doc: `docs/architecture/quick-reference.md` (architecture details).

## Objective

Convergence is a UI-first Electron desktop app for managing AI agent work across local codebases. It replaces Divergence (Tauri + Rust) with a simpler Electron + Node stack while preserving the core product ideas: project-centered workflows, attention-driven session management (waiting on you, needs review, archived history), and a provider-neutral agent runtime.

**Users:** Software engineers who run AI coding agents (Claude Code, Codex) against local repositories and need a dedicated surface to manage multiple concurrent agent sessions.

**Success looks like:** An engineer opens Convergence, points it at a local repo, launches agent sessions across providers, and the app clearly surfaces which sessions need attention, which are done, and what changed — without fighting terminal multiplexers or browser tabs.

## Tech Stack

| Layer                  | Choice                       | Version                |
| ---------------------- | ---------------------------- | ---------------------- |
| Desktop framework      | Electron                     | latest stable          |
| Build tooling          | electron-vite                | latest                 |
| Renderer framework     | React                        | 19.x                   |
| Language               | TypeScript                   | 5.x (strict mode)      |
| Bundler                | Vite                         | 6.x                    |
| Styling                | Tailwind CSS                 | 4.x (CSS-first config) |
| Component primitives   | shadcn/ui (Radix primitives) | latest                 |
| State management       | Zustand                      | 5.x                    |
| Unit/integration tests | Vitest                       | 3.x                    |
| Component testing      | React Testing Library        | latest                 |
| E2E tests              | Playwright (Electron)        | latest                 |
| Linting                | ESLint (flat config)         | 9.x                    |
| Formatting             | Prettier                     | 3.x                    |
| Convention checking    | chaperone                    | 0.6.x                  |
| Runtime                | Node                         | 24.x                   |

### Why these choices

- **Zustand over Jotai:** Convergence state is store-shaped (sessions, projects, providers). Zustand stores are usable outside React (critical for Electron IPC handlers), have built-in `persist` middleware for disk storage, and map naturally to domain entities. Jotai's atom model would reconstruct store patterns with more wiring.
- **electron-vite:** Purpose-built Vite integration for Electron. Handles main, preload, and renderer builds in one config. Fast HMR for renderer, proper source maps, clean dev experience.
- **shadcn/ui:** Accessible Radix primitives with Tailwind styling, copied into the project (not a runtime dependency). Consistent design system from day one without building primitives from scratch.
- **No monorepo tooling:** Single package with `electron/` and `src/` as directories. Turborepo/nx adds value with multiple packages that have independent build steps — not needed yet.

## Commands

```bash
# Development
npm run dev                  # Start Electron app in dev mode with HMR

# Build
npm run build                # Production build (main + preload + renderer)
npm run build:preview        # Build + launch built app for verification

# Test
npm run test                 # Run all tests
npm run test:pure            # Pure function tests only (*.pure.test.ts)
npm run test:unit            # Unit tests only (*.test.ts, *.test.tsx)
npm run test:e2e             # Playwright E2E tests (future phases)

# Code quality
npm run lint                 # ESLint check
npm run lint:fix             # ESLint auto-fix
npm run format               # Prettier check
npm run format:fix           # Prettier auto-fix
npm run typecheck            # tsc --noEmit

# Post-task verification (required after every task)
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

## Project Structure

```
convergence/
├── docs/
│   ├── architecture/              # Architecture docs
│   │   └── quick-reference.md
│   └── specs/                     # Spec documents
│       ├── project-spec.md        # This file
│       └── phase-*.md             # Per-phase detailed specs
├── electron/
│   ├── main/                      # Electron main process
│   │   └── index.ts               # App bootstrap, window lifecycle
│   ├── preload/                   # Context bridge
│   │   └── index.ts               # Exposes safe APIs to renderer
│   └── backend/                   # Backend services (Node)
│       └── (populated in later phases)
├── src/                           # Renderer (React) — FSD-lite
│   ├── app/                       # App shell, providers, global styles
│   ├── widgets/                   # Composed UI blocks
│   ├── features/                  # User-facing capabilities
│   ├── entities/                  # Domain objects (project, session)
│   └── shared/                    # Shared primitives
│       ├── ui/                    # shadcn/ui components
│       ├── lib/                   # Utilities (cn, etc.)
│       └── types/                 # Shared types
├── tests/
│   └── e2e/                       # Playwright E2E tests (future phases)
├── AGENTS.md
├── CLAUDE.md
├── electron.vite.config.ts
├── eslint.config.ts
├── .prettierrc
├── components.json                # shadcn/ui config
├── .chaperone.json
├── package.json
├── tsconfig.json                  # Renderer TS config
├── tsconfig.node.json             # Main/preload TS config
├── vitest.config.ts
├── .gitignore
└── .nvmrc
```

**FSD-lite dependency directions (renderer only):**

```
app → widgets → features → entities → shared
```

One-way only. Cross-slice imports through `index.ts` barrel files. No deep imports across slice boundaries.

**Electron boundary:** Renderer code never imports Electron directly. All Electron access goes through preload context bridge, consumed via `*.api.ts` files in the renderer.

## Code Style

One example showing the target conventions:

```tsx
// src/entities/project/project.types.ts
export interface Project {
  id: string
  name: string
  repositoryPath: string
  createdAt: string
  updatedAt: string
}

// src/entities/project/project.model.ts
import { create } from 'zustand'
import type { Project } from './project.types'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  setActiveProject: (id: string) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProjectId: null,
  setActiveProject: (id) => set({ activeProjectId: id }),
}))

// src/entities/project/index.ts (public API)
export type { Project } from './project.types'
export { useProjectStore } from './project.model'

// src/features/project-create/project-create.presentational.tsx
import type { FC } from 'react'
import { Button } from '@/shared/ui/button'

interface ProjectCreateFormProps {
  onSubmit: (path: string) => void
  error: string | null
}

export const ProjectCreateForm: FC<ProjectCreateFormProps> = ({
  onSubmit,
  error,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault()
      /* ... */
    }}
  >
    {error && <p className="text-destructive text-sm">{error}</p>}
    <Button type="submit">Create Project</Button>
  </form>
)
```

**Key conventions:**

- Named exports only (no default exports)
- Explicit `interface` for component props
- Path alias `@/` maps to `src/`
- Files named by role: `.types.ts`, `.model.ts`, `.presentational.tsx`, `.container.tsx`, `.pure.ts`, `.api.ts`, `.service.ts`, `.styles.ts`
- Full conventions in CLAUDE.md (file naming, import boundaries, presentational vs container rules)

## Testing Strategy

### Three test levels

| Level | File pattern          | Runner       | DOM      | What it tests                              |
| ----- | --------------------- | ------------ | -------- | ------------------------------------------ |
| Pure  | `*.pure.test.ts`      | Vitest       | No       | Pure functions, utilities, data transforms |
| Unit  | `*.test.ts(x)`        | Vitest + RTL | jsdom    | Components, hooks, stores, integrations    |
| E2E   | `tests/e2e/*.spec.ts` | Playwright   | Electron | Full app flows                             |

### Test location

Co-located with source files:

- `cn.pure.ts` → `cn.pure.test.ts` (same directory)
- `App.container.tsx` → `App.container.test.tsx` (same directory)
- E2E tests in `tests/e2e/`

### Vitest split strategy

- `test:pure` — glob matches `**/*.pure.test.ts` only. No DOM, no jsdom. Fast, runs everywhere.
- `test:unit` — glob matches `**/*.test.ts(x)` excluding pure tests. Uses jsdom for DOM tests.
- `test` — runs both.

### Coverage targets

- Pure functions: aim for 100%
- Zustand stores and models: high (>80%)
- Presentational components: render tests for non-trivial ones
- Containers: test orchestration logic, mock dependencies
- E2E: critical user flows per phase

## Boundaries

### Always do

- Run `npm run test:pure`, `npm run test:unit`, `chaperone check --fix` after every task
- Follow FSD-lite layer rules and file naming conventions from CLAUDE.md
- Keep Electron access behind preload + `*.api.ts` wrappers
- Write tests for new logic
- Use shadcn/ui primitives before building custom components
- Update the spec when scope changes
- Use named exports only

### Ask first

- Adding new npm dependencies
- Changing Electron main process bootstrap
- Modifying build/bundle configuration
- Persistence format or schema changes
- Adding new FSD slices or entities
- Changing the test split strategy

### Never do

- Import Electron directly in renderer code
- Create files under `src/components`, `src/hooks`, `src/lib` (use FSD layers instead)
- Skip test gates
- Commit secrets or credentials
- Use default exports
- Couple the session model to a specific provider
- Add terminal features before Phase 8
- Hardcode single-repo assumptions into the project model

## Phase Overview

Each phase is self-contained and leaves the app testable end-to-end. A detailed spec is written at the start of each phase — not all upfront.

| Phase | Name                       | Objective                                   | Key Deliverable                           |
| ----- | -------------------------- | ------------------------------------------- | ----------------------------------------- |
| 0     | Repository Bootstrap       | Disciplined repo with working toolchain     | App opens, test gate passes               |
| 1     | Project Foundation         | Project as the central domain entity        | Create/open/persist projects              |
| 2     | Workspaces (Git Worktrees) | Parallel branch work via worktrees          | Create/manage worktrees                   |
| 3     | Agent Runtime Core         | Provider-neutral session backbone           | Fake sessions with event bus              |
| 4     | Session Attention Surface  | Attention routing, acknowledgement, archive | Multi-session UX with working-set control |
| 5     | Real Provider Integrations | Claude Code + Codex adapters                | Run real agents against repos             |
| 6     | Project-Aware Tooling      | Changed files, project metadata panels      | Session-to-project linking                |
| 7     | Multi-Agent Orchestration  | Agent-to-agent collaboration and handoffs   | Conductor workflows, agent chains         |
| 8     | Multi-Repo Projects        | Multiple repository roots per project       | Multi-repo project model                  |
| 9     | Terminal Surface           | Embedded terminal (deferred)                | Terminal in project context               |

### Phase dependency chain

```
0 → 1 → 2 → 3 → 4 → 5 → 6 ─→ 7 → 8 → 9
                                ↑
                          requires real providers
```

Each phase builds on the previous. No phase should require rewriting a prior phase's core model.

### Non-goals for first phases

- Terminal-first UX
- tmux integration
- Full multi-repo support from day one
- Broad provider matrix beyond Claude Code and Codex
- Multi-agent orchestration before real providers work (Phase 7 depends on Phase 5)

## Multi-Agent Collaboration Vision

Convergence's long-term differentiator: agents that collaborate, not just coexist.

### The problem

Today, AI coding agents work in isolation. You can run Claude Code and Codex side by side, but they don't know about each other. If Agent A writes code and Agent B should review it, _you_ are the message bus — copying context between them manually.

### The solution (Phase 7)

Convergence becomes the orchestration layer. Sessions can communicate, and the user defines collaboration patterns:

**Level 1 — Implicit collaboration (file-level):**
Multiple sessions on the same workspace see each other's file changes through the shared filesystem. No special wiring needed — already supported by the workspace model.

**Level 2 — Explicit message passing:**
Sessions can send messages to each other. A "conductor" (automated or user-triggered) reads output from Session A and injects it as input to Session B. The `sendMessage()` method on `SessionHandle` already supports this.

**Level 3 — Orchestrated workflows:**
User-defined workflows that chain agents: "Claude Code implements → Codex reviews → Claude Code fixes review comments → repeat until clean." The app manages handoffs and pings the user only when the cycle gets stuck or finishes.

**Level 4 — Agent pipelines:**
Declarative pipelines where output of one session feeds the next. Like CI but with agents: "Implement → Review → Fix → Test → Ship."

### Architectural implications for earlier phases

These decisions keep the door open for multi-agent collaboration:

1. **Sessions are handles with `sendMessage()`** — a conductor is just code that calls this method
2. **Sessions know about siblings** — query all sessions on a workspace to coordinate
3. **Provider-neutral events** — all providers emit the same transcript format, so cross-provider collaboration works naturally
4. **Attention model as coordination signal** — "finished" from Session A can trigger "start" on Session B

## Always-on Product Rules

These apply across all phases:

1. **Transcript stability** is a product requirement, not a visual nice-to-have
2. **Attention routing and archive lifecycle** are first-class features
3. **Project is the top-level domain object** — not sessions, not repos
4. **Provider-neutral above the adapter boundary** — session model never couples to Claude/Codex specifics
5. **Every phase leaves the app testable end-to-end** — no phase ships a broken intermediate state
6. **UI-first** — the transcript is the primary surface; debug panels, changed files, and metadata are secondary
7. **Multi-agent ready** — session model and event system must support future agent-to-agent collaboration without rewrites

## Open Questions

1. **Custom title bar vs system title bar?** → Start with system title bar in Phase 0, revisit later
2. **Dark mode from Phase 0?** → Recommended (shadcn supports it with minimal setup via CSS variables)
3. **Electron auto-updater?** → Defer to post-Phase 5
4. **Session persistence format?** → Decide in Phase 3 spec (JSON files vs SQLite vs IndexedDB)
5. **IPC protocol style?** → Decide in Phase 1 spec (typed channels vs tRPC-style vs custom)
