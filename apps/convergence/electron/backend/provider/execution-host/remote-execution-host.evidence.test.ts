vi.mock('../claude-code/claude-transport.service', async () => ({
  createClaudeTransport: (
    await import('../claude-code/claude-transport.fixture')
  ).createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import {
  closeDatabase,
  getDatabase,
  resetDatabase,
} from '../../database/database'
import { ProviderRegistry } from '../provider-registry'
import { LocalExecutionHost } from './local-execution-host'
import { RemoteExecutionHost } from './remote-execution-host'
import { SessionService } from '../../session/session.service'
import { TurnCaptureService } from '../../session/turn/turn-capture.service'
import { GitService } from '../../git/git.service'
import {
  createStubDaemon,
  envelope,
  waitUntil,
} from '@convergence/execution-host-client'
import {
  executionHostRegistryFor,
  seedExecutionHostEndpoint,
  TEST_EXECUTION_HOST_ENDPOINT_ID,
} from '../../execution-host-endpoint/execution-host-endpoint.fixture'
import { TEST_REMOTE_WORK_ADDRESS } from '../../session/session-work-address.fixture'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { SessionHandle } from '../provider.types'
import { toWireSessionDelta } from './execution-host-wire-mapping.pure'
import type { ExecutionHostEventEnvelope } from '@mrck-labs/execution-host-protocol'
import { toClaudeProjectsKey } from '../claude-code/claude-context-log.service'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))
import { ClaudeCodeProvider } from '../claude-code/claude-code-provider'

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  spawnMock.mockReset()
  closeDatabase()
  resetDatabase()
})

/** What the acceptance compares: the session's agent runs, tasks and items. */
function readRecord(db: Database.Database, sessionId: string) {
  return {
    agentRuns: db
      .prepare(
        `SELECT id, spawned_by_item_id, agent_type, description, model, status,
           depth, started_at, ended_at, transcript_path, ended_summary
         FROM session_agent_runs WHERE session_id = ? ORDER BY id`,
      )
      .all(sessionId),
    tasks: db
      .prepare(
        `SELECT task_id, tool_use_id, task_type, description, status,
           started_at, ended_at, output_file
         FROM session_tasks WHERE session_id = ? ORDER BY task_id`,
      )
      .all(sessionId),
  }
}

function readItems(service: SessionService, sessionId: string) {
  return service.getConversation(sessionId).map((item) => ({
    id: item.id,
    kind: item.kind,
    agentRunId: item.agentRunId ?? null,
    taskId: item.taskId ?? null,
    agentAttribution: item.agentAttribution ?? null,
  }))
}

/**
 * A local Claude session through the real provider and session service, its
 * CLI a pipe the test writes Claude Code's stream to. `emitted` is every
 * delta the local handle hands the session, in order: what a host running the
 * same provider would put on the wire.
 */
async function startLocalClaude(dir: string, text: string) {
  const accountDir = join(dir, 'account')
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  spawnMock.mockReturnValue(child)
  const db = getDatabase()
  const registry = new ProviderRegistry()
  registry.register(
    new ClaudeCodeProvider('/fixture/claude', null, undefined, null, () => ({
      configDir: accountDir,
      credentialDir: join(dir, 'credentials'),
    })),
  )
  const emitted: SessionDelta[] = []
  const local = new LocalExecutionHost(registry)
  const tap = (handle: SessionHandle): SessionHandle => {
    const onDelta = handle.onDelta.bind(handle)
    handle.onDelta = (callback) =>
      onDelta((delta) => {
        emitted.push(delta)
        callback(delta)
      })
    return handle
  }
  const host = Object.assign(Object.create(local) as LocalExecutionHost, {
    start: (...args: Parameters<LocalExecutionHost['start']>) =>
      tap(local.start(...args)),
  })
  const service = new SessionService(db, host, dir)
  const capture = new TurnCaptureService(new GitService(), db, {
    debounceMs: 0,
  })
  service.setTurnCaptureService(capture)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('project','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'project',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'fixture',
  })
  await service.start(session.id, { text })
  await vi.waitUntil(() => child.stdin.readableLength > 0)
  return {
    accountDir,
    db,
    service,
    sessionId: session.id,
    emitted,
    send: (event: unknown) => child.stdout.write(JSON.stringify(event) + '\n'),
    /** What the session holds once the turn ended; then the session is gone. */
    async finish(settled: () => boolean) {
      await capture.flushPendingEnd(session.id)
      await vi.waitUntil(settled)
      const result = {
        record: readRecord(db, session.id),
        items: readItems(service, session.id),
        conversation: service.getConversation(session.id),
        userMessage: service
          .getConversation(session.id)
          .find((item) => item.kind === 'message' && item.actor === 'user'),
        emitted: [...emitted],
      }
      await service.disposeAll()
      await capture.flushPendingEnd(session.id)
      return result
    },
  }
}

