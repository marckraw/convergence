import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from './session.service'
import { SessionQueuedInputService } from './session-queued-input.service'
import { HarnessEvidenceService } from './harness-evidence.service'
import { TurnCaptureService } from './turn/turn-capture.service'
import { GitService } from '../git/git.service'
import * as claudeTransport from '../provider/claude-code/claude-transport.service'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))
import { ClaudeCodeProvider } from '../provider/claude-code/claude-code-provider'

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  spawnMock.mockReset()
  closeDatabase()
  resetDatabase()
})

async function fixture(idleMinutes = 0, holdExit = false, refuseStops = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'resident-'))
  let nextPid = 100
  const children: Array<ReturnType<typeof makeChild>> = []
  function makeChild() {
    const child = Object.assign(new EventEmitter(), {
      pid: nextPid++,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      killed: false,
      holdStops: false,
      stopResponses: [] as Array<() => void>,
      kill: vi.fn(() => true),
    })
    child.kill.mockImplementation(() => {
      queueMicrotask(() => {
        child.emit('exit', null, 'SIGTERM')
        child.stdout.end()
      })
      return true
    })
    child.stdin.on('finish', () => {
      if (holdExit) return
      Object.assign(child, { exitCode: 0 })
      child.emit('exit', 0, null)
      child.stdout.end()
    })
    const controls: Array<{ subtype: string; model?: string }> = []
    const lines: string[] = []
    child.stdin.on('data', (data) => {
      for (const line of String(data).trim().split('\n')) {
        const event = JSON.parse(line)
        if (event.type === 'user') lines.push(line)
        if (event.type === 'control_request') {
          controls.push(event.request)
          const respond = () => {
            child.stdout.write(
              JSON.stringify({
                type: 'control_response',
                response: {
                  subtype:
                    event.request.subtype === 'stop_task' && refuseStops-- > 0
                      ? 'error'
                      : 'success',
                  error: 'fixture stop refusal',
                  request_id: event.request_id,
                  response: { still_queued: [] },
                },
              }) + '\n',
            )
          }
          if (event.request.subtype === 'stop_task' && child.holdStops)
            child.stopResponses.push(respond)
          else respond()
        }
      }
    })
    return Object.assign(child, { lines, controls })
  }
  spawnMock.mockImplementation(() => {
    const child = makeChild()
    children.push(child)
    return child
  })
  const db = getDatabase()
  const registry = new ProviderRegistry()
  registry.register(
    new ClaudeCodeProvider(
      '/fixture/claude',
      null,
      undefined,
      null,
      (id) =>
        id
          ? {
              configDir: join(dir, id),
              credentialDir: join(dir, id + '-credentials'),
            }
          : null,
      undefined,
      true,
      () => idleMinutes,
    ),
  )
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
  const capture = new TurnCaptureService(new GitService(), db, {
    debounceMs: 0,
  })
  service.setTurnCaptureService(capture)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'resident',
  })
  cleanup = async () => {
    await service.disposeAll()
    await capture.flushPendingEnd(session.id)
    rmSync(dir, { recursive: true, force: true })
  }
  return { service, session, children, db }
}

it('R6′ retries a refused scoped stop without changing the task — mutation retain requested id after refusal turns red', async () => {
  const { service, session, children } = await fixture(0, false, 1)
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task',
      task_type: 'local_bash',
    }) + '\n',
  )
  await vi.waitUntil(() => service.listTasks(session.id).length === 1)
  const results: string[] = []
  for (let n = 0; n < 2; n++) {
    try {
      await service.stopTask(session.id, 'task')
      results.push('receipt')
    } catch (error) {
      results.push(error instanceof Error ? error.message : String(error))
    }
  }
  expect({
    results,
    status: service.listTasks(session.id)[0].status,
    stops: children[0].controls.filter((c) => c.subtype === 'stop_task').length,
  }).toEqual({
    results: ['fixture stop refusal', 'receipt'],
    status: 'running',
    stops: 2,
  })
})

it('R6′ stops only the selected id and waits for its terminal fact — mutations interrupt session, settle on receipt, accept duplicates or drop stop reason turn red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'scope' })
  send({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'spawn',
          name: 'Agent',
          input: { description: 'selected', subagent_type: 'Explore' },
        },
      ],
    },
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'selected',
    tool_use_id: 'spawn',
    task_type: 'local_agent',
  })
  await vi.waitUntil(
    () => service.listAgentRuns(session.id)[0]?.id === 'selected',
  )
  await service.stopTask(session.id, 'selected')
  let duplicate = false
  try {
    await service.stopTask(session.id, 'selected')
  } catch {
    duplicate = true
  }
  const before = service.listAgentRuns(session.id)[0].status
  send({
    type: 'system',
    subtype: 'task_updated',
    task_id: 'selected',
    patch: { status: 'killed' },
  })
  await vi.waitUntil(
    () => service.listAgentRuns(session.id)[0]?.status === 'stopped',
  )
  expect({
    controls: children[0].controls.filter(
      (control) => control.subtype !== 'initialize',
    ),
    before,
    duplicate,
    killed: children[0].kill.mock.calls.length,
    status: service.getById(session.id)?.status,
    reason: service.listAgentRuns(session.id)[0].stopReason,
    taskReason: service.listTasks(session.id)[0].stopReason,
  }).toEqual({
    controls: [{ subtype: 'stop_task', task_id: 'selected' }],
    before: 'running',
    duplicate: true,
    killed: 0,
    status: 'running',
    reason: 'stop',
    taskReason: 'stop',
  })
})

it('keeps two turns on one process — spawn per turn or close stdin after a message turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (child: (typeof children)[number], event: unknown) =>
    child.stdout.write(JSON.stringify(event) + '\n')
  send(children[0], { type: 'system', subtype: 'init', session_id: 'harness' })
  send(children[0], {
    type: 'result',
    subtype: 'success',
    result: 'first answer',
  })
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(
    () => children.reduce((n, c) => n + c.lines.length, 0) === 2,
  )
  const current = children.at(-1)!
  send(current, { type: 'system', subtype: 'init', session_id: 'harness' })
  send(current, { type: 'result', subtype: 'success', result: 'second answer' })
  await vi.waitFor(() =>
    expect({
      spawns: children.length,
      stdinEnded: children[0].stdin.writableEnded,
      answers: service
        .getConversation(session.id)
        .filter((i) => i.kind === 'message' && i.actor === 'assistant').length,
    }).toEqual({ spawns: 1, stdinEnded: false, answers: 2 }),
  )
})

it('quit records a known stop — leave a task unknown or omit the quit note turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'background' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const child = children[0]
  child.stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task',
      task_type: 'local_bash',
      description: 'sleep',
      is_backgrounded: true,
    }) + '\n',
  )
  await vi.waitUntil(() => service.listTasks(session.id).length === 1)
  service.disposeAll()
  expect({
    tasks: service
      .listTasks(session.id)
      .map((t) => ({ status: t.status, reason: t.stopReason })),
    notes: service
      .getConversation(session.id)
      .filter((i) => i.kind === 'note')
      .map((i) => i.text),
  }).toEqual({
    tasks: [{ status: 'stopped', reason: 'quit' }],
    notes: ['Background task started: sleep', 'stopped by quit'],
  })
})

it('crash after acceptance never replays — resend the accepted line, lose exit reason, or complete the old row turns red', async () => {
  const { service, session, children, db } = await fixture()
  db.prepare('UPDATE sessions SET continuation_token=? WHERE id=?').run(
    'harness',
    session.id,
  )
  await service.start(session.id, { text: 'accepted once' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const child = children[0]
  child.stdout.write(
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'harness' }) +
      '\n',
  )
  child.stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task',
      task_type: 'local_bash',
      description: 'sleep',
    }) + '\n',
  )
  child.stdout.write(
    JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'accepted output' },
      },
    }) + '\n',
  )
  await vi.waitUntil(() => service.listTasks(session.id).length === 1)
  Object.assign(child, { exitCode: 1 })
  child.emit('exit', 1, null)
  child.stdout.end()
  await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
  await service.sendMessage(session.id, { text: 'explicit next message' })
  await vi.waitUntil(
    () => children.length === 2 && children[1].lines.length === 1,
  )
  expect({
    originalWrites: children
      .flatMap((c) => c.lines)
      .filter((l) => l.includes('accepted once')).length,
    task: service
      .listTasks(session.id)
      .map((t) => ({ status: t.status, reason: t.stopReason })),
  }).toEqual({
    originalWrites: 1,
    task: [{ status: 'unknown', reason: 'exit' }],
  })
  const oldRow = service.listTasks(session.id)[0]
  children[1].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task',
      status: 'completed',
      summary: 'old task finished',
    }) + '\n',
  )
  children[1].stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      origin: { kind: 'task-notification' },
      result: 'old task finished',
    }) + '\n',
  )
  await new Promise((r) => setTimeout(r, 0))
  expect({
    row: service.listTasks(session.id)[0],
    status: service.getById(session.id)?.status,
  }).toEqual({ row: oldRow, status: 'running' })
})

