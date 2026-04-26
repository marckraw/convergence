# Claude Long-Lived CLI Streaming Input Roadmap

Future roadmap for replacing Claude Code's app-managed running follow-up queue
with a long-lived `claude` CLI stream.

## Context

Convergence intentionally integrates Claude Code through the user's installed
and authenticated `claude` CLI. We should not require
`@anthropic-ai/claude-agent-sdk`, Python SDK packages, or Anthropic API keys for
this provider path unless the product direction changes.

This matters because many users run Claude Code through their existing Claude
Code login/subscription. The SDK package path is optimized for API-key backed
custom applications, while this app's Claude provider is meant to behave like a
desktop harness around the local Claude Code CLI.

## Current V1 Behavior

The current Claude provider starts a `claude -p` process for each turn, writes a
single JSONL user message to stdin, closes stdin, and resumes later turns with
the captured Claude session id.

That supports normal completed-turn follow-up. While a Claude turn is running,
Convergence accepts user input into its own persisted queue and sends it only
after the active turn completes.

This is safe, but it is not true native mid-run Claude input.

## Target Behavior

Keep using the local `claude` CLI, but refactor the adapter around a long-lived
process:

```sh
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --include-partial-messages
```

The provider should keep stdin open and write additional JSONL user messages as
the user submits them. The app should stop advertising Claude's running
follow-up as app-managed once live smoke tests prove that the installed CLI
accepts additional messages reliably while the agent is working.

## Non-Goals

- Do not add `@anthropic-ai/claude-agent-sdk` to the app.
- Do not require `ANTHROPIC_API_KEY` for Claude Code provider usage.
- Do not route Claude traffic through the Anthropic Messages API.
- Do not expose Claude interrupt/steer UI until the CLI behavior is proven
  against local binaries.
- Do not regress the current per-turn `--resume` fallback.

## Research Questions

- Can a long-lived `claude -p --input-format stream-json` process stay open
  across multiple user messages under the user's normal Claude Code CLI auth?
- When a second user message arrives while Claude is executing tools, does the
  CLI queue it for the next turn or alter the active turn?
- Does the CLI expose any reliable interruption control through JSONL stdin,
  signals, or another documented non-interactive mechanism?
- How are permission requests, tool failures, hooks, skills, and partial output
  represented in the long-lived stream compared with the current per-turn
  process?
- What happens after process crashes, auth expiry, rate limits, and stale
  session ids?

## Phase 0 - Live CLI Probe

Goal: confirm the local CLI behavior without changing product code.

- [ ] Record local version with `claude --version`.
- [ ] In a disposable repo, run a long-lived `claude -p` process with
      stream-json input/output.
- [ ] Send an initial JSONL user message that causes a multi-step tool run.
- [ ] While the first message is still running, write another JSONL user
      message without closing stdin.
- [ ] Confirm whether the second message is queued, consumed immediately, or
      ignored.
- [ ] Try a harmless cancellation/interrupt candidate if a documented CLI
      mechanism exists.
- [ ] Save anonymized event samples under a temporary artifact or paste the
      reduced protocol shape into this spec.

Exit criteria:

- We know whether CLI-native follow-up is real for the installed Claude Code
  version.
- We know whether interrupt is possible or must remain out of scope.
- No product code changed.

## Phase 1 - Adapter Design

Goal: design the lifecycle before implementation.

- [ ] Define the process state machine:
  - idle before first user message
  - running active turn
  - accepting queued stdin messages
  - stopping
  - failed/recovering
- [ ] Decide how provider status maps to Convergence status when stdin remains
      open after a result event.
- [ ] Decide whether a long-lived process is one Convergence session forever or
      whether completed turns still rotate processes after idle timeout.
- [ ] Preserve current `--resume` continuation recovery for crash/restart
      fallback.
- [ ] Define how queued Convergence inputs are reconciled with messages already
      written to Claude stdin.

Exit criteria:

- The implementation can be reviewed as a focused provider refactor.
- Existing app-managed queue behavior has a clear fallback path.

## Phase 2 - Provider Refactor Behind Capability Gate

Goal: implement CLI-native follow-up without changing the UI contract.

- [ ] Add a Claude provider transport abstraction for per-turn process vs
      long-lived stream.
- [ ] Keep the current per-turn implementation available as fallback.
- [ ] Keep stdin open in long-lived mode and serialize each user message as
      JSONL using the existing Claude message builder.
- [ ] Track message ids so Convergence can mark queued inputs as dispatching,
      sent, or failed.
- [ ] Treat write failures as queue-item failures, not whole-session failures,
      unless the child process exits.
- [ ] Ensure `stop()` closes stdin and terminates the child process cleanly.

Exit criteria:

- Claude can accept follow-up while running in automated tests with a mocked
  long-lived child process.
- Existing Claude per-turn tests still pass.

## Phase 3 - Product Enablement

Goal: expose only proven Claude capabilities.

- [ ] Change Claude capability from app-queued follow-up to native follow-up
      only after live smoke tests pass.
- [ ] Keep `steer` and `interrupt` disabled unless Phase 0 proves stable CLI
      semantics.
- [ ] Keep app-managed queue as fallback when the CLI version probe marks native
      streaming input unsupported.
- [ ] Add release notes explaining that Claude Code still uses local CLI auth.

Exit criteria:

- Users can send Claude follow-ups while a task is running without waiting for
  Convergence to dispatch them after completion.
- Unsupported Claude versions degrade to the V1 queue behavior.

## Verification Matrix

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`
- [ ] Live Claude smoke with local CLI auth.
- [ ] Crash recovery smoke: kill the child process during an active run, then
      send a normal follow-up.
- [ ] Regression smoke: completed-turn follow-up via `--resume` still works
      when native streaming input is disabled.

## References

- Claude Code programmatic CLI usage:
  `https://code.claude.com/docs/en/headless`
- Claude streaming input behavior:
  `https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode`
- Claude approvals and user input:
  `https://code.claude.com/docs/en/agent-sdk/user-input`
