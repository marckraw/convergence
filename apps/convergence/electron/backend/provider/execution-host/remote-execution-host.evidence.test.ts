vi.mock('../claude-code/claude-transport.service', async () => ({
  createClaudeTransport: (
    await import('../claude-code/claude-transport.fixture')
  ).createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
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
 * A local Claude run that spawns an Explore agent, which reads a file and
 * starts a background command it then kills: the tape MAR-2879's acceptance
 * is about, cut from `session-claude-evidence.test.ts`.
 */
async function runLocalExploreTape(dir: string) {
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
  // Every delta the local handle hands the session, in order: what a host
  // running the same provider would put on the wire.
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
  await service.start(session.id, { text: 'probe' })
  await vi.waitUntil(() => child.stdin.readableLength > 0)
  const send = (event: unknown) =>
    child.stdout.write(JSON.stringify(event) + '\n')
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
  await capture.flushPendingEnd(session.id)
  await vi.waitUntil(() => readRecord(db, session.id).agentRuns.length === 1)
  const result = {
    record: readRecord(db, session.id),
    items: readItems(service, session.id),
    userMessage: service
      .getConversation(session.id)
      .find((item) => item.kind === 'message' && item.actor === 'user'),
    emitted: [...emitted],
  }
  await service.disposeAll()
  await capture.flushPendingEnd(session.id)
  return result
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
  cleanups.push(() => service.disposeAll())
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