it('interrupts with a receipt while preserving the connection — terminate on interrupt turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'long' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const child = children[0]
  const send = (e: unknown) => child.stdout.write(JSON.stringify(e) + '\n')
  send({
    type: 'system',
    subtype: 'init',
    session_id: 'harness',
    capabilities: ['interrupt_receipt_v1'],
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  await service.sendMessage(session.id, { text: 'queued follow-up' })
  service.stop(session.id)
  send({
    type: 'result',
    subtype: 'error_during_execution',
    terminal_reason: 'aborted_streaming',
    is_error: true,
    errors: ['Interrupted by user'],
    session_id: 'harness',
    num_turns: 1,
  })
  await vi.waitFor(() =>
    expect({
      queue: service.getQueuedInputs(session.id).map((i) => i.state),
      status: service.getById(session.id)?.status,
      notes: service
        .getConversation(session.id)
        .filter((i) => i.kind === 'note')
        .map((i) => i.text),
      closed: child.stdin.writableEnded,
    }).toEqual({
      queue: ['queued'],
      status: 'completed',
      notes: ['interrupted'],
      closed: false,
    }),
  )
})

it('idle reaps at the bound and resumes on demand — reap a running task before the bound turns red', async () => {
  const { service, session, children } = await fixture(200 / 60000)
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'harness' }) +
      '\n',
  )
  children[0].stdout.write(
    JSON.stringify({ type: 'result', subtype: 'success', result: 'answer' }) +
      '\n',
  )
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'task_started',
      task_id: 'idle-task',
      task_type: 'local_bash',
      description: 'sleep',
    }) + '\n',
  )
  await new Promise((resolve) => setTimeout(resolve, 75))
  expect({
    open: !children[0].stdin.writableEnded,
    status: service.listTasks(session.id)[0]?.status,
  }).toEqual({ open: true, status: 'running' })
  await new Promise((resolve) => setTimeout(resolve, 275))
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(
    () => children.reduce((n, c) => n + c.lines.length, 0) === 2,
  )
  expect({
    spawns: children.length,
    firstClosed: children[0].stdin.writableEnded,
    resume: spawnMock.mock.calls[1]?.[1]?.includes('--resume=harness'),
  }).toEqual({ spawns: 2, firstClosed: true, resume: true })
})

it('switches the live model after its control response — keep the idle-only gate turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'working' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'harness' }) +
      '\n',
  )
  await expect(
    Promise.resolve().then(() =>
      service.setModelSelection(session.id, {
        providerId: 'claude-code',
        model: 'new-model',
        effort: null,
      }),
    ),
  ).resolves.toMatchObject({ model: 'new-model' })
})

it('quit awaits the local exit — return before disposal finishes turns red', async () => {
  const { service, session, children } = await fixture(0, true)
  await service.start(session.id, { text: 'work' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  let finished = false
  const pending = Promise.resolve(service.disposeAll()).then(() => {
    finished = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const beforeExit = finished
  children[0].emit('exit', 0, null)
  children[0].stdout.end()
  await pending
  expect(beforeExit).toBe(false)
})

it('account handoff ends the connection and resumes under the new account — reuse the process turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, {
    text: 'first',
    providerAccountId: 'first-account',
  })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'harness' }) +
      '\n',
  )
  children[0].stdout.write(
    JSON.stringify({ type: 'result', subtype: 'success', result: 'answer' }) +
      '\n',
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  await service.sendMessage(session.id, {
    text: 'second',
    providerAccountId: 'second-account',
  })
  await vi.waitFor(() =>
    expect({
      spawns: children.length,
      env: spawnMock.mock.calls[1]?.[2]?.env.CLAUDE_CONFIG_DIR,
      resume: spawnMock.mock.calls[1]?.[1]?.includes('--resume=harness'),
      notes: service
        .getConversation(session.id)
        .filter((i) => i.kind === 'note')
        .map((i) => i.text),
    }).toEqual({
      spawns: 2,
      env: expect.stringContaining('second-account'),
      resume: true,
      notes: ['connection ended: account changed'],
    }),
  )
})

it('boot failure before output retries the unaccepted line once — never resend turns red', async () => {
  const { service, session, children, db } = await fixture()
  db.prepare('UPDATE sessions SET continuation_token=? WHERE id=?').run(
    'prior',
    session.id,
  )
  await service.start(session.id, { text: 'unaccepted' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  Object.assign(children[0], { exitCode: 1 })
  children[0].emit('exit', 1, null)
  children[0].stdout.end()
  await vi.waitFor(() =>
    expect({
      writes: children
        .flatMap((c) => c.lines)
        .filter((l) => l.includes('unaccepted')).length,
      notes: service
        .getConversation(session.id)
        .filter((i) => i.kind === 'note')
        .map((i) => i.text),
    }).toEqual({
      writes: 2,
      notes: [
        'Claude Code did not accept the message (no output); sent again on a new process.',
      ],
    }),
  )
})

it('background work spans answers without a synthetic result — close after the first answer turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (e: unknown) =>
    children[0].stdout.write(JSON.stringify(e) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'harness' })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'task',
    task_type: 'local_bash',
    description: 'sleep',
  })
  send({ type: 'result', subtype: 'success', result: 'first answer' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'answered')
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(
    () => children.reduce((n, c) => n + c.lines.length, 0) >= 2,
  )
  const during = {
    spawns: children.length,
    open: !children[0].stdin.writableEnded,
    tasks: service.listTasks(session.id).map((t) => t.status),
  }
  send({
    type: 'system',
    subtype: 'task_updated',
    task_id: 'task',
    patch: { status: 'completed' },
  })
  await vi.waitUntil(
    () => service.listTasks(session.id)[0]?.status === 'completed',
  )
  expect(during).toEqual({ spawns: 1, open: true, tasks: ['running'] })
})

it('between-turn exit opens no turn and freezes old rows — emit running on idle exit turns red', async () => {
  const { service, session, children, db } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (e: unknown) =>
    children[0].stdout.write(JSON.stringify(e) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'harness' })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'old',
    task_type: 'local_bash',
    description: 'sleep',
  })
  send({ type: 'result', subtype: 'success', result: 'answer' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'answered')
  children[0].emit('exit', 1, null)
  children[0].stdout.end()
  await vi.waitUntil(
    () => service.listTasks(session.id)[0]?.status === 'unknown',
  )
  expect({
    status: service.getById(session.id)?.status,
    turns: db
      .prepare('SELECT COUNT(*) AS n FROM session_turns WHERE session_id=?')
      .get(session.id),
    notes: service
      .getConversation(session.id)
      .filter((i) => i.kind === 'note')
      .map((i) => i.text),
  }).toEqual({
    status: 'completed',
    turns: { n: 1 },
    notes: ['Background task started: sleep', 'process ended (code 1)'],
  })
})

it('interrupt without the advertised receipt stops the process — bypass capability detection or omit fallback turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'long' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'harness',
      capabilities: [],
    }) + '\n',
  )
  await new Promise((r) => setTimeout(r, 0))
  service.stop(session.id)
  await new Promise((r) => setTimeout(r, 0))
  expect({
    interrupts: children[0].controls.filter((c) => c.subtype === 'interrupt')
      .length,
    status: service.getById(session.id)?.status,
    notes: service
      .getConversation(session.id)
      .filter((i) => i.kind === 'note')
      .map((i) => i.text),
  }).toEqual({
    interrupts: 0,
    status: 'failed',
    notes: [
      'This Claude Code process does not support interrupt receipts',
      'terminated by user',
    ],
  })
})

it('unsolicited aborted-streaming remains failed — treat every abort as our interrupt turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'long' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      terminal_reason: 'aborted_streaming',
      is_error: true,
      errors: ['harness aborted'],
      result: 'harness aborted',
      session_id: 'harness',
      num_turns: 1,
    }) + '\n',
  )
  await vi.waitFor(() =>
    expect({
      status: service.getById(session.id)?.status,
      notes: service
        .getConversation(session.id)
        .filter((i) => i.kind === 'note')
        .map((i) => i.text),
    }).toEqual({ status: 'failed', notes: ['Error: harness aborted'] }),
  )
})

