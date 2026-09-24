# Performance baseline — September 2026

Measured on the executor Mac: **default busy day**. [MAR-3322](https://linear.app/marckraw/issue/MAR-3322).

## Method and limits

Build: **runner Vite production renderer with conditional react-dom/profiling alias**, minification disabled for readable traces. The normal installed production build is unchanged; setting `CONVERGENCE_PERF=1` there supports R2 main-process measurements only. R3 requires the runner’s profiling renderer build.

The scenario uses the real in-memory test schema, SessionService, IPC broadcast handlers, TrackerWatcherService, WorkLedgerService, and the complete app renderer. The in-process provider follows the session tests’ listener-array / ProviderSessionEmitter fake and patches a message plus task evidence every nominal 30 ms. One crew has 40 synthetic tracker issues. Unrelated services are no-I/O fakes. Two offscreen BrowserWindows receive broadcasts; one mounts the app. The relay stall clock runs against a real empty relay repository. No real provider, account database or tracker is used.

Keystroke-to-paint is a double-requestAnimationFrame estimate after observing the controlled textarea value, not a GPU timestamp. Event Timing has a 16 ms duration threshold; input-delay percentiles describe observed entries only. Zero samples mean unavailable, not zero latency. Profiler durations are inclusive. Timer costs cover synchronous callback work, not awaited time; SQLite timings cover prepared run/get/all execution, excluding prepare and iteration. IPC bytes use V8 serialization as a payload-size proxy, not Electron wire bytes. Instrumentation adds overhead (including a stack capture when a timer is scheduled). This is one synthetic run, not a causal benchmark or a budget.

## Machine and scenario

| Field                   | Value            |
| ----------------------- | ---------------- |
| machine.model           | `Mac15,6`        |
| machine.os              | `25.5.0`         |
| machine.macOS           | `26.5.1`         |
| machine.node            | `24.14.0`        |
| machine.electron        | `41.2.0`         |
| machine.chromium        | `146.0.7680.179` |
| parameters.sessions     | `12`             |
| parameters.streaming    | `6`              |
| parameters.minutes      | `3`              |
| parameters.loom         | `True`           |
| parameters.tokenMs      | `30`             |
| parameters.keys         | `60`             |
| parameters.keyMs        | `80`             |
| scenario.emittedDeltas  | `33339`          |
| scenario.trackerReads   | `4`              |
| scenario.snapshotReads  | `1`              |
| scenario.windows        | `2`              |
| scenario.rendererErrors | `[]`             |
| main elapsed seconds    | 180.390551       |

## Ten ranked offenders

Ranked by **cost × frequency = mean synchronous ms/call × calls/second**, in ms/second. Ranking spans measured product timers, IPC sends, SQLite executions, summary reads and React roots. Nested costs overlap; do not sum rows. Synthetic stream/wait callbacks are excluded from the ranking. Offscreen paint estimates and browser long tasks are latency observations, not additional independently attributable CPU costs.

| Rank | Measured boundary                                                                     | Mean ms  | Calls/s    | ms/s      | Calls | Cost location (workspace-relative file:line)                              |
| ---- | ------------------------------------------------------------------------------------- | -------- | ---------- | --------- | ----- | ------------------------------------------------------------------------- |
| 1    | React sidebar                                                                         | 1.115874 | 56.945639  | 63.544172 | 10243 | `src/widgets/sidebar/sidebar.container.tsx:981`                           |
| 2    | React wave-panel                                                                      | 0.278913 | 57.262529  | 15.971242 | 10300 | `src/app/App.layout.tsx:316`                                              |
| 3    | Timer SessionService.enqueueConversationPatch                                         | 0.164096 | 92.393975  | 15.161459 | 16667 | `electron/backend/session/session.service.ts:4180`                        |
| 4    | React composer                                                                        | 0.233421 | 52.881667  | 12.343689 | 9512  | `src/widgets/session-view/session-conversation-surface.container.tsx:120` |
| 5    | Timer SessionService.scheduleEvidenceUpdate                                           | 0.203265 | 22.667484  | 4.607510  | 4089  | `electron/backend/session/session.service.ts:1456`                        |
| 6    | IPC session:conversationPatched                                                       | 0.012893 | 184.932081 | 2.384282  | 33360 | `electron/main/ipc.ts:1357`                                               |
| 7    | getSummaryById                                                                        | 0.079468 | 23.964670  | 1.904424  | 4323  | `electron/backend/session/session.service.ts:1626`                        |
| 8    | SQL SELECT items.\*, sessions.provider_id, agents.description AS agent_description, a | 0.013858 | 92.399518  | 1.280439  | 16668 | `electron/backend/session/session.service.ts:4505`                        |
| 9    | SQL UPDATE session_conversation_items                                                 | 0.012202 | 92.399518  | 1.127495  | 16668 | `electron/backend/session/session.service.ts:4530`                        |
| 10   | SQL SELECT task_id AS taskId,session_id AS sessionId,tool_use_id AS toolUseId,task_t  | 0.005819 | 188.590809 | 1.097501  | 34020 | `electron/backend/session/harness-evidence.service.ts:314`                |

## Hypotheses

1. **Confirmed for this workload:** 108 sessions-array identity changes reached this composer during the keystroke burst. The composer recorded 9512 commits overall. This establishes the competing subscription path; it does not prove that every update causes a distinct commit or that it dominates typing delay.
2. **Confirmed for this two-window scenario:** conversation patches produced 33360 sends (184.932/s), through the real all-window broadcast loop, including the window without a session view.
3. **Confirmed (Loom is not refetching); the refetch suspicion is killed in this scenario:** Loom requested one snapshot while the fake tracker was read four times. Renderer snapshots and tracker polling are separate counts; pushed snapshots keep the board updated.
4. **Confirmed:** 16,667 stream-flush ticks, 4,089 evidence ticks, 35 liveness ticks, four tracker ticks and three relay-stall ticks executed. Inclusive timer duration must not be added to its nested DB/IPC work.

## Main metrics

| Channel                     | Sends | V8 bytes  | Sends/s    | Bytes/s        | Total send ms | Max send ms |
| --------------------------- | ----- | --------- | ---------- | -------------- | ------------- | ----------- |
| session:summaryUpdated      | 8226  | 6778008   | 45.601058  | 37574.074496   | 35.419821     | 0.056875    |
| workLedger:updated          | 2     | 52656     | 0.011087   | 291.899990     | 0.100125      | 0.052667    |
| session:conversationPatched | 33360 | 572106864 | 184.932081 | 3171490.197029 | 430.101962    | 0.245666    |
| session:evidenceUpdated     | 8178  | 482502    | 45.334969  | 2674.763159    | 46.660557     | 0.049500    |
| harness.facts               | 8178  | 482502    | 45.334969  | 2674.763159    | 18.039304     | 0.034459    |

| Timer registration (same origin may have different delays) | Ticks | Total sync ms | Max sync ms |
| ---------------------------------------------------------- | ----- | ------------- | ----------- |
| setInterval:60000:at startRelayStallClock                  | 3     | 0.624459      | 0.223209    |
| setTimeout:0:at TrackerWatcherService.schedule             | 1     | 0.337541      | 0.337541    |
| setInterval:30:at Object.start                             | 33339 | 2929.531528   | 2.869792    |
| setTimeout:59998:at TrackerWatcherService.schedule         | 1     | 0.327000      | 0.327000    |
| setTimeout:100:at scenario wait                            | 2     | 0.003250      | 0.002084    |
| setInterval:5000:at SessionLivenessService.ensureTimer     | 35    | 21.902584     | 1.536084    |
| setTimeout:50:at SessionService.enqueueConversationPatch   | 16667 | 2734.983883   | 1.790833    |
| setTimeout:250:at SessionService.scheduleEvidenceUpdate    | 4089  | 831.151222    | 0.777500    |
| setTimeout:80:at scenario wait                             | 60    | 0.103580      | 0.005000    |
| setTimeout:174651.858166:at scenario wait                  | 1     | 0.001292      | 0.001292    |
| setTimeout:59999:at TrackerWatcherService.schedule         | 2     | 0.580876      | 0.371917    |

| Summary/heap            | Value      |
| ----------------------- | ---------- |
| getSummaryById calls    | 4323       |
| getSummaryById total ms | 343.540156 |
| Heap start bytes        | 7235152    |
| Heap end bytes          | 8201384    |

| SQLite statement (truncated)                                                                                                                                                                                                                       | Calls | Total ms   | Max ms   | Source                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | -------- | ----------------------------------------------------------- |
| `SELECT items.*, sessions.provider_id, agents.description AS agent_description, agents.agent_type          FROM session_conversation_items items          INNER JOIN sessions ON sessions.id = items.session_id          LEFT JOIN session_agent_` | 16668 | 230.979083 | 0.103334 | `electron/backend/session/session.service.ts:4505`          |
| `UPDATE session_conversation_items            SET turn_id = ?,                agent_run_id = ?,                task_id = ?,                kind = ?,                state = ?,                payload_json = ?,                provider_item_id =` | 16668 | 203.389443 | 1.676791 | `electron/backend/session/session.service.ts:4530`          |
| `SELECT task_id AS taskId,session_id AS sessionId,tool_use_id AS toolUseId,task_type AS taskType,description,status,started_at AS startedAt,observed_at AS observedAt,stop_receipt_at AS stopReceiptAt,ended_at AS endedAt,output_file AS outputF` | 34020 | 197.978765 | 0.055750 | `electron/backend/session/harness-evidence.service.ts:314`  |
| `SELECT * FROM sessions WHERE id = ?`                                                                                                                                                                                                              | 8454  | 60.765075  | 0.069208 | `electron/backend/session/session.repository.ts:92`         |
| `UPDATE sessions SET updated_at = ? WHERE id = ?`                                                                                                                                                                                                  | 16668 | 51.132638  | 0.024916 | `electron/backend/session/session.service.ts:4559`          |
| `SELECT session_id, id, started_at, ended_at, status FROM (     SELECT session_id, id, started_at, ended_at, status,       ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY sequence DESC) AS rank     FROM session_turns WHERE session_id IN ` | 4335  | 20.290624  | 0.023375 | `electron/backend/session/session-timing.service.ts:12`     |
| `SELECT kind, payload_json          FROM session_conversation_items          WHERE session_id = ?            AND kind IN ('approval-request', 'input-request')          ORDER BY sequence DESC          LIMIT 1`                                   | 4335  | 10.891898  | 0.016042 | `electron/backend/session/session.service.ts:1706`          |
| `SELECT COALESCE(   (SELECT t.task_id FROM session_tasks t WHERE t.session_id=a.session_id AND t.task_type='local_agent' AND t.task_id=a.id),   (SELECT t.task_id FROM session_tasks t JOIN session_conversation_items spawn ON spawn.session_id=` | 681   | 5.305587   | 0.033250 | `electron/backend/session/turn/turn-capture.service.ts:395` |
| `SELECT ledger.*,                 COALESCE(member.session_id, dispatch.session_id) AS seat_session_id,                 CASE WHEN session.id IS NULL THEN 0 ELSE 1 END AS session_exists,                 session.pull_request_json AS pull_reques` | 2     | 0.223792   | 0.113667 | `electron/backend/work-ledger/work-ledger.service.ts:132`   |
| `SELECT ledger.* FROM work_ledger AS ledger   WHERE ledger.crew_id = ?     AND ledger.rowid = (       SELECT latest.rowid FROM work_ledger AS latest       WHERE latest.crew_id = ledger.crew_id         AND latest.issue_id = ledger.issue_id   ` | 4     | 0.207083   | 0.072125 | `electron/backend/work-ledger/work-ledger.service.ts:33`    |

## Renderer metrics

| Metric                                        | Value        |
| --------------------------------------------- | ------------ |
| measured                                      | True         |
| elapsedSeconds                                | 179.873300   |
| keystrokeToPaint.samples                      | 60           |
| keystrokeToPaint.p50                          | 25.500000    |
| keystrokeToPaint.p95                          | 45.500000    |
| longTasks.count                               | 0            |
| longTasks.totalMs                             | 0            |
| inputDelaySamples                             | 253          |
| inputDelayP95                                 | 2.400000     |
| commits.composer.count                        | 9512         |
| commits.composer.perMinute                    | 3172.900036  |
| commits.composer.totalMs                      | 2220.300006  |
| commits.composer.burstCount                   | 384          |
| commits.composer.commitsPerSessionsIdentity   | 3.555556     |
| commits.sidebar.count                         | 10243        |
| commits.sidebar.perMinute                     | 3416.738337  |
| commits.sidebar.totalMs                       | 11429.899998 |
| commits.sidebar.burstCount                    | 272          |
| commits.sidebar.commitsPerSessionsIdentity    | 2.518519     |
| commits.wave-panel.count                      | 10300        |
| commits.wave-panel.perMinute                  | 3435.751721  |
| commits.wave-panel.totalMs                    | 2872.800004  |
| commits.wave-panel.burstCount                 | 277          |
| commits.wave-panel.commitsPerSessionsIdentity | 2.564815     |
| sessionsIdentityChanges                       | 108          |

## Reproduce and review

```sh
eval "$(fnm env)" && fnm use
node apps/convergence/tools/perf-busy-day.mjs --loom --out /tmp/perf-busy-day.json
```

For a generated fixture or a scrubbed database copy, use:

```sh
node apps/convergence/tools/perf-busy-day.mjs --db /path/to/copy.db --scenario open --open biggest --out /tmp/perf-open.json
node apps/convergence/tools/perf-busy-day.mjs --db /path/to/copy.db --scenario stream-into-open --open biggest --streaming 4 --minutes 3 --out /tmp/perf-stream-open.json
```

`--db` opens its input read-only and uses SQLite backup into the runner's disposable directory before migrations or synthetic writes. It skips fixture inserts and uses the real project service. `--open` accepts an ID or `biggest` (most conversation items); `open` alternates the smallest other conversation and the target five times. The report includes each SELECT, row-parse, V8 conversation-payload size, and opening-to-paint estimate, with nearest-rank p50/p95. On the current renderer path the conversation arrives in a snapshot event, rather than the invoke acknowledgement; `replyBytes` measures the serialized item array, not Electron wire overhead. First paint is bounded by two animation frames after the snapshot lands, not a GPU timestamp.

`stream-into-open` opens the target before starting its fake stream, plus `--streaming K` other conversations (K + 1 streams total). Transcript profiler commits/ms and the usual keystroke-to-paint metrics are included. `busy` remains the default, with K total streams. Every report includes main CPU time divided by elapsed wall time as a percentage of one core and Electron process type/CPU/working-set metrics. Node runs mark process and renderer placeholders as unmeasured. No real provider is launched.

The runner builds an isolated renderer, rebuilds better-sqlite3 for Electron, and restores the Node native build afterward. `--node --sessions 2 --streaming 1 --minutes 0.1` is the executable contract test; its renderer fields are placeholders explicitly marked `measured: false`. The full default-run JSON is attached to MAR-3322.

Marcin QA: read the ten ranked boundaries and their file:line, verify that all four hypotheses cite numbers, and compare a real busy-day R2 dump before S1 sets budgets. No product behavior or performance fix is included.

## Real busy day

Quit Convergence, start it with `CONVERGENCE_PERF=1 /Applications/Convergence.app/Contents/MacOS/Convergence`, and work for an hour with horses riding. `kill -USR2 $(pgrep -x Convergence)` writes `~/Library/Application Support/convergence/perf/perf-report-<time>-usr2.json`; quitting the app writes `perf-report-<time>-quit.json` beside it.
