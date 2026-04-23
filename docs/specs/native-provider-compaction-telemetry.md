# Native Provider Compaction Telemetry

Validated on April 23, 2026.

Local binaries observed on this machine:

- `claude` `2.1.118`
- `codex` `0.122.0`
- `pi` `0.67.6`

## Goal

Distinguish provider-native context compaction from Convergence's own
fork-and-summarize flow, then surface native compaction clearly in the UI.

This spec is about the provider deciding it needs to compact its own live
conversation context during a running session. It is not about Convergence's
explicit fork strategy (`full` vs `summary`).

## Current Convergence Harness

Current provider integrations live here:

- `electron/backend/provider/claude-code/claude-code-provider.ts`
- `electron/backend/provider/codex/codex-provider.ts`
- `electron/backend/provider/pi/pi-provider.ts`

Current UI surfaces live here:

- `src/entities/session/session.activity.pure.ts`
- `src/widgets/session-view/session-view.container.tsx`
- `src/widgets/global-status-bar/project-summary.presentational.tsx`

## Provider Differences

### Claude Code

- Official docs say Claude Code auto-compacts when context exceeds `95%`
  capacity.
- Official docs expose `PreCompact` and `PostCompact` hooks with `manual` and
  `auto` triggers.
- Convergence currently runs Claude in headless `stream-json` mode, not through
  the interactive TUI.
- Unlike Codex and Pi, Claude does not document one stable first-class
  app-client compaction event on the headless stream surface.
- In practice, Convergence can only do best-effort detection from the stream:
  hook-shaped events (`PreCompact` / `PostCompact`) and compaction content
  blocks if they appear.

Implication:

- Claude should not be modeled as "compacts at 80%". The official documented
  threshold is `95%`, and stream observability is weaker than Codex or Pi.
- We should not mutate the user's Claude settings just to add hooks in V1.

### Codex

- Official `codex app-server` docs define a first-class compaction item
  lifecycle.
- Manual compaction can be triggered with `thread/compact/start`.
- Automatic or manual compaction streams as `item/started` and
  `item/completed` with `item.type = "contextCompaction"`.
- The older/deprecated `compacted` item still exists in protocol docs and is
  worth tolerating defensively.
- Token usage is separate and arrives on `thread/tokenUsage/updated`.

Implication:

- Codex compaction should be driven from explicit protocol events, not inferred
  from context-window percentages.

### Pi

- Pi RPC exposes explicit `compaction_start` and `compaction_end` events.
- Pi docs define auto-compaction as:
  `contextTokens > contextWindow - reserveTokens`.
- The default `reserveTokens` is `16384`.
- Pi also keeps a recent unsummarized tail; default `keepRecentTokens` is
  `20000`.
- Pi includes a `reason` for compaction events:
  `manual`, `threshold`, or `overflow`.

Implication:

- Pi gives the cleanest native compaction telemetry surface of the three
  providers.

## Product Contract

Provider-native compaction should surface in three ways:

- Session `activity` becomes `'compacting'`
- Transcript gets a visible note for start and completion
- The active session header and global status bar show the current activity

We should not show made-up unified thresholds like "auto-compact at 80%" in the
UI. Each provider uses different rules:

- Claude: documented `95%`
- Codex: harness-controlled and reported explicitly via app-server items
- Pi: `contextWindow - reserveTokens`

## Current Status

Convergence now maps native compaction into the shared activity channel:

- Claude: best-effort detection from hook/content-block stream shapes
- Codex: `contextCompaction` item lifecycle, with deprecated variants tolerated
- Pi: explicit RPC compaction events

The normalized activity label is `compacting context…`.

## Follow-up

- If we want deterministic Claude compaction telemetry later, we need a
  deliberate hook strategy that does not mutate user config unexpectedly.
- If product wants a richer timeline, we should eventually persist native
  compaction as structured activity events instead of only transcript notes.

## Sources

- Claude Code costs:
  `https://docs.anthropic.com/en/docs/claude-code/costs`
- Claude Code subagent auto-compaction:
  `https://code.claude.com/docs/en/sub-agents#auto-compaction`
- Claude Code hooks:
  `https://code.claude.com/docs/en/hooks`
- Codex app-server protocol:
  `https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md`
- Codex app-server background:
  `https://openai.com/index/unlocking-the-codex-harness/`
- Pi RPC docs:
  `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md`
- Pi compaction docs:
  `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md`