it('a completed interrupt request cannot bless a later abort — retain the prior request flag turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (e: unknown) =>
    children[0].stdout.write(JSON.stringify(e) + '\n')
  send({
    type: 'system',
    subtype: 'init',
    session_id: 'harness',
    capabilities: ['interrupt_receipt_v1'],
  })
  await new Promise((r) => setTimeout(r, 0))
  service.stop(session.id)
  send({ type: 'result', subtype: 'success', result: 'already finished' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(() => children[0].lines.length === 2)
  send({
    type: 'result',
    subtype: 'error_during_execution',
    terminal_reason: 'aborted_streaming',
    is_error: true,
    errors: ['harness aborted'],
    result: 'harness aborted',
    session_id: 'harness',
    num_turns: 1,
  })
  await vi.waitFor(() =>
    expect(service.getById(session.id)?.status).toBe('failed'),
  )
})

it('init refreshes the context model without opening another turn — ignore the init model turns red', async () => {
  const { service, session, children, db } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'harness',
      model: 'claude-sonnet-4-5',
    }) + '\n',
  )
  children[0].stdout.write(
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'answer' }],
        usage: {
          input_tokens: 40000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }) + '\n',
  )
  await vi.waitFor(() => {
    const context = service.getById(session.id)?.contextWindow
    expect({
      window:
        context?.availability === 'available'
          ? context.windowTokens
          : undefined,
      turns: db
        .prepare('SELECT COUNT(*) AS n FROM session_turns WHERE session_id=?')
        .get(session.id),
    }).toEqual({ window: 200000, turns: { n: 1 } })
  })
})

it('quit also awaits a previously released process — forget pending disposal turns red', async () => {
  const { service, session, children } = await fixture(0, true)
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'failed',
      errors: ['failed'],
      session_id: 'harness',
      num_turns: 1,
    }) + '\n',
  )
  await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
  let finished = false
  const pending = service.disposeAll().then(() => {
    finished = true
  })
  await new Promise((r) => setTimeout(r, 0))
  const beforeExit = finished
  children[0].emit('exit', 0, null)
  children[0].stdout.end()
  await pending
  expect(beforeExit).toBe(false)
})

function wire(child: { stdout: PassThrough }, event: unknown): void {
  child.stdout.write(JSON.stringify(event) + '\n')
}
it.each(['before-spawn', 'between-turns', 'old-cli'])(
  'H2 Stop falls back in %s — swallow not-applicable turns red',
  async (mode) => {
    const { service, session, children } = await fixture()
    await service.start(session.id, { text: 'first' })
    if (mode !== 'before-spawn') {
      await vi.waitUntil(() => children[0]?.lines.length === 1)
      if (mode === 'between-turns')
        wire(children[0], {
          type: 'result',
          subtype: 'success',
          result: 'done',
        })
      await new Promise((r) => setTimeout(r, 0))
    }
    service.stop(session.id)
    await vi.waitFor(() =>
      expect({
        status: service.getById(session.id)?.status,
        closed: children[0]?.stdin.writableEnded ?? true,
      }).toEqual({ status: 'failed', closed: true }),
    )
  },
)

it('M3 a normal completion racing Stop drains the queue — retain the request flag turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  wire(children[0], {
    type: 'system',
    subtype: 'init',
    session_id: 'harness',
    capabilities: ['interrupt_receipt_v1'],
  })
  await new Promise((r) => setTimeout(r, 0))
  await service.sendMessage(session.id, { text: 'queued' })
  service.stop(session.id)
  wire(children[0], {
    type: 'result',
    subtype: 'success',
    result: 'finished normally',
  })
  await vi.waitFor(() =>
    expect({
      writes: children[0].lines.length,
      queued: service.getQueuedInputs(session.id).length,
    }).toEqual({ writes: 2, queued: 0 }),
  )
})

it('M6 silent turn-three failure resumes the same conversation — drop the token turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  wire(children[0], { type: 'system', subtype: 'init', session_id: 'harness' })
  wire(children[0], { type: 'result', subtype: 'success', result: 'one' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(() => children[0].lines.length === 2)
  wire(children[0], { type: 'result', subtype: 'success', result: 'two' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  await service.sendMessage(session.id, { text: 'third' })
  await vi.waitUntil(() => children[0].lines.length === 3)
  children[0].emit('exit', 1, null)
  children[0].stdout.end()
  await vi.waitUntil(() => children[1]?.lines.length === 1)
  expect({
    writes: children.flatMap((c) => c.lines).filter((l) => l.includes('third'))
      .length,
    resume: spawnMock.mock.calls[1]?.[1]?.includes('--resume=harness'),
  }).toEqual({ writes: 2, resume: true })
})

it('M7 named missing-session refusal after init drops the token — gate behind output turns red', async () => {
  const { service, session, children, db } = await fixture()
  db.prepare('UPDATE sessions SET continuation_token=? WHERE id=?').run(
    'harness',
    session.id,
  )
  await service.start(session.id, { text: 'resume me' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  wire(children[0], { type: 'system', subtype: 'init', session_id: 'harness' })
  wire(children[0], {
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: 'No such session: harness',
    errors: ['No such session: harness'],
    session_id: 'harness',
    num_turns: 0,
  })
  await vi.waitFor(() =>
    expect({
      writes: children.flatMap((c) => c.lines).length,
      spawns: children.length,
      resume:
        spawnMock.mock.calls[1]?.[1]?.some((a: string) =>
          a.startsWith('--resume'),
        ) ?? null,
    }).toEqual({ writes: 2, spawns: 2, resume: false }),
  )
})

it('M9 the selected model and effort reach the live wire — no-op child.setModel turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  await service.setModelSelection(session.id, {
    providerId: 'claude-code',
    model: 'opus',
    effort: 'high',
  })
  expect(
    children[0].controls.filter((c) => c.subtype !== 'initialize'),
  ).toEqual([
    { subtype: 'set_model', model: 'opus' },
    { subtype: 'apply_flag_settings', settings: { effortLevel: 'high' } },
  ])
})

it('M4 turn-two skill activation uses the spawn telemetry sink — start telemetry only for selected skills turns red', async () => {
  const { ClaudeCodeSkillsService } =
    await import('../skills/claude-code-skills.service')
  const skill = {
    providerId: 'claude-code' as const,
    name: 'fixture-skill',
    path: '/fixture/SKILL.md',
    scope: 'project' as const,
    rawScope: null,
    id: 'fixture-skill',
    providerName: 'Claude Code',
    displayName: 'fixture-skill',
    description: 'fixture',
    shortDescription: null,
    sourceLabel: 'project',
    enabled: true,
    dependencies: [],
    warnings: [],
  }
  const catalog = vi
    .spyOn(ClaudeCodeSkillsService.prototype, 'list')
    .mockResolvedValue({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      skills: [skill],
      error: null,
    })
  try {
    const { service, session, children } = await fixture()
    await service.start(session.id, { text: 'first without skills' })
    await vi.waitUntil(() => children[0]?.lines.length === 1)
    const endpoint =
      spawnMock.mock.calls[0][2].env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
    wire(children[0], { type: 'result', subtype: 'success', result: 'first' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )
    await service.sendMessage(session.id, {
      text: 'use the skill',
      skillSelections: [{ ...skill, status: 'selected' }],
    })
    await vi.waitUntil(() => children[0].lines.length === 2)
    if (endpoint)
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      attributes: [
                        {
                          key: 'event.name',
                          value: { stringValue: 'skill_activated' },
                        },
                        { key: 'event.sequence', value: { intValue: 1 } },
                        {
                          key: 'skill.name',
                          value: { stringValue: 'fixture-skill' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      })
    await vi.waitFor(() =>
      expect({
        spawns: children.length,
        status: service
          .getConversation(session.id)
          .flatMap((i) =>
            i.kind === 'message' && i.actor === 'user'
              ? [i.skillSelections?.[0]?.status]
              : [],
          )
          .at(-1),
      }).toEqual({ spawns: 1, status: 'confirmed' }),
    )
  } finally {
    catalog.mockRestore()
  }
})

it('M5 quit has an eight-second deadline even when the transport never settles — await disposal without a deadline turns red', async () => {
  let settle!: () => void
  const neverSettled = new Promise<void>((resolve) => {
    settle = resolve
  })
  const create = claudeTransport.createClaudeTransport
  const transport = vi
    .spyOn(claudeTransport, 'createClaudeTransport')
    .mockImplementation((input) => {
      const real = create(input)
      return {
        ...real,
        close: () => {
          void real.close()
          return neverSettled
        },
      }
    })
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  vi.useFakeTimers()
  try {
    let finished = false
    void service.disposeAllForQuit().then(() => {
      finished = true
    })
    await vi.advanceTimersByTimeAsync(7999)
    const beforeDeadline = finished
    await vi.advanceTimersByTimeAsync(1)
    expect({ beforeDeadline, atDeadline: finished }).toEqual({
      beforeDeadline: false,
      atDeadline: true,
    })
  } finally {
    settle()
    transport.mockRestore()
    vi.useRealTimers()
  }
})

it.each([true, false])(
  'H2′ provider associates a batch through adopted identity and task facts still return — mutations stamp both or first turn red (confirmed=%s)',
  async (confirmed) => {
    const { service, session, children } = await fixture()
    await service.start(session.id, { text: 'fixture' })
    await vi.waitUntil(() => children[0]?.lines.length === 1)
    const send = (event: unknown) =>
      children[0].stdout.write(JSON.stringify(event) + '\n')
    send({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'other-tool',
            name: 'Bash',
            input: { command: 'echo fixture' },
          },
          {
            type: 'tool_use',
            id: 'agent-tool',
            name: 'Agent',
            input: { description: 'Read routes', subagent_type: 'Explore' },
          },
        ],
      },
    })
    send({
      type: 'system',
      subtype: 'task_started',
      task_id: 'adopted',
      tool_use_id: 'agent-tool',
      task_type: 'local_agent',
      description: 'Read routes',
    })
    send({
      type: 'user',
      uuid: 'batch',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'other-tool',
            content: 'command output',
          },
          {
            type: 'tool_result',
            tool_use_id: 'agent-tool',
            content: 'launch acknowledged',
          },
        ],
      },
      tool_use_result: {
        status: 'async_launched',
        ...(confirmed ? { agentId: 'adopted' } : {}),
      },
    })
    send({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'adopted',
      status: 'completed',
      summary: 'Read routes complete',
    })
    await vi.waitUntil(
      () => service.listTasks(session.id)[0]?.status === 'completed',
    )
    const items = service.getConversation(session.id)
    expect({
      moments: items
        .filter((item) => item.kind === 'tool-result')
        .map((item) => item.providerMeta.providerEventType),
      returns: items
        .filter(
          (item) =>
            item.kind === 'note' &&
            item.providerMeta.providerEventType === 'harness.task.terminal',
        )
        .map((item) => item.taskId),
    }).toEqual({
      moments: [
        'tool_result',
        confirmed ? 'tool_result.async_launched' : 'tool_result',
      ],
      returns: ['adopted'],
    })
  },
)