/**
 * A local Claude run that spawns an Explore agent, which reads a file and
 * starts a background command it then kills: the tape MAR-2879's acceptance
 * is about, cut from `session-claude-evidence.test.ts`.
 */
async function runLocalExploreTape(dir: string) {
  const { accountDir, db, sessionId, send, finish } = await startLocalClaude(
    dir,
    'probe',
  )
  send({
    type: 'system',
    subtype: 'init',
    session_id: 'harness-session',
    cwd: dir,
  })
  send({
    type: 'assistant',
    uuid: 'spawn-event',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'spawn-tool',
          name: 'Agent',
          input: { subagent_type: 'Explore', description: 'Read fixture' },
        },
      ],
    },
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'agent-id',
    tool_use_id: 'spawn-tool',
    task_type: 'local_agent',
    description: 'Read fixture',
  })
  send({
    type: 'assistant',
    uuid: 'child-call-event',
    parent_tool_use_id: 'spawn-tool',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'read-tool',
          name: 'Read',
          input: { file_path: 'fixture' },
        },
      ],
    },
  })
  send({
    type: 'user',
    uuid: 'child-result-event',
    parent_tool_use_id: 'spawn-tool',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'read-tool', content: 'fixture' },
      ],
    },
  })
  const metaDir = join(
    accountDir,
    'projects',
    dir.replace(/[ /]/g, '-'),
    'harness-session',
    'subagents',
  )
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    join(metaDir, 'agent-agent-id.meta.json'),
    JSON.stringify({
      agentType: 'Explore',
      description: 'Read fixture',
      toolUseId: 'spawn-tool',
      spawnDepth: 1,
    }),
  )
  send({
    type: 'assistant',
    parent_tool_use_id: 'spawn-tool',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'bash-tool',
          name: 'Bash',
          input: { command: 'sleep 40' },
        },
      ],
    },
  })
  send({
    type: 'user',
    parent_tool_use_id: 'spawn-tool',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'bash-tool',
          content: 'launched sleep',
        },
      ],
    },
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'bash-task',
    tool_use_id: 'bash-tool',
    task_type: 'local_bash',
    description: 'sleep',
  })
  send({
    type: 'system',
    subtype: 'task_updated',
    task_id: 'bash-task',
    patch: { status: 'killed' },
  })
  send({
    type: 'user',
    uuid: 'agent-result-event',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'spawn-tool', content: 'finished' },
      ],
    },
    tool_use_result: {
      status: 'completed',
      agentId: 'agent-id',
      resolvedModel: 'haiku',
    },
  })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'answer' }] },
  })
  send({
    type: 'result',
    subtype: 'success',
    result: 'answer',
    usage: { output_tokens: 7 },
    total_cost_usd: 0.125,
    permission_denials: [],
  })
  return finish(() => readRecord(db, sessionId).agentRuns.length === 1)
}

/**
 * A remote Claude session on a stub daemon, started and following its
 * stream: what the test emits is what the host said.
 */
async function startRemoteSession(dir: string) {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects (id, name, repository_path) VALUES ('remote-project', 'remote', ?)",
  ).run(dir)
  seedExecutionHostEndpoint(db)
  const stub = createStubDaemon()
  const service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
    join(dir, 'global-sessions'),
  )
  const host = new RemoteExecutionHost({
    connection: {
      resolveConnection: async () => ({
        baseUrl: 'http://daemon.test',
        token: 'test-token',
      }),
    },
    fetch: stub.fetchFn,
    reconnect: {
      maxAttempts: 2,
      wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    },
    onEventSeq: (id, seq) => service.recordRemoteEventSeq(id, seq),
  })
  await host.refreshProviders()
  service.setRemoteExecutionHosts(
    executionHostRegistryFor({ [TEST_EXECUTION_HOST_ENDPOINT_ID]: host }),
  )
  service.setRemoteWorkspaceSourceResolver(() => ({
    repository: 'git@github.com:acme/repo.git',
  }))
  // Disposed before its database closes, by the test or here at the end: a
  // remote session's evidence schedules the service's parallel-work recount,
  // and a timer outliving the database reads a closed one.
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    disposed = true
    await service.disposeAll()
  }
  cleanups.push(dispose)
  const sessionId = service.create({
    projectId: 'remote-project',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: null,
    name: 'remote session',
    executionHost: TEST_EXECUTION_HOST_ENDPOINT_ID,
    workAddress: TEST_REMOTE_WORK_ADDRESS,
  }).id
  await service.start(sessionId, { text: 'probe' })
  await waitUntil(
    () => stub.eventStreamLastEventIds.length === 1,
    'the event stream to open',
  )
  return { db, service, stub, sessionId, dispose }
}

