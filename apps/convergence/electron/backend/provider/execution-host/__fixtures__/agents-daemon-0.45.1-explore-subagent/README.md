# agents-daemon 0.45.1: an Explore subagent on the wire

One recorded Claude Code session, in two forms, so a test can run it through
both Convergence's local pipeline and the daemon's (MAR-3684).

- `sdk-messages.json`: the `sdk` entries of agents-daemon's R0 recording
  `src/providers/claude/fixtures/claude-2.1.285-sdk/explore-subagent.jsonl`
  (Claude Code 2.1.285 through the Agent SDK, recorded 2026-10-03, MAR-3678),
  in order, up to the harness closing its input. Unchanged since 0.45.0, scrub
  placeholders (`<scratch>`, `<cli-tmp>`, …) included.
- `envelopes.json`: every envelope agents-daemon 0.45.1
  (`ef-global/agents-daemon@ca71c45`) wrote to its envelope log for that
  recording. It was captured by running the daemon's own
  `ExecutionSessionManager` and `ClaudeProvider` over the recording, through
  its replay transport, the harness of
  `src/execution/execution-session-manager.evidence.test.ts`, and dumping
  `ExecutionEnvelopeLog.listSince`. The envelopes were not edited. The log's
  `seq` has a gap (31 to 52) where the daemon pruned the intermediate patches
  of an item a later full-text patch superseded (`pruneSupersededItemPatches`),
  as it does for every reader resuming from its log.

The daemon reports a subagent's transcript only when it finds the run's
`subagents/agent-<id>.meta.json` under Claude Code's config directory
(MAR-4324), and the recording keeps no such file. So the capture wrote it
first, with the values `task_started` carries (`Explore`, `List files in
folder`, the Agent call's id, depth 1), the way Convergence's side of the test
does, and ran with `CLAUDE_CONFIG_DIR=/tmp/claude-config`. The one path in
`envelopes.json` is therefore
`/tmp/claude-config/projects/-scratch--workdir/<session>/subagents/agent-<id>.jsonl`,
a directory named for the capture rather than any machine's account directory
(`-scratch--workdir` is the key of the recording's `<scratch>/workdir`). The
test compares that path by its `subagents/agent-<id>.jsonl` tail.

To re-capture against a newer daemon, run that harness with the
`explore-subagent` recording alone (and the metadata file above in place) and
write `envelopeLog.listSince("s1")`. Check the result for machine-specific
paths before committing it.