it('H1 Agent+Agent fake stream preserves the unclaimed identity and running state — mutation bypass identity claim gate turns red', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'fixture' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({
    type: 'assistant',
    message: {
      content: ['a', 'b'].map((id) => ({
        type: 'tool_use',
        id,
        name: 'Agent',
        input: { description: id, subagent_type: 'Explore' },
      })),
    },
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'adopted-a',
    tool_use_id: 'a',
    task_type: 'local_agent',
  })
  send({
    type: 'user',
    message: {
      content: ['a', 'b'].map((id) => ({
        type: 'tool_result',
        tool_use_id: id,
        content: 'result block',
      })),
    },
    tool_use_result: {
      agentId: 'adopted-a',
      status: 'completed',
      resolvedModel: 'haiku',
    },
  })
  await vi.waitUntil(
    () =>
      service.listAgentRuns(session.id).find((run) => run.id === 'adopted-a')
        ?.status === 'completed',
  )
  expect({
    results: service
      .getConversation(session.id)
      .filter((item) => item.kind === 'tool-result').length,
    runs: service
      .listAgentRuns(session.id)
      .map(({ id, status, model }) => ({ id, status, model })),
  }).toEqual({
    results: 2,
    runs: [
      { id: 'adopted-a', status: 'completed', model: 'haiku' },
      { id: 'b', status: 'running', model: null },
    ],
  })
})

it.each(['completed', 'failed', 'stopped'] as const)(
  'RUN77 recorded %s tape waits for its witness — mutations settle on result/count or require result after our stop turn red',
  async (ending) => {
    const { service, session, children } = await fixture()
    const settles = vi.fn()
    service.onSessionSettled(settles)
    await service.start(session.id, { text: 'start the background fixture' })
    await vi.waitUntil(() => children[0]?.lines.length === 1)
    const send = (event: unknown) =>
      children[0].stdout.write(JSON.stringify(event) + '\n')
    const answer = (text: string) =>
      send({
        type: 'assistant',
        message: { content: [{ type: 'text', text }] },
      })
    send({ type: 'system', subtype: 'init', session_id: 'run77' })
    send({
      type: 'system',
      subtype: 'task_started',
      task_id: 'task',
      task_type: 'local_bash',
    })
    answer('EARLY ANSWER\nBATON: fable')
    send({ type: 'result', subtype: 'success', terminal_reason: 'completed' })
    await vi.waitUntil(() => service.getById(session.id)?.status !== 'running')
    expect(service.getById(session.id)?.status).toBe('answered')
    expect(service.getById(session.id)?.attention).toBe('none')
    expect(settles).not.toHaveBeenCalled()
    // Three live tapes: completed/failed need the next result; our stopped task does not produce one.
    if (ending === 'stopped') {
      await service.stopTask(session.id, 'task')
      expect(service.listTasks(session.id)[0]?.stopReceiptAt).toEqual(
        expect.any(String),
      )
    }
    send({
      type: 'system',
      subtype: 'task_updated',
      task_id: 'task',
      patch: { status: ending === 'stopped' ? 'killed' : ending },
    })
    send({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task',
      status: ending,
    })
    await vi.waitUntil(
      () => service.listTasks(session.id)[0]?.status === ending,
    )
    if (ending !== 'stopped') {
      expect(service.getById(session.id)?.status).toBe('answered')
      expect(settles).not.toHaveBeenCalled()
      send({ type: 'system', subtype: 'status', status: 'requesting' })
      await vi.waitUntil(
        () => service.getById(session.id)?.status === 'running',
      )
      answer('LATE ANSWER')
      send({
        type: 'result',
        subtype: 'success',
        origin: { kind: 'task-notification' },
        terminal_reason: 'completed',
      })
    }
    await vi.waitUntil(() => settles.mock.calls.length === 1)
    expect(service.getById(session.id)?.status).toBe('completed')
    expect(service.getById(session.id)?.attention).toBe('finished')
    expect(settles.mock.calls[0][0].answerWindow).toEqual({
      message:
        ending === 'stopped' ? 'EARLY ANSWER\nBATON: fable' : 'LATE ANSWER',
      declaration: { kind: 'named', name: 'fable' },
    })
    expect(service.getLastAssistantMessageText(session.id)).toBe(
      ending === 'stopped' ? 'EARLY ANSWER\nBATON: fable' : 'LATE ANSWER',
    )
    send({
      type: 'result',
      subtype: 'success',
      origin: { kind: 'task-notification' },
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(settles).toHaveBeenCalledTimes(1)
  },
)

async function answeredFixture(taskIds = ['task'], queued = false) {
  const f = await fixture()
  await f.service.start(f.session.id, { text: 'answer then wait for tasks' })
  await vi.waitUntil(() => f.children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    f.children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'run77' })
  for (const task_id of taskIds)
    send({
      type: 'system',
      subtype: 'task_started',
      task_id,
      task_type: 'local_bash',
    })
  send({
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'EARLY ANSWER\nBATON: fable' }],
    },
  })
  if (queued)
    await f.service.sendMessage(f.session.id, {
      text: 'preserve this follow-up',
    })
  send({ type: 'result', subtype: 'success' })
  await vi.waitUntil(
    () => f.service.getById(f.session.id)?.status === 'answered',
  )
  const settles = vi.fn()
  f.service.onSessionSettled(settles)
  return { ...f, send, settles }
}

it.each(['exit', 'quit', 'stop'] as const)(
  'RUN77 %s closes answered with unknown work — mutation leave answered or mark unresolved stopped turns red',
  async (reason) => {
    const { service, session, children, settles } = await answeredFixture()
    if (reason === 'exit') {
      children[0].emit('exit', 1, null)
      children[0].stdout.end()
    } else if (reason === 'quit') await service.disposeAll()
    else service.stop(session.id)
    await vi.waitUntil(() => settles.mock.calls.length === 1)
    expect(service.getById(session.id)?.status).toBe('completed')
    expect(service.getById(session.id)?.attention).toBe('finished')
    expect(service.listTasks(session.id)[0]?.status).toBe('unknown')
    if (reason === 'stop') {
      expect(children[0].controls.some((c) => c.subtype === 'stop_task')).toBe(
        true,
      )
      expect(service.listTasks(session.id)[0]?.stopReceiptAt).toEqual(
        expect.any(String),
      )
    }
  },
)

