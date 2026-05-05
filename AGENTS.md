# Agent Instructions

## Post-task requirement

Agents must use the Node version from `.nvmrc` for all repo commands that
depend on Node tooling (`npm install`, Vitest, typecheck, chaperone, Vite,
Electron build/dev). If the current shell is on a different Node version,
switch first with your installed version manager, e.g. `nvm use` or
`fnm exec --using "$(cat .nvmrc)" -- <command>`. If the required Node version
is unavailable, report that explicitly instead of silently running verification
on the wrong runtime.

After every finished task, agents must run these commands in this repo:

- `npm install`
- `npm run typecheck`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

If a command fails because the current phase has not introduced that tool yet, report the failure clearly and fix the missing bootstrap in the next relevant task. Do not silently skip verification.

## Local dev server

Agents are not permitted to run `npm run dev` in this repo. When local UI
testing is needed, tell the user what to verify and ask them to run
`npm run dev` themselves.

## Prettier formatting

Always accept Prettier's reformatting. `chaperone check --fix` runs Prettier
across the repo and may rewrite files that were committed unformatted on a
prior branch. When that happens:

- Treat the resulting whitespace/wrapping diff as part of your task and stage
  it. Do not assume the modifications belong to "someone else's WIP" and skip
  them.
- If the formatter touches files outside the scope of your change, commit
  those formatting fixes in a separate `chore: prettier` commit on the same
  branch rather than leaving them dirty in the working tree or reverting
  them.
- Never commit code that fails `chaperone check` (no `--fix`). Run the
  non-fix variant before opening a PR if you suspect drift.

When modifying `electron-builder.yml`, any `package:mac*` script, or
`.github/workflows/publish-mac-release.yml`, also run
`npm run package:mac:unsigned` locally and confirm that
`release/latest-mac.yml` still lists both the x64 and arm64 ZIPs under
`files[]`. Missing or incorrect entries break auto-update silently for
everyone on that arch — see `docs/specs/auto-updates.md` and
`docs/runbook/auto-updates.md`.

## Architecture and File Organization

Source of truth:

- `docs/specs/project-spec.md`
- `docs/specs/phase-0-repo-bootstrap.md`
- `docs/architecture/quick-reference.md`

### FSD-lite (renderer)

This repo follows FSD-lite for renderer code:

- layered slices: `app`, `widgets`, `features`, `entities`, `shared`
- one-way dependencies from higher layers to lower layers only
- cross-slice imports via each slice `index.ts` public API
- UI split by role: `*.container.tsx` for orchestration, `*.presentational.tsx` for render-only UI

### Required folder strategy

Organize renderer TypeScript code using these layers:

- `src/app`
- `src/shared`
- `src/entities`
- `src/features`
- `src/widgets`

Do not introduce long-term code under flat legacy roots such as `src/components`, `src/hooks`, or `src/lib`.

Electron and Node backend code should live outside the renderer tree:

- `electron/main`
- `electron/preload`
- `electron/backend`

### Required file naming conventions

Use these suffixes for new or migrated files:

- `*.presentational.tsx`: render-only component, props in -> JSX out
- `*.container.tsx`: state/effects/orchestration wrapper for UI
- `*.styles.ts`: styling constants and class maps only
- `*.api.ts`: IO boundaries in the renderer, including preload-exposed Electron APIs
- `*.service.ts`: side-effectful use-case orchestration
- `*.model.ts` or `use*.ts`: local state/domain logic
- `*.pure.ts`: pure utilities only
- `*.types.ts`: local types for a slice/feature

Electron backend modules should prefer focused files such as:

- `ipc.ts`
- `service.ts`
- `state.ts`
- `types.ts`
- `provider.ts`

### Presentational vs container rules

`*.presentational.tsx` files must not contain side-effectful orchestration:

- no `useEffect`, `useLayoutEffect`, or `useInsertionEffect`
- no direct Electron imports
- no direct filesystem, process, or network bootstrapping

`*.container.tsx` files:

- own side effects and state wiring
- compose presentational components and pass view models and handlers to them
- may render JSX directly when a separate presentational would be a hollow pass-through

### Import boundary rules

Renderer dependency directions:

- `app` -> `widgets`, `features`, `entities`, `shared`
- `widgets` -> `features`, `entities`, `shared`
- `features` -> `entities`, `shared`
- `entities` -> `shared`
- `shared` -> `shared`

Cross-slice imports must go through the slice `index.ts` public API. Avoid deep private imports across slices.

Renderer code must not import Electron directly except through approved API boundary files. Keep Electron access behind preload-exposed contracts and `*.api.ts` wrappers.

### Backend rules

Electron main-process and backend code should follow the same split discipline that Divergence used in Rust:

- keep app bootstrap thin
- keep IPC handlers thin
- keep state and persistence isolated from provider integrations
- isolate Claude Code and Codex adapters in dedicated provider modules
- keep project copy logic in dedicated services, not mixed into session runtime code

### Product constraints for current phases

- Convergence is UI-first
- terminal support is out of scope for the first phases
- first-class providers are Claude Code and Codex
- project model starts as one repository root but must stay extendable to multi-repo projects
- project copy flows must support an ignored copy skip list like Divergence

### Migration behavior for agents

When adding new code, prefer landing the final intended architecture directly instead of creating throwaway legacy folders. If a shortcut would make the next phase harder, do not take it.
