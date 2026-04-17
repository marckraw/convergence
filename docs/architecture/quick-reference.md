# Convergence Architecture Quick Reference

## Product direction

Convergence is a UI-first desktop app for managing agent work across local codebases.

Initial product focus:

- first-class agent sessions for Claude Code and Codex
- project-centered workflows
- a strong attention surface: waiting on you, needs review, archived history
- no embedded terminal in the first phases

Later product focus:

- terminal support
- richer project structures with multiple repositories
- broader provider support if needed

## Core architectural choices

### 1. Electron + Node backend

Convergence replaces Divergence's Tauri + Rust backend with Electron + Node.

Suggested process layout:

- `electron/main`: window lifecycle, IPC registration, app bootstrap
- `electron/preload`: safe renderer bridge
- `electron/backend`: backend features and services
- `src`: renderer app only

The renderer must never depend directly on Node or Electron APIs outside approved `*.api.ts` boundaries.

### 2. FSD-lite renderer

Renderer code stays close to Divergence:

- `src/app`
- `src/widgets`
- `src/features`
- `src/entities`
- `src/shared`

Keep slice public APIs in `index.ts` files. Avoid deep imports across slices.

### 3. UI-first agent runtime

The transcript is the primary surface. Debug information, changed files, queue views, and project tools are secondary surfaces.

Design rule:

- one stable header
- one stable transcript scroll container
- one composer
- side panels and drawers for secondary concerns

Avoid the Divergence failure mode where the transcript competes with telemetry, approvals, debug panels, and changed files in the same vertical stack.

### 4. Provider-neutral session model

Session state should be provider-neutral and capable of representing:

- user messages
- assistant messages
- streaming status
- approvals
- user-input requests
- runtime phases
- attention state
- session completion and failure
- working-set lifecycle metadata such as archive state

Claude Code and Codex adapters should map into one shared session snapshot model.

### 5. Project model

Phase 1 project model:

- one project
- one local repository root

The data model must be extendable to:

- one project with multiple repositories
- copied project variants
- project-level settings and ignore rules

Do not hardcode assumptions that permanently tie a project to only one repository path.

### 6. Project copy strategy

Convergence keeps the Divergence idea of copying a project root into a new working directory with a skip list.

Requirements:

- configurable ignore copy skip list
- deterministic copy destination rules
- safe handling of large or generated directories
- project metadata that records source and copied locations

### 7. Verification rules

After every finished task, the expected verification flow is:

- `npm install`
- `npm run test:pure`
- `npm run test:unit`
- `chaperone check --fix`

Phase 0 must bootstrap the repo until these commands are real and useful.