it('RUN77 stop receipt joins an earlier terminal fact — mutation require receipt before terminal turns red', async () => {
  const { service, session, children, send, settles } = await answeredFixture()
  children[0].holdStops = true
  // Terminal fact can beat the asynchronous control receipt, as on the live tape.
  const stopping = service.stopTask(session.id, 'task')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'stopped',
  })
  await vi.waitUntil(
    () => service.listTasks(session.id)[0]?.status === 'stopped',
  )
  expect(service.listTasks(session.id)[0]?.stopReceiptAt).toBeNull()
  expect(service.getById(session.id)?.status).toBe('answered')
  expect(settles).not.toHaveBeenCalled()
  await vi.waitUntil(() => children[0].stopResponses.length === 1)
  children[0].stopResponses[0]()
  await stopping
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  expect(service.listTasks(session.id)[0]?.stopReceiptAt).toEqual(
    expect.any(String),
  )
})

it('RUN77 an unrequested stop or one remaining task cannot settle — mutations settle any stop or ignore counts turn red', async () => {
  const { service, session, send, settles } = await answeredFixture([
    'task',
    'other',
  ])
  await service.stopTask(session.id, 'task')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'stopped',
  })
  await vi.waitUntil(
    () => service.listTasks(session.id)[0]?.status === 'stopped',
  )
  expect(service.getById(session.id)?.status).toBe('answered')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'other',
    status: 'stopped',
  })
  await vi.waitUntil(() =>
    service.listTasks(session.id).every((t) => t.status === 'stopped'),
  )
  expect(service.getById(session.id)?.status).toBe('answered')
  expect(settles).not.toHaveBeenCalled()
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  expect(service.getLastAssistantMessageText(session.id)).toBe(
    'EARLY ANSWER\nBATON: fable',
  )
})

it('RUN77 a continuation after our stop opens a fresh window — mutation reuse old window baton turns red', async () => {
  const { service, session, send, settles } = await answeredFixture()
  await service.stopTask(session.id, 'task')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'stopped',
  })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  send({ type: 'system', subtype: 'status', status: 'requesting' })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'NEW WINDOW\nBATON: other' }] },
  })
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => settles.mock.calls.length === 2)
  expect(settles.mock.calls[1][0].answerWindow).toEqual({
    message: 'NEW WINDOW\nBATON: other',
    declaration: { kind: 'named', name: 'other' },
  })
  send({ type: 'system', subtype: 'status', status: 'requesting' })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'NO DECLARATION' }] },
  })
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => settles.mock.calls.length === 3)
  expect(settles.mock.calls[2][0].answerWindow).toEqual({
    message: 'NO DECLARATION',
    declaration: { kind: 'none' },
  })
})

it('RUN77 answered refuses reset but accepts an explicit user follow-up — mutation treat answered as terminal or accept notification result during user turn turns red', async () => {
  const { service, session, send, settles, children } = await answeredFixture()
  await expect(
    service.sendMessage(session.id, { text: '/clear' }),
  ).rejects.toThrow()
  await service.sendMessage(session.id, { text: 'explicit follow-up' })
  await vi.waitUntil(() => children[0].lines.length === 2)
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await new Promise((resolve) => setImmediate(resolve))
  expect(service.getById(session.id)?.status).toBe('running')
  expect(settles).not.toHaveBeenCalled()
})

it('RUN77 queued follow-up drains only at the real witness — mutation drain on answered turns red', async () => {
  const { service, session, children } = await fixture()
  const settles = vi.fn()
  service.onSessionSettled(settles)
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'fixture' })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'task',
    task_type: 'local_bash',
  })
  await service.sendMessage(session.id, { text: 'queued message' })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'EARLY' }] },
  })
  send({ type: 'result', subtype: 'success' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'answered')
  expect(children[0].lines).toHaveLength(1)
  expect(service.getQueuedInputs(session.id).map((q) => q.state)).toEqual([
    'queued',
  ])
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'completed',
  })
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => children[0].lines.length === 2)
  expect(settles).toHaveBeenCalledTimes(1)
  expect(settles.mock.calls[0][0].answerWindow.message).toBe('EARLY')
})

it('RUN77 child frames cannot witness the main answer — mutation remove parent guard turns red', async () => {
  const { service, session, send, settles } = await answeredFixture()
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'completed',
  })
  send({ type: 'result', parent_tool_use_id: 'child', subtype: 'success' })
  send({
    type: 'stream_event',
    parent_tool_use_id: 'child',
    event: { type: 'message_start' },
  })
  await new Promise((resolve) => setImmediate(resolve))
  expect(service.getById(session.id)?.status).toBe('answered')
  expect(settles).not.toHaveBeenCalled()
})

it('RUN77 a result with no open window settles nothing — mutation accept result after completion turns red', async () => {
  const { service, session, send, settles } = await answeredFixture()
  await service.stopTask(session.id, 'task')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'stopped',
  })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'out-of-window',
    task_type: 'local_bash',
  })
  send({ type: 'result', subtype: 'success', result: 'late result' })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'barrier',
    task_type: 'local_bash',
  })
  await vi.waitUntil(() =>
    service.listTasks(session.id).some((task) => task.taskId === 'barrier'),
  )
  expect(service.getById(session.id)?.status).toBe('completed')
  expect(settles).toHaveBeenCalledTimes(1)
})

it.each(['panel', 'quit'] as const)(
  'RUN77 %s witness broadcasts the same counts it used — mutation retain stale summary counts turns red',
  async (ending) => {
    const { service, session, send, settles } = await answeredFixture()
    // Seed the real summary cache before the fact changes, as a mounted sidebar does.
    await vi.waitUntil(
      () => service.getSummaryById(session.id)?.parallelWork?.running === 1,
    )
    const summaries: Array<{
      status: string
      running: number
      unknown: number
    }> = []
    service.setSummaryUpdateListener((summary) =>
      summaries.push({
        status: summary.status,
        running: summary.parallelWork!.running,
        unknown: summary.parallelWork!.unknown,
      }),
    )
    if (ending === 'quit') await service.disposeAll()
    else {
      await service.stopTask(session.id, 'task')
      send({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task',
        status: 'stopped',
      })
    }
    await vi.waitUntil(() => settles.mock.calls.length === 1)
    expect(
      summaries
        .filter((s) => s.status === 'completed')
        .every(
          (s) => s.running === 0 && s.unknown === (ending === 'quit' ? 1 : 0),
        ),
    ).toBe(true)
  },
)

it.each(['quit', 'stop'] as const)(
  'RUN77 lap4 %s retains queued input — mutation drop quitting/Stop retention turns red',
  async (ending) => {
    const { service, session, children, settles } = await answeredFixture(
      ['task'],
      true,
    )
    if (ending === 'quit') await service.disposeAll()
    else service.stop(session.id)
    await vi.waitUntil(() => settles.mock.calls.length === 1)
    await new Promise((resolve) => setImmediate(resolve))
    expect(
      service
        .getQueuedInputs(session.id)
        .map((q) => ({ text: q.text, state: q.state })),
    ).toEqual([{ text: 'preserve this follow-up', state: 'queued' }])
    expect(children).toHaveLength(1)
    expect(children[0].lines).toHaveLength(1)
  },
)

