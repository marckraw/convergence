# Session Context Window Telemetry

## Goal

Show the current session context-window state in the main session UI without
mixing it up with account rate limits or quota.

## Product intent

- Codex should show provider-reported context usage.
- Claude Code should use provider-reported context when it is available in the
  headless stream; otherwise the UI should explicitly say the data is
  unavailable.
- We do not want a fake cross-provider abstraction that hides differences in
  telemetry quality.

## V1 behavior

- Add a compact context indicator to the session header.
- Available state:
  - small circular meter
  - text like `82% left`
  - hover details with `used / window`
- Unavailable state:
  - compact `Ctx n/a` badge
  - hover explanation

## Data model

Persist a small `context_window` JSON blob on the `sessions` row.

Shape:

- `availability: "available"`
  - `source: "provider" | "estimated"`
  - `usedTokens`
  - `windowTokens`
  - `usedPercentage`
  - `remainingPercentage`
- `availability: "unavailable"`
  - `source: "provider" | "estimated"`
  - `reason`

## Provider strategy

### Codex

Use `codex app-server` notifications.

- subscribe to `thread/tokenUsage/updated`
- derive current context from provider-reported token usage
- persist the latest state on the session

Codex is the only provider where Convergence currently has a direct runtime
protocol surface for this feature.

### Claude Code

Convergence currently uses:

- `claude -p --output-format stream-json`

Anthropic documents context-window data for Claude Code statusline hooks, but
that is not yet guaranteed on the headless stream surface.

V1 strategy:

- attempt to read `context_window` if it appears in stream-json events
- if it does not appear, persist `unavailable`

## Out of scope

- rate limits
- quota usage
- billing/cost
- heuristic estimation when provider data is unavailable

Heuristic estimation can be explored later, but should not silently replace
provider-reported telemetry.