/**
 * MAR-2879's acceptance, on the remote side (MAR-3684): a remote-hosted
 * Claude session that spawns an Explore agent shows `↳ <description>
 * (<type>)` above the agent's tool calls, and its `session_agent_runs` and
 * `session_tasks` match the local case.
 *
 * The local case is run for real, through the Claude provider and the
 * session service, and every delta its handle emitted is put on the wire as
 * a host running the same provider puts it: through `toWireSessionDelta`,
 * encoded, served by a stub daemon, and read back by `RemoteExecutionHost`
 * into a second session's record. The two records must then agree row for
 * row. Mutations: map wire `evidence` to null again, or drop `agentRunId` or
 * `taskId` from a wire item, and this turns red.
 */
it("records a remote Explore agent's runs, tasks and attribution exactly as the local run does", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-evidence-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))

  const local = await runLocalExploreTape(dir)
  // The tape did what the acceptance is about, locally.
  expect(local.record.agentRuns).toMatchObject([
    {
      id: 'agent-id',
      agent_type: 'Explore',
      description: 'Read fixture',
      status: 'completed',
    },
  ])
  expect(local.record.tasks).toMatchObject([
    { task_id: 'agent-id', task_type: 'local_agent' },
    { task_id: 'bash-task', status: 'stopped' },
  ])
  expect(local.userMessage).toBeDefined()
  closeDatabase()
  resetDatabase()

  // The same work, followed from a host.
  const { db, service, stub, sessionId } = await startRemoteSession(dir)

  // A host echoes the person's message back; the local service wrote its own.
  // Its local-only fields (`sessionId`, `sequence`, `turnId`) stay behind in
  // the mapping, as every local item's do.
  const wire = [
    { kind: 'conversation.item.add', item: local.userMessage! } as SessionDelta,
    ...local.emitted,
  ].flatMap((delta) => {
    const mapped = toWireSessionDelta(delta)
    return mapped ? [mapped] : []
  })
  // The local run's evidence is on the wire, not left behind.
  expect(wire.filter((delta) => delta.kind === 'evidence').length).toBe(
    local.emitted.filter((delta) => delta.kind === 'harness.evidence').length,
  )
  wire.forEach((delta, index) =>
    stub.emit(envelope(index + 1, { kind: 'delta', delta }, sessionId)),
  )
  await waitUntil(
    () => readItems(service, sessionId).length === local.items.length,
    'every item to reach the remote record',
  )
  // Waited for, and not asserted here: a record that never settles fails
  // below, where the diff says which row differs.
  await waitUntil(
    () =>
      JSON.stringify(readRecord(db, sessionId)) ===
      JSON.stringify(local.record),
    'the remote record to settle',
  ).catch(() => undefined)

  expect(readRecord(db, sessionId)).toEqual(local.record)
  expect(readItems(service, sessionId)).toEqual(local.items)
  // The label the transcript draws above the agent's tool calls.
  const read = service
    .getConversation(sessionId)
    .find((item) => item.kind === 'tool-call' && item.toolName === 'Read')
  expect(read).toMatchObject({
    agentRunId: 'agent-id',
    agentAttribution: { description: 'Read fixture', agentType: 'Explore' },
  })
})

/**
 * agents-daemon 0.45.0 on one recorded Claude Code session: R0's
 * `explore-subagent` recording, and the envelopes the daemon's own session
 * manager and Claude provider wrote for it (see the fixture's README).
 */
const DAEMON_TAPE = join(
  __dirname,
  '__fixtures__',
  'agents-daemon-0.45.0-explore-subagent',
)
const EXPLORE_RUN = 'a604ee3fda52aa6be'
const AGENT_CALL = 'toolu_011kSWjL2j6baHSasKtGKvnD'

function readTape<T>(file: string): T {
  return JSON.parse(readFileSync(join(DAEMON_TAPE, file), 'utf8')) as T
}

type Row = Record<string, unknown>

/**
 * The recording through Convergence's own local Claude pipeline: the same SDK
 * messages the daemon's provider read, written to the local provider's CLI
 * pipe. The recording keeps only the shape of the subagent's
 * `agent-<id>.meta.json`, so its values are written from `task_started`'s,
 * where the CLI would have put the file.
 */