it('RUN77 lap5 Stop completes a harness continuation and retains the queue — mutation drop opener check turns red', async () => {
  const { service, session, children, send, settles } = await answeredFixture(
    ['task'],
    true,
  )
  children[0].holdStops = true
  service.stop(session.id)
  await vi.waitUntil(() => children[0].stopResponses.length === 1)
  send({ type: 'system', subtype: 'status', status: 'requesting' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'running')
  children[0].stopResponses[0]()
  await vi.waitUntil(() => !service.getSummaryById(session.id)?.hasActiveHandle)
  expect(service.getById(session.id)?.status).toBe('completed')
  expect(
    service
      .getQueuedInputs(session.id)
      .map(({ text, state }) => ({ text, state })),
  ).toEqual([{ text: 'preserve this follow-up', state: 'queued' }])
  expect(settles).toHaveBeenCalledTimes(1)
  expect(children[0].stdin.writableEnded).toBe(true)
  expect(service.listTasks(session.id).map((task) => task.status)).toEqual([
    'unknown',
  ])
})

it('RUN77 lap6 normal Stop of a harness continuation retains queued input — mutation omit stoppedByUser from retention turns red', async () => {
  const { service, session, children, send, settles } = await answeredFixture(
    ['task'],
    true,
  )
  send({ type: 'system', subtype: 'status', status: 'requesting' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'running')
  service.stop(session.id)
  await vi.waitUntil(() => !service.getSummaryById(session.id)?.hasActiveHandle)
  expect(service.getById(session.id)?.status).toBe('completed')
  expect(service.getQueuedInputs(session.id).map((q) => q.state)).toEqual([
    'queued',
  ])
  expect(children[0].lines).toHaveLength(1)
  expect(settles).toHaveBeenCalledTimes(1)
})

it('RUN77 lap6 conversation Stop retains input when the terminal task fact beats its receipt — mutation remove service retention before provider Stop is armed turns red', async () => {
  const { service, session, children, send, settles, db } =
    await answeredFixture(['task'], true)
  children[0].holdStops = true
  service.stop(session.id)
  await vi.waitUntil(() => children[0].stopResponses.length === 1)
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'stopped',
  })
  await vi.waitUntil(
    () => service.listTasks(session.id)[0]?.status === 'stopped',
  )
  children[0].stopResponses[0]()
  await vi.waitUntil(() => !service.getSummaryById(session.id)?.hasActiveHandle)
  expect({
    rows: db
      .prepare('SELECT state FROM session_queued_inputs WHERE session_id=?')
      .all(session.id),
    userLines: children[0].lines.length,
    settles: settles.mock.calls.length,
  }).toEqual({ rows: [{ state: 'queued' }], userLines: 1, settles: 1 })
})

it.each(['recover', 'stop', 'approve', 'deny'] as const)(
  'RUN77 lap4 %s heals an orphan answered row — mutation recover running only turns red',
  async (action) => {
    const { service, session, db } = await fixture()
    db.prepare("UPDATE sessions SET status='answered' WHERE id=?").run(
      session.id,
    )
    new HarnessEvidenceService(db).apply(session.id, null, {
      kind: 'task.changed',
      at: '2026-09-13T00:00:00Z',
      taskId: 'orphan',
      patch: { status: 'running' },
    })
    const target =
      action === 'recover'
        ? new SessionService(db, new LocalExecutionHost(new ProviderRegistry()))
        : service
    const settles = vi.fn()
    target.onSessionSettled(settles)
    if (action === 'stop') target.stop(session.id)
    if (action === 'approve') target.approve(session.id)
    if (action === 'deny') target.deny(session.id)
    await new Promise((resolve) => setImmediate(resolve))
    expect({
      status: target.getById(session.id)?.status,
      attention: target.getById(session.id)?.attention,
      task: target.listTasks(session.id)[0]?.status,
    }).toEqual({ status: 'completed', attention: 'finished', task: 'unknown' })
    expect(settles).toHaveBeenCalledTimes(action === 'recover' ? 0 : 1)
    await target.disposeAll()
  },
)

it.each(['redelivery', 'completion'] as const)(
  'RUN77 lap5 %s catches a queue read rejection — mutation drop dispatch catch turns red',
  async (trigger) => {
    const { service, session, db, send } = await answeredFixture(['task'], true)
    const queued = service.getQueuedInputs(session.id)[0]
    const failure = new Error('fixture queue read refused')
    const read = vi
      .spyOn(SessionQueuedInputService.prototype, 'nextQueued')
      .mockImplementationOnce(() => {
        throw failure
      })
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      if (trigger === 'redelivery') {
        new SessionQueuedInputService(db).patch(queued.id, 'failed')
        service.redeliverQueuedInput(queued.id)
      } else {
        send({
          type: 'system',
          subtype: 'task_notification',
          task_id: 'task',
          status: 'completed',
        })
        send({ type: 'result', subtype: 'success' })
      }
      await vi.waitFor(() =>
        expect(reported).toHaveBeenCalledWith(
          '[session] Could not dispatch queued input',
          failure,
        ),
      )
      expect(
        service.getQueuedInputs(session.id).filter((q) => q.state === 'queued'),
      ).toHaveLength(1)
    } finally {
      read.mockRestore()
      reported.mockRestore()
    }
  },
)

it('RUN77 lap4 a harness turn during send awaits queues the input — mutation return silently turns red', async () => {
  const { ClaudeCodeSkillsService } =
    await import('../skills/claude-code-skills.service')
  let resolveCatalog!: (
    value: Awaited<
      ReturnType<InstanceType<typeof ClaudeCodeSkillsService>['list']>
    >,
  ) => void
  const pending = new Promise<
    Awaited<ReturnType<InstanceType<typeof ClaudeCodeSkillsService>['list']>>
  >((resolve) => {
    resolveCatalog = resolve
  })
  const catalog = vi
    .spyOn(ClaudeCodeSkillsService.prototype, 'list')
    .mockReturnValue(pending)
  const skill = {
    providerId: 'claude-code' as const,
    id: 'fixture-skill',
    name: 'fixture-skill',
    path: '/fixture/SKILL.md',
    scope: 'project' as const,
    rawScope: null,
    providerName: 'Claude Code',
    displayName: 'fixture-skill',
    description: 'fixture',
    shortDescription: null,
    sourceLabel: 'project',
    enabled: true,
    dependencies: [],
    warnings: [],
  }
  try {
    const { service, session, children, send, settles } =
      await answeredFixture()
    const sending = service.sendMessage(session.id, {
      text: 'keep this send',
      skillSelections: [{ ...skill, status: 'selected' }],
    })
    await vi.waitUntil(() => catalog.mock.calls.length === 1)
    send({ type: 'system', subtype: 'status', status: 'requesting' })
    await vi.waitUntil(() => service.getById(session.id)?.status === 'running')
    resolveCatalog({
      providerId: 'claude-code',
      providerName: 'Claude Code',
      catalogSource: 'filesystem',
      invocationSupport: 'native-command',
      activationConfirmation: 'native-event',
      skills: [skill],
      error: null,
    })
    const dispatchId = await sending
    await new Promise((resolve) => setImmediate(resolve))
    expect(service.getQueuedInputs(session.id)).toMatchObject([
      { text: 'keep this send', state: 'queued', dispatchId },
    ])
    expect(children[0].lines).toHaveLength(1)
    send({
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task',
      status: 'completed',
    })
    send({
      type: 'result',
      subtype: 'success',
      origin: { kind: 'task-notification' },
    })
    await vi.waitUntil(() => children[0].lines.length === 2)
    expect(settles.mock.calls[0][0].dispatchIds).not.toContain(dispatchId)
    expect(children[0].lines[1]).toContain('keep this send')
  } finally {
    catalog.mockRestore()
  }
})

it('RUN77 lap4 a user follow-up resets the window — mutation reset neither opener turns red', async () => {
  const { service, session, children, send, settles } = await answeredFixture()
  await service.sendMessage(session.id, { text: 'one more thing' })
  await vi.waitUntil(() => children[0].lines.length === 2)
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'completed',
  })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'done.' }] },
  })
  send({ type: 'result', subtype: 'success' })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  expect(settles.mock.calls[0][0].answerWindow).toEqual({
    message: 'done.',
    declaration: { kind: 'none' },
  })
})

it('RUN77 lap4 a stopped snapshot cannot reuse a receipt in window two — mutation keep the joined receipt turns red', async () => {
  const { service, session, send, settles } = await answeredFixture(['A'])
  await service.stopTask(session.id, 'A')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'A',
    status: 'stopped',
  })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  send({ type: 'system', subtype: 'status', status: 'requesting' })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'B',
    task_type: 'local_bash',
  })
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'window two' }] },
  })
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'answered')
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'B',
    status: 'completed',
  })
  await vi.waitUntil(
    () =>
      service.listTasks(session.id).find((t) => t.taskId === 'B')?.status ===
      'completed',
  )
  send({
    type: 'system',
    subtype: 'background_tasks_changed',
    tasks: [{ task_id: 'A', status: 'killed' }],
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'barrier',
    task_type: 'local_bash',
  })
  await vi.waitUntil(() =>
    service.listTasks(session.id).some((t) => t.taskId === 'barrier'),
  )
  expect(service.getById(session.id)?.status).toBe('answered')
  expect(settles).toHaveBeenCalledTimes(1)
})

it('RUN77 lap4 a repeated persisted stopped status is not a witness — mutation ignore persisted status turns red', async () => {
  const { service, session, db, send, settles } = await answeredFixture()
  await service.stopTask(session.id, 'task')
  // A replay already applied this status; receipt alone cannot make it a new transition.
  db.prepare(
    "UPDATE session_tasks SET status='stopped' WHERE session_id=?",
  ).run(session.id)
  send({
    type: 'system',
    subtype: 'background_tasks_changed',
    tasks: [{ task_id: 'task', status: 'killed' }],
  })
  send({
    type: 'system',
    subtype: 'task_started',
    task_id: 'barrier',
    task_type: 'local_bash',
  })
  await vi.waitUntil(() =>
    service.listTasks(session.id).some((t) => t.taskId === 'barrier'),
  )
  expect(service.getById(session.id)?.status).toBe('answered')
  expect(settles).not.toHaveBeenCalled()
})

