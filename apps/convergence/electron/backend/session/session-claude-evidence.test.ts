import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from './session.service'
import { TurnCaptureService } from './turn/turn-capture.service'
import { GitService } from '../git/git.service'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))
import { ClaudeCodeProvider } from '../provider/claude-code/claude-code-provider'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  spawnMock.mockReset()
  closeDatabase()
  resetDatabase()
})

it('records attributed calls, links, tasks and cost through the real service — drop agentRunId, relatedItemId, streamed uuid, retain an inherited task id, or clear the data-only error state (no renderer change) turns red', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'run54-record-'))
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
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
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
  cleanups.push(async () => {
    service.disposeAll()
    await capture.flushPendingEnd(session.id)
    rmSync(dir, { recursive: true, force: true })
  })
  await service.start(session.id, { text: 'probe' })
  await vi.waitUntil(() => child.stdin.writableEnded)
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
  send({ type: 'system', subtype: 'future_signal', extra: 'kept' })
  send({
    type: 'stream_event',
    uuid: 'stream-text-event',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'answer' },
    },
  })
  send({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'read-tool',
          content: 'failure data',
          is_error: true,
        },
      ],
    },
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
  const items = service.getConversation(session.id)
  const call = items.find(
    (item) => item.kind === 'tool-call' && item.toolName === 'Read',
  )
  const spawn = items.find(
    (item) => item.kind === 'tool-call' && item.toolName === 'Agent',
  )
  const result = items.find(
    (item) => item.kind === 'tool-result' && item.outputText === 'fixture',
  )
  expect({
    errorState: items.find(
      (item) =>
        item.kind === 'tool-result' && item.outputText === 'failure data',
    )?.state,
    stream: items.find(
      (item) => item.kind === 'message' && item.actor === 'assistant',
    )?.providerMeta.providerItemId,
    label: call?.agentAttribution,
    nestedTask: items
      .filter(
        (item) =>
          item.providerMeta.providerItemId === 'bash-tool' ||
          (item.kind === 'tool-result' && item.outputText === 'launched sleep'),
      )
      .map((item) => item.taskId),
    spawnTask: spawn?.taskId,
    call: call && {
      agent: call.agentRunId,
      task: call.taskId,
      provider: call.providerMeta.providerItemId,
    },
    result: result?.kind === 'tool-result' && {
      agent: result.agentRunId,
      related: result.relatedItemId,
      provider: result.providerMeta.providerItemId,
    },
    agents: db
      .prepare(
        'SELECT id,agent_type,description,model,status,depth FROM session_agent_runs WHERE session_id=?',
      )
      .all(session.id),
    task: db
      .prepare(
        "SELECT status,tool_use_id FROM session_tasks WHERE session_id=? AND task_id='bash-task'",
      )
      .get(session.id),
    unknown: db
      .prepare(
        "SELECT subtype FROM session_harness_events WHERE session_id=? AND subtype='future_signal'",
      )
      .get(session.id),
    cost: db
      .prepare('SELECT cost_usd FROM session_turns WHERE session_id=?')
      .get(session.id),
  }).toEqual({
    errorState: 'error',
    stream: 'stream-text-event',
    label: { description: 'Read fixture', agentType: 'Explore' },
    nestedTask: ['bash-task', 'bash-task'],
    spawnTask: 'agent-id',
    call: { agent: 'agent-id', task: 'agent-id', provider: 'read-tool' },
    result: {
      agent: 'agent-id',
      related: call?.id,
      provider: 'child-result-event',
    },
    agents: [
      {
        id: 'agent-id',
        agent_type: 'Explore',
        description: 'Read fixture',
        model: 'haiku',
        status: 'completed',
        depth: 1,
      },
    ],
    task: { status: 'stopped', tool_use_id: 'bash-tool' },
    unknown: { subtype: 'future_signal' },
    cost: { cost_usd: 0.125 },
  })
})