async function runRecordingLocally(dir: string) {
  const sdk = readTape<Row[]>('sdk-messages.json')
  const init = sdk.find((m) => m.type === 'system' && m.subtype === 'init')!
  const local = await startLocalClaude(dir, 'Use an Explore subagent.')
  const metaDir = join(
    local.accountDir,
    'projects',
    toClaudeProjectsKey(String(init.cwd)),
    String(init.session_id),
    'subagents',
  )
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    join(metaDir, `agent-${EXPLORE_RUN}.meta.json`),
    JSON.stringify({
      agentType: 'Explore',
      description: 'List files in folder',
      toolUseId: AGENT_CALL,
      spawnDepth: 1,
    }),
  )
  for (const message of sdk) local.send(message)
  return local.finish(() =>
    readRecord(local.db, local.sessionId).agentRuns.some(
      (run) => (run as Row).status === 'completed',
    ),
  )
}

/**
 * The daemon's envelopes into a remote session, in their order. They are
 * renumbered one by one: the daemon's log has a gap where it pruned superseded
 * item patches, which a reader resuming from it never sees, and a stream that
 * skipped a number would be read as a lost frame.
 */
async function followDaemonTape(
  dir: string,
  envelopes = readTape<ExecutionHostEventEnvelope[]>('envelopes.json'),
) {
  const remote = await startRemoteSession(dir)
  envelopes.forEach((recorded, index) =>
    remote.stub.emit(envelope(index + 1, recorded.event, remote.sessionId)),
  )
  await waitUntil(
    () => remote.service.getById(remote.sessionId)?.status === 'completed',
    'the remote turn to settle',
  )
  const followed = {
    record: readRecord(remote.db, remote.sessionId),
    items: readItems(remote.service, remote.sessionId),
    conversation: remote.service.getConversation(remote.sessionId),
  }
  // Read, then let go, so a caller may close the database and follow again.
  await remote.dispose()
  return followed
}

/**
 * The columns both producers fill alike, with each run named by the call that
 * spawned it rather than by an item id each side mints for itself.
 */
function comparable(
  record: ReturnType<typeof readRecord>,
  items: ReturnType<typeof readItems>,
  providerItemIdOf: (itemId: string) => string | null,
) {
  return {
    agentRuns: (record.agentRuns as Row[]).map((run) => ({
      id: run.id,
      spawnedByCall: providerItemIdOf(String(run.spawned_by_item_id)),
      agentType: run.agent_type,
      description: run.description,
      model: run.model,
      status: run.status,
      depth: run.depth,
    })),
    tasks: (record.tasks as Row[]).map((task) => ({
      taskId: task.task_id,
      toolUseId: task.tool_use_id,
      taskType: task.task_type,
      status: task.status,
      endedAt: task.ended_at,
      outputFile: task.output_file,
    })),
    // Local writes task notes the daemon does not (see `differences`).
    items: items
      .filter((item) => item.kind !== 'note')
      .map(({ kind, agentRunId, taskId, agentAttribution }) => ({
        kind,
        agentRunId,
        taskId,
        agentAttribution,
      })),
  }
}

/**
 * MAR-2879's acceptance on the daemon's own wire (MAR-3684 review): the
 * evidence is what agents-daemon 0.45.0 really sends for a recorded Claude
 * Code session, not what Convergence's local pipeline sends, and the record
 * it leaves is held against the one Convergence's local pipeline leaves for
 * the same recording.
 *
 * The wire, as the daemon sends it: `agent.started` names the run by its
 * Agent call with no model, `agent.identified` renames it, and the
 * subagent's items carry the identified run. Mutations: map `evidence` to
 * null, or drop `agentRunId` from wire items, and this turns red.
 */
