# agents-daemon 0.45.0: an Explore subagent on the wire

One recorded Claude Code session, in two forms, so a test can run it through
both Convergence's local pipeline and the daemon's (MAR-3684).

- `sdk-messages.json`: the `sdk` entries of agents-daemon's R0 recording
  `src/providers/claude/fixtures/claude-2.1.285-sdk/explore-subagent.jsonl`
  (Claude Code 2.1.285 through the Agent SDK, recorded 2026-10-03, MAR-3678),
  in order, up to the harness closing its input. Unchanged, scrub placeholders
  (`<scratch>`, `<cli-tmp>`, …) included.
- `envelopes.json`: every envelope agents-daemon 0.45.0
  (`ef-global/agents-daemon@916fd5c`) wrote to its envelope log for that
  recording. It was captured by running the daemon's own
  `ExecutionSessionManager` and `ClaudeProvider` over the recording, through
  its replay transport, the harness of
  `src/execution/execution-session-manager.evidence.test.ts`, and dumping
  `ExecutionEnvelopeLog.listSince`. Nothing was edited. The log's `seq` has a
  gap (31 to 52) where the daemon pruned the intermediate patches of an item
  a later full-text patch superseded (`pruneSupersededItemPatches`), as it does
  for every reader resuming from its log.

To re-capture against a newer daemon, run that harness with the
`explore-subagent` recording alone and write `envelopeLog.listSince("s1")`.