it('RUN77 lap4 a Stop continuation rejection is handled — mutation drop rejection handler turns red', async () => {
  const { service, session, children } = await answeredFixture()
  children[0].holdStops = true
  service.stop(session.id)
  await vi.waitUntil(() => children[0].stopResponses.length === 1)
  const read = vi.spyOn(service, 'getById')
  // Fail only the final Stop check, after the control acknowledgement has joined the record.
  read.mockImplementationOnce(() => {
    throw new Error('fixture Stop read failed')
  })
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    children[0].stopResponses[0]()
    await vi.waitUntil(() =>
      errors.mock.calls.some((c) =>
        String(c[0]).includes('Could not finish conversation Stop'),
      ),
    )
    expect(errors.mock.calls[0][1]).toEqual(
      new Error('fixture Stop read failed'),
    )
  } finally {
    read.mockRestore()
    errors.mockRestore()
  }
})

it('RUN77 lap4 corrupt answer JSON cannot abort a settle — mutation parse without guard turns red', async () => {
  const { session, db, send, settles } = await answeredFixture()
  db.prepare(
    "UPDATE session_conversation_items SET payload_json='{' WHERE session_id=? AND kind='message'",
  ).run(session.id)
  send({
    type: 'system',
    subtype: 'task_notification',
    task_id: 'task',
    status: 'completed',
  })
  send({
    type: 'result',
    subtype: 'success',
    origin: { kind: 'task-notification' },
  })
  await vi.waitUntil(() => settles.mock.calls.length === 1)
  expect(settles.mock.calls[0][0].answerWindow).toEqual({
    message: null,
    declaration: { kind: 'none' },
  })
})

it.each(['normal', 'queued'] as const)(
  'RUN77 lap4 accepted %s async send records its own account — mutation accept after the user frame turns red',
  async (mode) => {
    const { service, session, children } = await fixture()
    await service.start(session.id, {
      text: 'first',
      providerAccountId: 'account-a',
    })
    await vi.waitUntil(() => children[0]?.lines.length === 1)
    if (mode === 'queued')
      await service.sendMessage(session.id, {
        text: 'second',
        providerAccountId: 'account-b',
      })
    children[0].stdout.write(
      JSON.stringify({ type: 'result', subtype: 'success' }) + '\n',
    )
    if (mode === 'normal') {
      await vi.waitUntil(
        () => service.getById(session.id)?.status === 'completed',
      )
      await service.sendMessage(session.id, {
        text: 'second',
        providerAccountId: 'account-b',
      })
    }
    await vi.waitUntil(() => children[1]?.lines.length === 1)
    expect(service.getLastTurnProviderAccountId(session.id)).toBe('account-b')
  },
)

// -- MAR-3023: an accepted turn is never a failed send when its recording fails --

