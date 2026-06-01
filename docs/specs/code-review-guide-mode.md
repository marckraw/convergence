# Code Review Guide Mode

## Problem Statement

Convergence already has a code review surface for local working-tree and
base-branch diffs, but the review workflow is still file-first. Reviewers need
to infer the implementation story from a flat changed-file list: which files
belong together, what order to inspect them in, which changes are risky, and
which files can be skimmed.

Large agent-generated changes make this worse. A single task can touch UI,
renderer state, Electron backend services, IPC contracts, persistence, tests,
and docs. A reviewer needs a guided walkthrough that groups the real diffs into
coherent sections while keeping the code close enough to inspect.

## Solution

Add a Guide view inside the existing Convergence code review surface. The
current `working-tree` and `base-branch` review modes continue to represent the
diff source. A new presentation view switches between the existing flat Diff
experience and a guided walkthrough.

The Guide view asks an agent to classify the changed files and patches into
ordered review sections. Each section explains what changed, why the grouped
files belong together, what the reviewer should inspect, and which files or
hunks matter. The UI renders the narrative alongside real diffs, with sticky
section context while scrolling and file links that scroll directly to the
corresponding diff.

## User Stories

1. As a reviewer, I want to open Guide from the existing code review surface,
   so that I can use guided review without leaving Convergence.
2. As a reviewer, I want Working Tree and Base Branch to remain separate from
   Guide and Diff, so that I understand which comparison source I am reviewing.
3. As a reviewer, I want changed files grouped into meaningful review sections,
   so that I can inspect related implementation work together.
4. As a reviewer, I want sections ordered by review importance, so that I know
   where to start.
5. As a reviewer, I want each section to list its files, so that I can inspect
   the exact diffs behind the explanation.
6. As a reviewer, I want file references in a section to scroll to that file's
   diff, so that I do not lose context while moving between prose and code.
7. As a reviewer, I want the current section header to stay sticky while I
   scroll its files, so that I always know what part of the walkthrough I am in.
8. As a reviewer, I want the next section to naturally take over after the last
   file in the current section, so that the walkthrough behaves like chapters.
9. As a reviewer, I want risk and checklist signals per section, so that I can
   focus review attention on behaviorally important changes.
10. As a reviewer, I want the Guide to use real local diff data, so that the
    walkthrough is grounded in the same code review target as the Diff view.
11. As a reviewer, I want a clear pending/generate/retry state, so that I know
    when guide generation has not happened or has failed.
12. As a reviewer, I want an existing guide to reload quickly, so that I can
    resume review without regenerating sections.
13. As a reviewer, I want files not selected by the agent to still appear in a
    fallback section, so that no changed file silently disappears.
14. As a reviewer, I want the existing flat Diff view to remain available, so
    that I can fall back to traditional file-by-file review.
15. As a builder, I want the guide contract to be testable without depending on
    a model call, so that UI and persistence can be developed reliably.
16. As a builder, I want guide generation isolated behind a backend service, so
    that prompt construction, model calls, schema validation, and persistence do
    not leak into renderer code.

## Product Behavior

The code review toolbar adds a presentation control:

- `Guide`: ordered walkthrough view.
- `Diff`: existing file-tree plus selected-file diff view.

The existing source mode control remains:

- `Working Tree`: local working-tree changes.
- `Base Branch`: comparison against the resolved base branch.
- `Pull Request`: shown for remote open PR targets discovered from GitHub
  without a local workspace.

Guide is the preferred review view once a guide exists or can be generated.
Diff remains the reliable fallback and should continue to work exactly as it
does today.

The Guide view uses a compact developer-tool layout:

- left rail: section outline, risk, file count, generation state;
- main pane: vertically stacked guide sections;
- sticky section header: title, summary, risk, checklist, file links;
- section body: real diffs for files in that section;
- file links scroll to their corresponding file diff within the guide pane.

The review target rail includes local project/session/workspace targets plus
open GitHub pull requests for the active project. Remote PR targets do not
create worktrees just to become reviewable; Convergence fetches the PR head into
an internal Git ref when it needs the changed-file summary or a file diff. A
review session/worktree can still be created later through the existing PR
review flow when the reviewer wants agent notes or local execution.

## Guide Data Contract

The persisted guide is keyed by:

- review target id;
- review source mode;
- cache identity for the current diff snapshot.

Guide records contain:

- overview summary;
- ordered sections;
- generation metadata and status;
- validation errors when generation fails.

Each section contains:

- stable section id;
- title;
- concise summary;
- narrative;
- risk level: `low`, `medium`, or `high`;
- checklist items;
- ordered files with per-file rationale and optional hunk hints.

The renderer should only render validated guide data. Backend validation must
ensure that every referenced file exists in the current changed-file summary.
Unknown files are rejected or dropped before persistence. Changed files not
referenced by any generated section are appended to an `Other changes` fallback
section.

## Generation Pipeline

Guide generation runs in the Electron backend.

1. Resolve the selected code review target and source mode.
2. Load the current code review summary.
3. Fetch patches for changed files, using size limits so large reviews remain
   bounded.