it("records the daemon's own Explore tape as the local pipeline records the same recording", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-evidence-daemon-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const envelopes = readTape<ExecutionHostEventEnvelope[]>('envelopes.json')
  const evidence = envelopes.flatMap(({ event }) =>
    event.kind === 'delta' && event.delta.kind === 'evidence'
      ? [event.delta.evidence]
      : [],
  )
  expect(evidence.slice(0, 3)).toMatchObject([
    { kind: 'agent.started', run: { id: AGENT_CALL, model: null } },
    { kind: 'task.changed', taskId: EXPLORE_RUN },
    { kind: 'agent.identified', id: EXPLORE_RUN },
  ])

  const local = await runRecordingLocally(dir)
  const localCalls = new Map(
    local.conversation.map((item) => [
      item.id,
      item.providerMeta.providerItemId,
    ]),
  )
  closeDatabase()
  resetDatabase()
  const remote = await followDaemonTape(dir)
  const remoteCalls = new Map(
    remote.conversation.map((item) => [
      item.id,
      item.providerMeta.providerItemId,
    ]),
  )

  const expected = comparable(
    local.record,
    local.items,
    (id) => localCalls.get(id) ?? null,
  )
  expect(expected.agentRuns).toEqual([
    {
      id: EXPLORE_RUN,
      spawnedByCall: AGENT_CALL,
      agentType: 'Explore',
      description: 'List files in folder',
      model: 'claude-sonnet-5-5',
      status: 'completed',
      depth: 1,
    },
  ])
  expect(
    comparable(
      remote.record,
      remote.items,
      (id) => remoteCalls.get(id) ?? null,
    ),
  ).toEqual(expected)

  // The label the transcript draws above the subagent's tool call.
  expect(
    remote.conversation.find(
      (item) => item.kind === 'tool-call' && item.toolName === 'Bash',
    ),
  ).toMatchObject({
    agentRunId: EXPLORE_RUN,
    agentAttribution: {
      description: 'List files in folder',
      agentType: 'Explore',
    },
  })

  // Where the two producers disagree on the same recording, pinned so either
  // side moving is a visible change (MAR-4292). None of it is the mapping's:
  // the daemon's evidence reaches the record unchanged.
  const localRun = local.record.agentRuns[0] as Row
  const remoteRun = remote.record.agentRuns[0] as Row
  const localTask = local.record.tasks[0] as Row
  const remoteTask = remote.record.tasks[0] as Row
  expect({
    taskDescription: [localTask.description, remoteTask.description],
    runEndedSummary: [
      localRun.ended_summary,
      String(remoteRun.ended_summary).split('\n')[0],
    ],
    runEndedAtIsTheTasks: [
      localRun.ended_at === localTask.ended_at,
      remoteRun.ended_at === remoteTask.ended_at,
    ],
    transcriptPath: [
      String(localRun.transcript_path).endsWith(
        `/subagents/agent-${EXPLORE_RUN}.jsonl`,
      ),
      remoteRun.transcript_path,
    ],
    taskNotes: [
      local.items.filter((item) => item.kind === 'note').length,
      remote.items.filter((item) => item.kind === 'note').length,
    ],
  }).toEqual({
    taskDescription: [
      'Running List directory contents including hidden files',
      'List files in folder',
    ],
    runEndedSummary: [
      null,
      'The working directory has two files and no hidden files or subfolders:',
    ],
    runEndedAtIsTheTasks: [true, false],
    transcriptPath: [true, null],
    taskNotes: [2, 0],
  })
})

/**
 * A host may learn an item's run only after it added the item, and patch it
 * in (protocol 0.19). 0.45.0 does not for this recording, since its
 * `agent.identified` lands before the subagent's first item, so this is the
 * captured tape with each subagent item's `agentRunId` moved off its add and
 * into a patch right after it. Mutation: drop `agentRunId` from the item
 * patch mapping and this turns red.
 */
it("records a run the host patches onto the subagent's items as one it named on them", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-evidence-patched-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const captured = readTape<ExecutionHostEventEnvelope[]>('envelopes.json')
  const patched = captured.flatMap((recorded) => {
    const { event } = recorded
    if (
      event.kind !== 'delta' ||
      event.delta.kind !== 'conversation.item.add' ||
      !event.delta.item.agentRunId
    )
      return [recorded]
    const { agentRunId, ...item } = event.delta.item
    return [
      {
        ...recorded,
        event: {
          kind: 'delta',
          delta: { kind: 'conversation.item.add', item },
        },
      },
      {
        ...recorded,
        event: {
          kind: 'delta',
          delta: {
            kind: 'conversation.item.patch',
            itemId: item.id,
            patch: { agentRunId },
          },
        },
      },
    ] as ExecutionHostEventEnvelope[]
  })
  expect(patched.length).toBe(captured.length + 3)

  const asNamed = await followDaemonTape(dir, captured)
  closeDatabase()
  resetDatabase()
  const asPatched = await followDaemonTape(dir, patched)

  expect(asPatched.record).toMatchObject({
    agentRuns: [{ id: EXPLORE_RUN, agent_type: 'Explore' }],
  })
  const attribution = (items: ReturnType<typeof readItems>) =>
    items.map(({ kind, agentRunId, taskId, agentAttribution }) => ({
      kind,
      agentRunId,
      taskId,
      agentAttribution,
    }))
  expect(attribution(asPatched.items)).toEqual(attribution(asNamed.items))
  expect(
    asPatched.items.filter((item) => item.agentRunId === EXPLORE_RUN).length,
  ).toBe(3)
})