it('MAR-3023 door (2): a resident Claude send resolves when only its post-accept recording fails', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'resident' })
  send({ type: 'result', subtype: 'success', result: 'first answer' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')

  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  // Refuse only the user-message insert — the write that happens after
  // onTurnAccepted has already bound the turn (claude-code-provider.ts) —
  // so the recording-failed note itself can still land.
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_user_message
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'message'
         AND json_extract(NEW.payload_json, '$.actor') = 'user'
    BEGIN SELECT RAISE(ABORT, 'fixture user message refused'); END`)

  const dispatchId = await service.sendMessage(session.id, {
    text: 'accepted turn, refused record',
  })

  // The door resolves with its receipt — the composer sees accepted, not
  // failed — and the resident process took exactly one new prompt: the turn
  // ran, nothing re-sent it.
  expect(dispatchId).toBeTypeOf('string')
  const prompts = () => children.reduce((n, child) => n + child.lines.length, 0)
  await vi.waitUntil(() => prompts() === 2)
  // A grace, so a retry that lands a beat later cannot slip under the count.
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(prompts()).toBe(2)
  expect(service.getById(session.id)?.status).not.toBe('failed')
  // The loss is the turn's own outcome: one fact for the dispatch...
  expect(failures.map((failure) => failure.dispatchId)).toEqual([dispatchId])
  expect(failures[0]).toMatchObject({ label: 'the conversation item' })
  // ...and one note on the conversation, honest about the recovery.
  const notes = service
    .getConversation(session.id)
    .filter(
      (item): item is Extract<typeof item, { kind: 'note' }> =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )
  expect(notes).toHaveLength(1)
  expect(notes[0].text).toContain('do not resend it')

  // F: the lost user message still opened a turn of its own. Its reply and
  // the note carry that turn's id — never the previous turn's, read back from
  // the last row that did land.
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'second answer' }] },
  })
  send({ type: 'result', subtype: 'success', result: 'second answer' })
  await vi.waitUntil(() =>
    service
      .getConversation(session.id)
      .some(
        (item) =>
          item.kind === 'message' &&
          item.actor === 'assistant' &&
          item.text === 'second answer',
      ),
  )
  const conversation = service.getConversation(session.id)
  const firstTurnId = conversation.find(
    (item) => item.kind === 'message' && item.actor === 'user',
  )?.turnId
  const reply = conversation.find(
    (item) =>
      item.kind === 'message' &&
      item.actor === 'assistant' &&
      item.text === 'second answer',
  )
  expect(firstTurnId).toBeTypeOf('string')
  expect(reply?.turnId).toBeTypeOf('string')
  expect(reply?.turnId).not.toBe(firstTurnId)
  expect(notes[0].turnId).toBe(reply?.turnId)
  expect(notes[0].text).toContain(`turn ${reply?.turnId}`)
  expect(failures[0].turnId).toBe(reply?.turnId)
  errors.mockRestore()
})

it('MAR-3023 G: a refused sent mark is re-attempted at the turn’s settle, so the row does not stay dispatching', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'resident' })
  await service.sendMessage(session.id, { text: 'queued follow-up' })
  expect(service.getQueuedInputs(session.id).map((q) => q.state)).toEqual([
    'queued',
  ])

  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  // The record refuses the drain's 'sent' mark — once.
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_sent_mark
    BEFORE UPDATE ON session_queued_inputs
    WHEN NEW.state = 'sent'
    BEGIN SELECT RAISE(ABORT, 'fixture sent mark refused'); END`)

  // Turn 1 settles; the drain delivers the follow-up and the resident takes it.
  send({ type: 'result', subtype: 'success', result: 'first answer' })
  await vi.waitUntil(() => children[0].lines.length === 2)
  await vi.waitUntil(() => failures.length === 1)
  expect(failures[0]).toMatchObject({ label: 'the queued input sent mark' })
  expect(service.getQueuedInputs(session.id).map((q) => q.state)).toEqual([
    'dispatching',
  ])

  // The record takes writes again; the follow-up's turn settles.
  getDatabase().exec('DROP TRIGGER refuse_sent_mark')
  send({ type: 'result', subtype: 'success', result: 'second answer' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')

  // The settle re-attempted the mark: a launch will not call it unaccepted.
  // (Read from the table — the queue list hides rows that were sent.)
  expect(
    getDatabase()
      .prepare('SELECT state FROM session_queued_inputs WHERE session_id = ?')
      .all(session.id),
  ).toEqual([{ state: 'sent' }])
  errors.mockRestore()
})

it('MAR-3023 H: a resident Claude turn whose reply cannot be recorded announces the loss and runs on to its settle', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'resident' })
  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  // The turn is bound and written; the record refuses the assistant reply.
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_assistant_reply
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'message'
         AND json_extract(NEW.payload_json, '$.actor') = 'assistant'
    BEGIN SELECT RAISE(ABORT, 'fixture reply refused'); END`)

  // Claude buffers the reply until the turn's result: the write is refused
  // inside the settle event itself.
  send({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'the answer' }] },
  })
  send({ type: 'result', subtype: 'success', result: 'the answer' })

  // Mutation: drop the stream boundary's catch -> the transport reads the
  // throw as the process failing, and the session ends `failed`.
  await vi.waitUntil(() => service.getById(session.id)?.status !== 'running')
  expect(service.getById(session.id)?.status).toBe('completed')
  expect(failures).toHaveLength(1)
  expect(children).toHaveLength(1)
  const notes = service
    .getConversation(session.id)
    .filter(
      (item) =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )
  expect(notes).toHaveLength(1)
  errors.mockRestore()
})

it('MAR-3023 I: a skill that cannot be resolved, with its user message refused, fails the turn without claiming the message was sent', async () => {
  const { ClaudeCodeSkillsService } =
    await import('../skills/claude-code-skills.service')
  const catalog = vi
    .spyOn(ClaudeCodeSkillsService.prototype, 'list')
    .mockRejectedValue(new Error('Skill catalog unavailable'))
  try {
    const { service, session, children } = await fixture()
    await service.start(session.id, { text: 'first' })
    await vi.waitUntil(() => children[0]?.lines.length === 1)
    const send = (event: unknown) =>
      children[0].stdout.write(JSON.stringify(event) + '\n')
    send({ type: 'system', subtype: 'init', session_id: 'resident' })
    send({ type: 'result', subtype: 'success', result: 'first answer' })
    await vi.waitUntil(
      () => service.getById(session.id)?.status === 'completed',
    )

    const failures: import('./session.types').AcceptedRecordingFailureEvent[] =
      []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDatabase().exec(`CREATE TEMP TRIGGER refuse_user_message
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'message'
           AND json_extract(NEW.payload_json, '$.actor') = 'user'
      BEGIN SELECT RAISE(ABORT, 'fixture user message refused'); END`)

    await service.sendMessage(session.id, {
      text: 'use a skill that is gone',
      skillSelections: [
        {
          id: 'skill-gone',
          providerId: 'claude-code',
          providerName: 'Claude Code',
          name: 'skill-gone',
          displayName: 'Skill gone',
          path: '/fixture/SKILL.md',
          scope: 'project',
          rawScope: null,
          sourceLabel: 'fixture',
          status: 'selected',
        },
      ],
    })

    await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
    // The prompt never reached the process...
    expect(children[0].lines).toHaveLength(1)
    // ...so nothing says it was sent. Mutation: announce the lost user
    // message whatever the skill resolution -> a fact and a note, red.
    expect(failures).toEqual([])
    expect(
      service
        .getConversation(session.id)
        .filter(
          (item) =>
            item.kind === 'note' &&
            item.providerMeta.providerEventType === 'recording-failed',
        ),
    ).toEqual([])
    errors.mockRestore()
  } finally {
    catalog.mockRestore()
  }
})

it('MAR-3023 J: harness evidence for a turn whose user message was refused is attributed to that turn', async () => {
  const { service, session, children, db } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  const send = (event: unknown) =>
    children[0].stdout.write(JSON.stringify(event) + '\n')
  send({ type: 'system', subtype: 'init', session_id: 'resident' })
  send({ type: 'result', subtype: 'success', result: 'first answer' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')

  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  db.exec(`CREATE TEMP TRIGGER refuse_user_message
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'message'
         AND json_extract(NEW.payload_json, '$.actor') = 'user'
    BEGIN SELECT RAISE(ABORT, 'fixture user message refused'); END`)
  await service.sendMessage(session.id, { text: 'second' })
  await vi.waitUntil(() => failures.length === 1)
  const turnId = failures[0]!.turnId
  expect(turnId).toBeTypeOf('string')

  send({ type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3 })
  await vi.waitUntil(
    () =>
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM session_harness_events WHERE session_id = ? AND subtype = 'attempt'",
          )
          .get(session.id) as { n: number }
      ).n > 0 ||
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM session_harness_events WHERE session_id = ? AND type = 'harness.retry'",
          )
          .get(session.id) as { n: number }
      ).n > 0,
  )
  const payload = JSON.parse(
    (
      db
        .prepare(
          "SELECT payload_json FROM session_harness_events WHERE session_id = ? AND type = 'harness.retry' ORDER BY sequence DESC LIMIT 1",
        )
        .get(session.id) as { payload_json: string }
    ).payload_json,
  ) as { turnId: string | null }
  // Mutation: set the active turn only after the write -> the previous turn's
  // id (or null), red.
  expect(payload.turnId).toBe(turnId)
  errors.mockRestore()
})

const recordingFailedNotesOf = (service: SessionService, sessionId: string) =>
  service
    .getConversation(sessionId)
    .filter(
      (item) =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === 'recording-failed',
    )

async function settledResident() {
  const env = await fixture()
  const { service, session, children } = env
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'resident',
    }) + '\n',
  )
  children[0].stdout.write(
    JSON.stringify({ type: 'result', subtype: 'success', result: 'first' }) +
      '\n',
  )
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  return env
}

it.each([
  ['quit', 'stopped by quit', 'the quit note'],
  ['stop', 'terminated by user', 'the stop note'],
] as const)(
  'MAR-3023 lap 5, A: a refused %s note never blocks the kill — the process is closed and the refusal logged, no fact, no note',
  async (reason, noteText, label) => {
    const { service, session, children } = await settledResident()
    const failures: import('./session.types').AcceptedRecordingFailureEvent[] =
      []
    service.onAcceptedRecordingFailure((event) => failures.push(event))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    getDatabase().exec(`CREATE TEMP TRIGGER refuse_teardown_note
      BEFORE INSERT ON session_conversation_items
      WHEN NEW.kind = 'note'
           AND json_extract(NEW.payload_json, '$.text') = '${noteText}'
      BEGIN SELECT RAISE(ABORT, 'fixture teardown note refused'); END`)
    const handle = (
      service as unknown as {
        activeHandles: Map<
          string,
          { dispose: (reason: 'quit') => unknown; stop: () => void }
        >
      }
    ).activeHandles.get(session.id)!

    // Mutation: write the note before the close -> the refusal throws past
    // `child.close()`: this throws, and the process stays open.
    expect(() =>
      reason === 'quit' ? handle.dispose('quit') : handle.stop(),
    ).not.toThrow()
    await vi.waitUntil(() => children[0].stdin.writableEnded)
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes(`Could not record ${label}`),
      ),
    ).toBe(true)
    expect(failures).toEqual([])
    expect(recordingFailedNotesOf(service, session.id)).toEqual([])
    getDatabase().exec('DROP TRIGGER refuse_teardown_note')
    errors.mockRestore()
  },
)

it('MAR-3023 lap 5, A: Stop on a settled session with a refused stop note releases the handle and leaves no unhandled rejection', async () => {
  const { service, session, children } = await settledResident()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_stop_note
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'note'
         AND json_extract(NEW.payload_json, '$.text') = 'terminated by user'
    BEGIN SELECT RAISE(ABORT, 'fixture stop note refused'); END`)
  const handles = (
    service as unknown as { activeHandles: Map<string, unknown> }
  ).activeHandles

  service.stop(session.id)

  // Mutation: let the stop fallback go uncaught with the note written before
  // the close -> an unhandled rejection fails this file, and the handle stays.
  await vi.waitUntil(() => !handles.has(session.id))
  expect(children[0].stdin.writableEnded).toBe(true)
  getDatabase().exec('DROP TRIGGER refuse_stop_note')
  errors.mockRestore()
})

it('MAR-3023 lap 5, B: a turn that ends because its process died is no longer accepted — a refused exit report is logged, no fact, no note', async () => {
  const { service, session, children } = await fixture()
  await service.start(session.id, { text: 'first' })
  await vi.waitUntil(() => children[0]?.lines.length === 1)
  children[0].stdout.write(
    JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'resident',
    }) + '\n',
  )
  children[0].stdout.write(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'working' }] },
    }) + '\n',
  )
  const failures: import('./session.types').AcceptedRecordingFailureEvent[] = []
  service.onAcceptedRecordingFailure((event) => failures.push(event))
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  getDatabase().exec(`CREATE TEMP TRIGGER refuse_exit_report
    BEFORE INSERT ON session_conversation_items
    WHEN NEW.kind = 'note'
         AND json_extract(NEW.payload_json, '$.text') LIKE 'Claude Code ended mid-turn%'
    BEGIN SELECT RAISE(ABORT, 'fixture exit report refused'); END`)

  Object.assign(children[0], { exitCode: 1 })
  children[0].emit('exit', 1, null)
  children[0].stdout.end()

  await vi.waitUntil(() => service.getById(session.id)?.status === 'failed')
  // Mutation: keep the dead turn accepted through its exit report -> the
  // emitter announces the refusal as that turn's loss: a fact, red.
  expect(failures).toEqual([])
  expect(recordingFailedNotesOf(service, session.id)).toEqual([])
  // Logged instead, never thrown out of the exit handler.
  expect(
    errors.mock.calls.some((call) =>
      String(call[0]).includes('Could not record the mid-turn exit report'),
    ),
  ).toBe(true)
  getDatabase().exec('DROP TRIGGER refuse_exit_report')
  errors.mockRestore()
})