4. Build a guide-generation prompt from metadata, file list, status, and patch
   excerpts.
5. Ask the selected agent/provider for strict JSON output.
6. Validate the output against the guide schema and current changed-file list.
7. Add a fallback section for any unassigned files.
8. Persist the guide by target, mode, and cache identity.
9. Return the persisted guide to the renderer.

The prompt should optimize for review traversal, not generic summarization. It
should ask for implementation chapters, risk signals, and files that should be
reviewed together.

The first implementation may ship with a deterministic generator behind the
same contract. That allows the UI, API, persistence, and tests to land before
the model pipeline is wired. The deterministic generator should group all files
into a small number of predictable sections from paths/statuses and clearly
mark the guide as generated without AI.

## Prompt Direction

The model should receive:

- target metadata;
- selected comparison source;
- file list with statuses;
- patch excerpts or summaries;
- existing PR metadata when available;
- constraints on output shape.

The model should produce:

- 3 to 8 ordered review sections for normal-sized changes;
- fewer sections for small changes;
- one fallback section only when the changes are not separable;
- risk labels based on behavior, persistence, provider/runtime boundaries,
  user-facing UI, and test coverage signals;
- file rationale that explains why a file belongs in that section;
- checklist items that describe what the reviewer should verify.

The model must not invent files, line numbers, external context, or test
results. If the prompt input does not include enough information, the guide
should say so in the section narrative.

## Renderer Architecture

Follow the existing FSD-lite split.

New renderer entity:

- `code-review-guide`: API wrapper, store/model, pure selectors, local types.

Existing surface changes:

- code review store owns selected presentation view;
- code review toolbar renders Guide/Diff control;
- code review surface loads or generates guide data for the selected target,
  source mode, and cache identity;
- Guide view composes presentational section/outline components and existing
  diff rendering primitives.

Presentational components must stay render-only. Data loading, scrolling state,
and generation actions belong in containers.

## Backend Architecture

New Electron backend module:

- `code-review-guide`

Responsibilities:

- schema and validation;
- prompt construction;
- deterministic fallback generation;
- model/provider orchestration;
- SQLite persistence;
- IPC handlers.

The module should depend on the existing code review service for summary and
file patches rather than duplicating git logic. Renderer code must access guide
data only through preload-exposed IPC and a `*.api.ts` wrapper.

## Persistence

Add SQLite tables for guides and sections. The schema should support:

- one guide per target/mode/cache identity;
- generation status;
- overview;
- raw validated JSON if that keeps the schema simple;
- ordered sections;
- timestamps.

The first version can persist normalized guide JSON in a guide row if that
keeps the slice small. Normalize into separate section tables only when review
progress or querying requires it.

## Testing Decisions

Tests should focus on external behavior and stable contracts:

- pure tests for guide schema validation and fallback section assignment;
- pure tests for prompt input construction and output normalization;
- backend service tests for load/generate/cache behavior with fake dependencies;
- renderer store tests for load/generate/error state;
- component tests for Guide/Diff switching, section rendering, file link
  navigation, and retry states;
- avoid brittle tests against Pierre internals or exact visual layout.

## Out of Scope

- GitHub REST PR import inside Convergence. The current implementation uses the
  existing GitHub CLI dependency.
- Clerk, Neon, Drizzle, or standalone Codewalk auth/persistence.
- Posting review comments back to GitHub.
- Approval, merge, or submit-review flows.
- Shared team review progress.
- Full AI quality tuning beyond a usable first prompt and schema.

## Phased Plan

### Phase 1 - View Shell and Deterministic Guide

Deliver a demoable Guide view without model calls. Add Guide/Diff view state,
the renderer guide contract, deterministic guide generation, and a sticky guide
layout backed by real diffs.

### Phase 2 - Backend Persistence and IPC Contract

Persist guide records by target, source mode, and cache identity. Add preload
and renderer API boundaries so the guide can be loaded, generated, refreshed,
and retried without mixing backend details into the renderer.

### Phase 3 - Agent Prompt Pipeline

Add prompt construction, strict output validation, provider orchestration, and
fallback handling. The existing deterministic generator remains available for
tests and generation failure fallback.

### Phase 4 - Guided Review Polish

Refine sticky section behavior, file-link scrolling, empty/error states,
large-diff behavior, and compact visual hierarchy. Keep the UI restrained and
developer-tool focused.

### Phase 5 - Progress and Notes Integration

Connect guide sections to existing review notes and future review progress.
Section/file reviewed state can be layered on after the guide interaction is
stable.

## Linear Task Breakdown

Linear project: `convergence`

Linear milestone: `Code Review Guide Mode`

Parent issue: `MAR-1341` - Code Review Guide Mode

1. `MAR-1342` - Guide mode P1: view shell and deterministic guide.
2. `MAR-1343` - Guide mode P2: persist guides behind backend IPC.
3. `MAR-1344` - Guide mode P3: add agent prompt pipeline.
4. `MAR-1345` - Guide mode P4: polish sticky walkthrough navigation.
5. `MAR-1346` - Guide mode P5: integrate sections with notes and review progress.
