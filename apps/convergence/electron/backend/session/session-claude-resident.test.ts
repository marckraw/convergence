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
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
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
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
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
