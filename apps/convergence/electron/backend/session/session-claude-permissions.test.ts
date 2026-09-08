import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, expect, it, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { SessionService } from './session.service'
import { ClaudeCodeProvider } from '../provider/claude-code/claude-code-provider'
import type { SessionPermissionConfig } from '../provider/provider.types'
import type {
  CanUseTool,
  Options,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: queryMock }))
let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
  queryMock.mockReset()
  closeDatabase()
  resetDatabase()
})

async function fixture(
  idleMinutes = 0,
  permissionConfig: SessionPermissionConfig = { preset: 'ask' },
  initialize = true,
) {
  const connections: Array<ReturnType<typeof connection>> = []
  function connection({
    options,
    prompt,
  }: {
    options: Options
    prompt: AsyncIterable<SDKUserMessage>
  }) {
    let ended = false,
      wake: (() => void) | undefined
    const events: SDKMessage[] = []
    const writes: SDKUserMessage[] = []
    void (async () => {
      for await (const message of prompt) writes.push(message)
    })()
    const c = {
      options,
      writes,
      closed: false,
      interrupt: vi.fn(async () => ({ still_queued: [] })),
      setModel: vi.fn(async () => {}),
      applyFlagSettings: vi.fn(async () => {}),
      setPermissionMode: vi.fn(async () => {}),
      close: vi.fn(() => {
        c.closed = true
        ended = true
        wake?.()
      }),
      push(event: unknown) {
        events.push(event as SDKMessage)
        wake?.()
      },
      async *[Symbol.asyncIterator]() {
        while (!ended) {
          const event = events.shift()
          if (event) yield event
          else
            await new Promise<void>((r) => {
              wake = r
            })
        }
      },
    }
    return c
  }
  queryMock.mockImplementation((input) => {
    const c = connection(input)
    connections.push(c)
    return c
  })
  const dir = mkdtempSync(join(tmpdir(), 'permission-'))
  const db = getDatabase()
  const registry = new ProviderRegistry()
  registry.register(
    new ClaudeCodeProvider(
      '/fixture/claude',
      null,
      undefined,
      '2.1.265',
      undefined,
      undefined,
      true,
      () => idleMinutes,
    ),
  )
  const service = new SessionService(db, new LocalExecutionHost(registry), dir)
  db.prepare(
    "INSERT INTO projects(id,name,repository_path) VALUES ('p','fixture',?)",
  ).run(dir)
  const session = service.create({
    projectId: 'p',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'permissions',
    permissionConfig,
  })
  cleanup = async () => {
    await service.disposeAll()
    rmSync(dir, { recursive: true, force: true })
  }
  if (!initialize)
    db.prepare('UPDATE sessions SET continuation_token=? WHERE id=?').run(
      'harness',
      session.id,
    )
  await service.start(session.id, { text: 'write fixture' })
  await vi.waitUntil(() => connections[0]?.writes.length === 1)
  if (initialize)
    connections[0].push({
      type: 'system',
      subtype: 'init',
      session_id: 'harness',
      capabilities: ['interrupt_receipt_v1'],
    })
  await new Promise((r) => setTimeout(r, 0))
  return { service, session, connections, db }
}
function request(
  c: { options: Options },
  id = 'tool',
  extra: Record<string, unknown> = {},
) {
  return c.options.canUseTool?.('Bash', { command: 'fixture command' }, {
    signal: new AbortController().signal,
    toolUseID: id,
    requestId: 'request-' + id,
    title: 'Claude wants to write the fixture',
    displayName: 'Bash',
    blockedPath: '/fixture/marker',
    decisionReason: 'needs permission',
    ...extra,
  } as Parameters<CanUseTool>[2])
}

it('R1 Ask records the attributed permission and approve returns its id — omit canUseTool or toolUseID turns red', async () => {
  const { service, session, connections } = await fixture()
  const pending = request(connections[0])
  await new Promise((r) => setTimeout(r, 0))
  const card = service
    .getConversation(session.id)
    .find((i) => i.kind === 'approval-request')
  const attention = service.getById(session.id)?.attention
  service.approve(session.id, 'tool')
  const response = await pending
  expect({
    mode: connections[0].options.permissionMode,
    description: card?.kind === 'approval-request' ? card.description : null,
    providerId: card?.providerMeta.providerItemId,
    attention,
    resolution: card?.kind === 'approval-request' ? card.resolution : null,
    response,
    status: service.getById(session.id)?.status,
  }).toEqual({
    mode: 'default',
    description: 'Claude wants to write the fixture',
    providerId: 'tool',
    attention: 'needs-approval',
    resolution: 'pending',
    response: {
      behavior: 'allow',
      toolUseID: 'tool',
      decisionClassification: 'user_temporary',
    },
    status: 'running',
  })
})

it('R1 deny continues the turn — ignore deny or set interrupt true turns red', async () => {
  const { service, session, connections } = await fixture()
  const pending = request(connections[0])
  service.deny(session.id, 'tool')
  const response = await Promise.race([
    pending,
    new Promise((r) => setTimeout(r, 50)),
  ])
  connections[0].push({
    type: 'result',
    subtype: 'success',
    result: 'Denied; continuing honestly',
  })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  expect({
    response,
    status: service.getById(session.id)?.status,
    closed: connections[0].closed,
  }).toEqual({
    response: {
      behavior: 'deny',
      message: 'Denied in Convergence',
      toolUseID: 'tool',
      decisionClassification: 'user_reject',
    },
    status: 'completed',
    closed: false,
  })
})

it('R7 the card belongs to the harness agent and retains its extra facts — drop agentID or details turns red', async () => {
  const { service, session, connections } = await fixture()
  connections[0].push({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'spawn',
          name: 'Agent',
          input: { description: 'Inspect fixture', subagent_type: 'Explore' },
        },
      ],
    },
  })
  connections[0].push({
    type: 'system',
    subtype: 'task_started',
    task_type: 'local_agent',
    task_id: 'child',
    tool_use_id: 'spawn',
    description: 'Inspect fixture',
  })
  await new Promise((r) => setTimeout(r, 0))
  const pending = request(connections[0], 'tool', { agentID: 'child' })
  const card = service
    .getConversation(session.id)
    .find((i) => i.kind === 'approval-request')
  service.approve(session.id, 'tool')
  await pending
  expect({
    agent: card?.agentRunId,
    label: card?.agentAttribution,
    details:
      card?.kind === 'approval-request'
        ? (card as typeof card & { permissionDetails?: unknown })
            .permissionDetails
        : null,
  }).toEqual({
    agent: 'child',
    label: { description: 'Inspect fixture', agentType: 'Explore' },
    details: {
      blockedPath: '/fixture/marker',
      decisionReason: 'needs permission',
    },
  })
})

it('R2 session approval is a plain allow — drop scope forwarding or send updatedPermissions turns red', async () => {
  const { service, session, connections } = await fixture()
  const pending = request(connections[0], 'tool', {
    suggestions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'fixture command' }],
        behavior: 'allow',
        destination: 'session',
      },
    ],
  })
  service.approve(session.id, 'tool', { scope: 'session' })
  expect(await pending).toEqual({
    behavior: 'allow',
    toolUseID: 'tool',
    decisionClassification: 'user_permanent',
  })
})

it('R2 only the harness exact suggestion repeats — disable memory or match raw command instead turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const suggestions = [
    {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'canonical fixture' }],
      behavior: 'allow',
      destination: 'localSettings',
    },
    {
      type: 'addDirectories',
      directories: ['/fixture'],
      destination: 'session',
    },
  ]
  const first = request(c, 'one', { suggestions })
  service.approve(session.id, 'one', { scope: 'session' })
  await first
  const repeat = request(c, 'two', { suggestions })
  const response = await Promise.race([
    repeat,
    new Promise((r) => setTimeout(r, 25)),
  ])
  const different = request(c, 'three', {
    suggestions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'different text' }],
        behavior: 'allow',
        destination: 'session',
      },
    ],
  })
  const directory = request(c, 'four', {
    suggestions: [
      {
        type: 'addDirectories',
        directories: ['/fixture'],
        destination: 'session',
      },
    ],
  })
  const items = service.getConversation(session.id)
  service.deny(session.id, 'two')
  service.deny(session.id, 'three')
  service.deny(session.id, 'four')
  await Promise.all([repeat, different, directory])
  expect({
    response,
    cards: items
      .filter((i) => i.kind === 'approval-request')
      .map((i) => i.providerMeta.providerItemId),
    notes: items
      .filter((i) => i.kind === 'note')
      .map((i) => (i.kind === 'note' ? i.text : ''))
      .filter((t) => t.includes('session rule')),
  }).toEqual({
    response: {
      behavior: 'allow',
      toolUseID: 'two',
      decisionClassification: 'user_permanent',
    },
    cards: ['one', 'three', 'four'],
    notes: ['↳ allowed by your session rule: Bash'],
  })
})

it('R2 the card advertises session scope only with suggestions — omit or unconditionally advertise session scope turns red', async () => {
  const { service, session, connections } = await fixture()
  const plain = request(connections[0], 'plain')
  const suggested = request(connections[0], 'suggested', {
    suggestions: [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'fixture' }],
        behavior: 'allow',
      },
    ],
  })
  const cards = service
    .getConversation(session.id)
    .filter((i) => i.kind === 'approval-request')
  service.deny(session.id, 'plain')
  service.deny(session.id, 'suggested')
  await Promise.all([plain, suggested])
  expect(
    cards.map((i) =>
      i.kind === 'approval-request' ? i.supportsSessionApproval : null,
    ),
  ).toEqual([false, true])
})

it('R4 question answer stays in place — retain the deferred respawn or omit updatedInput.answers turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const input = {
    questions: [
      {
        question: 'Which color?',
        header: 'Color',
        options: [{ label: 'Blue' }, { label: 'Red' }],
        multiSelect: false,
      },
    ],
  }
  const pending = c.options.canUseTool?.('AskUserQuestion', input, {
    signal: new AbortController().signal,
    toolUseID: 'question',
    requestId: 'q',
  } as Parameters<CanUseTool>[2])
  const card = service
    .getConversation(session.id)
    .find((i) => i.kind === 'input-request')
  if (card)
    await service.sendMessage(session.id, {
      text: 'Blue',
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'choice',
        answers: [{ questionId: 'Which color?', values: ['Blue'] }],
      },
    })
  const response = await Promise.race([
    pending,
    new Promise((r) => setTimeout(r, 25)),
  ])
  service.deny(session.id, 'question')
  expect({
    kind: card?.kind,
    response,
    processes: connections.length,
    writes: c.writes.length,
    settings: c.options.extraArgs?.settings,
    responseId:
      card?.kind === 'input-request' ? card.responseProviderItemId : null,
  }).toEqual({
    kind: 'input-request',
    response: {
      behavior: 'allow',
      toolUseID: 'question',
      decisionClassification: 'user_temporary',
      updatedInput: { ...input, answers: { 'Which color?': 'Blue' } },
    },
    processes: 1,
    writes: 1,
    settings: undefined,
    responseId: 'question',
  })
})

it.each(['approve', 'reject'] as const)(
  'R4 plan %s answers in place — omit session setMode or allow a rejected plan turns red',
  async (decision) => {
    const { service, session, connections } = await fixture()
    const c = connections[0]
    const pending = c.options.canUseTool?.(
      'ExitPlanMode',
      { plan: 'Write fixture', planFilePath: '/fixture/plan' },
      {
        signal: new AbortController().signal,
        toolUseID: 'plan',
        requestId: 'p',
      } as Parameters<CanUseTool>[2],
    )
    const card = service
      .getConversation(session.id)
      .find((i) => i.kind === 'input-request')
    if (card)
      await service.sendMessage(session.id, {
        text: 'Plan decision',
        deliveryMode: 'answer',
        interactionResponse: {
          kind: 'plan',
          decision,
          message: 'Revise the plan',
        },
      })
    const response = await Promise.race([
      pending,
      new Promise((r) => setTimeout(r, 25)),
    ])
    service.deny(session.id, 'plan')
    expect({
      kind: card?.kind,
      response,
      processes: connections.length,
      writes: c.writes.length,
    }).toEqual({
      kind: 'input-request',
      response:
        decision === 'approve'
          ? {
              behavior: 'allow',
              toolUseID: 'plan',
              decisionClassification: 'user_temporary',
              updatedPermissions: [
                {
                  type: 'setMode',
                  mode: 'acceptEdits',
                  destination: 'session',
                },
              ],
            }
          : {
              behavior: 'deny',
              toolUseID: 'plan',
              decisionClassification: 'user_reject',
              message: 'Revise the plan',
            },
      processes: 1,
      writes: 1,
    })
  },
)

it('R6 quit denies before SDK close and resolves the card — close first or keep a pending card turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const tape: string[] = []
  const originalClose = c.close.getMockImplementation()!
  c.close.mockImplementation(() => {
    tape.push('close')
    originalClose()
  })
  let response: unknown
  const pending = request(c)?.then((value) => {
    response = value
    tape.push('denied')
  })
  await service.disposeAllForQuit()
  await Promise.race([pending, new Promise((r) => setTimeout(r, 25))])
  const items = service.getConversation(session.id)
  const card = items.find((i) => i.kind === 'approval-request')
  expect({
    tape,
    response,
    resolution: card?.kind === 'approval-request' ? card.resolution : null,
    notes: items
      .filter((i) => i.kind === 'note')
      .map((i) => (i.kind === 'note' ? i.text : ''))
      .filter((t) => t.includes('Pending approval')),
  }).toEqual({
    tape: ['denied', 'close'],
    response: {
      behavior: 'deny',
      toolUseID: 'tool',
      decisionClassification: 'user_reject',
      message: 'connection ended',
    },
    resolution: 'denied',
    notes: ['Pending approval cancelled: connection ended'],
  })
})

it('R5 Stop denies then interrupts and a second Stop terminates — omit denial or repeat interrupt turns red', async () => {
  const { service, session, connections, db } = await fixture()
  const c = connections[0]
  const tape: string[] = []
  c.push({
    type: 'system',
    subtype: 'task_started',
    task_id: 'background',
    task_type: 'local_bash',
    description: 'Fixture task',
  })
  await new Promise((r) => setTimeout(r, 0))
  let finishInterrupt: () => void = () => {}
  c.interrupt.mockImplementation(async () => {
    tape.push('interrupt')
    await new Promise<void>((r) => {
      finishInterrupt = r
    })
    return { still_queued: [] }
  })
  let response: unknown
  const pending = request(c)?.then((value) => {
    response = value
    tape.push('denied')
  })
  service.stop(session.id)
  await new Promise((r) => setTimeout(r, 5))
  service.stop(session.id)
  await new Promise((r) => setTimeout(r, 10))
  finishInterrupt()
  await Promise.race([pending, new Promise((r) => setTimeout(r, 20))])
  const items = service.getConversation(session.id)
  expect({
    tape,
    response,
    closed: c.closed,
    notes: items
      .filter((i) => i.kind === 'note')
      .map((i) => (i.kind === 'note' ? i.text : ''))
      .filter((t) => t === 'terminated by user'),
    task: db
      .prepare(
        'SELECT status,stop_reason FROM session_tasks WHERE session_id=? AND task_id=?',
      )
      .get(session.id, 'background'),
  }).toEqual({
    tape: ['denied', 'interrupt'],
    response: {
      behavior: 'deny',
      toolUseID: 'tool',
      decisionClassification: 'user_reject',
      message: 'Stopped in Convergence',
    },
    closed: true,
    notes: ['terminated by user'],
    task: { status: 'stopped', stop_reason: 'stop' },
  })
})

it('R2 idle connection end forgets its rules — retain sessionAllowRules on end turns red', async () => {
  const { service, session, connections } = await fixture(30 / 60000)
  const suggestions = [
    {
      type: 'addRules',
      behavior: 'allow',
      rules: [{ toolName: 'Bash', ruleContent: 'fixture' }],
      destination: 'session',
    },
  ]
  const first = request(connections[0], 'first', { suggestions })
  service.approve(session.id, 'first', { scope: 'session' })
  await first
  connections[0].push({ type: 'result', subtype: 'success', result: 'done' })
  await vi.waitUntil(() => connections[0].closed)
  await service.sendMessage(session.id, { text: 'again' })
  await vi.waitUntil(() => connections[1]?.writes.length === 1)
  const second = request(connections[1], 'second', { suggestions })
  const items = service.getConversation(session.id)
  service.deny(session.id, 'second')
  await second
  expect({
    cards: items
      .filter((i) => i.kind === 'approval-request')
      .map((i) => i.providerMeta.providerItemId),
    notes: items
      .filter((i) => i.kind === 'note')
      .map((i) => (i.kind === 'note' ? i.text : ''))
      .filter((t) => t === 'session rule cleared: connection ended'),
  }).toEqual({
    cards: ['first', 'second'],
    notes: ['session rule cleared: connection ended'],
  })
})

it.each(['before', 'after'] as const)(
  'R6 SDK abort %s the request answers deny — ignore AbortSignal turns red',
  async (when) => {
    const { service, session, connections } = await fixture()
    const controller = new AbortController()
    if (when === 'before') controller.abort()
    const pending = request(connections[0], 'cancelled', {
      signal: controller.signal,
    })
    if (when === 'after') controller.abort()
    const response = await Promise.race([
      pending,
      new Promise((r) => setTimeout(r, 25)),
    ])
    const cards = service
      .getConversation(session.id)
      .filter((i) => i.kind === 'approval-request')
    service.deny(session.id, 'cancelled')
    await pending
    expect({
      response,
      liveCards: cards.filter(
        (i) => i.kind === 'approval-request' && i.resolution === 'pending',
      ).length,
    }).toEqual({
      response: {
        behavior: 'deny',
        message: 'connection ended',
        toolUseID: 'cancelled',
        decisionClassification: 'user_reject',
      },
      liveCards: 0,
    })
  },
)

it.each([
  'bypassPermissions',
  'plan',
  'acceptEdits',
  'dontAsk',
  'auto',
] as const)(
  'R3 %s retains the callback and chosen mode — hardcode default mode turns red',
  async (mode) => {
    const { connections } = await fixture(
      0,
      mode === 'bypassPermissions'
        ? { preset: 'yolo' }
        : { preset: 'custom', claudeCode: { permissionMode: mode } },
    )
    expect({
      mode: connections[0].options.permissionMode,
      callback: typeof connections[0].options.canUseTool,
    }).toEqual({ mode, callback: 'function' })
  },
)

it('R1 mixed requests restore the remaining attention — keep the last resolved attention turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const approval = request(c, 'approval')
  const question = c.options.canUseTool?.(
    'AskUserQuestion',
    { questions: [{ question: 'Color?', options: [{ label: 'Blue' }] }] },
    {
      signal: new AbortController().signal,
      toolUseID: 'question',
      requestId: 'q',
    } as Parameters<CanUseTool>[2],
  )
  await service.sendMessage(session.id, {
    text: 'Blue',
    deliveryMode: 'answer',
    interactionResponse: {
      kind: 'choice',
      answers: [{ questionId: 'Color?', values: ['Blue'] }],
    },
  })
  await question
  const attention = service.getById(session.id)?.attention
  service.deny(session.id, 'approval')
  await approval
  expect(attention).toBe('needs-approval')
})

it('R1 the main answer cannot hide a pending background approval — overwrite attention with finished turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const pending = request(c)
  c.push({ type: 'result', subtype: 'success', result: 'main answered' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  const attention = service.getById(session.id)?.attention
  service.approve(session.id, 'tool')
  await pending
  expect(attention).toBe('needs-approval')
})

it('R4 concurrent dialogs answer the selected tool — choose the first pending dialog instead of its id turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const input = {
    questions: [{ question: 'Color?', options: [{ label: 'Blue' }] }],
  }
  let firstResponse: unknown, secondResponse: unknown
  const first = c.options
    .canUseTool?.('AskUserQuestion', input, {
      signal: new AbortController().signal,
      toolUseID: 'first',
      requestId: 'r1',
    } as Parameters<CanUseTool>[2])
    .then((v) => (firstResponse = v))
  const second = c.options
    .canUseTool?.('AskUserQuestion', input, {
      signal: new AbortController().signal,
      toolUseID: 'second',
      requestId: 'r2',
    } as Parameters<CanUseTool>[2])
    .then((v) => (secondResponse = v))
  await service.sendMessage(session.id, {
    text: 'Blue',
    deliveryMode: 'answer',
    interactionResponse: {
      kind: 'choice',
      providerItemId: 'second',
      answers: [{ questionId: 'Color?', values: ['Blue'] }],
    },
  })
  await new Promise((r) => setTimeout(r, 0))
  const observed = { first: firstResponse, second: secondResponse }
  service.deny(session.id, 'first')
  service.deny(session.id, 'second')
  await Promise.all([first, second])
  expect(observed).toEqual({
    first: undefined,
    second: {
      behavior: 'allow',
      toolUseID: 'second',
      decisionClassification: 'user_temporary',
      updatedInput: { ...input, answers: { 'Color?': 'Blue' } },
    },
  })
})

it('R6 exit between turns denies a background request — skip onExit cancellation turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  c.push({ type: 'result', subtype: 'success', result: 'done' })
  await vi.waitUntil(() => service.getById(session.id)?.status === 'completed')
  const pending = request(c, 'background')
  c.close()
  const response = await Promise.race([
    pending,
    new Promise((r) => setTimeout(r, 25)),
  ])
  const card = service
    .getConversation(session.id)
    .find((i) => i.kind === 'approval-request')
  expect({
    response,
    resolution: card?.kind === 'approval-request' ? card.resolution : null,
  }).toEqual({
    response: {
      behavior: 'deny',
      toolUseID: 'background',
      decisionClassification: 'user_reject',
      message: 'connection ended',
    },
    resolution: 'denied',
  })
})

it('R4 a plain text answer is not plan approval — accept a plan without its explicit decision turns red', async () => {
  const { service, session, connections } = await fixture()
  const c = connections[0]
  const pending = c.options.canUseTool?.(
    'ExitPlanMode',
    { plan: 'Write fixture' },
    {
      signal: new AbortController().signal,
      toolUseID: 'plan',
      requestId: 'p',
    } as Parameters<CanUseTool>[2],
  )
  await service.sendMessage(session.id, {
    text: 'Please revise this',
    deliveryMode: 'answer',
  })
  expect(await pending).toEqual({
    behavior: 'deny',
    toolUseID: 'plan',
    decisionClassification: 'user_reject',
    message: 'Please revise this',
  })
})

it('R1 permission before init proves acceptance — omit harness-output receipt and resend after exit turns red', async () => {
  const { service, session, connections } = await fixture(
    0,
    { preset: 'ask' },
    false,
  )
  const pending = request(connections[0])
  service.approve(session.id, 'tool')
  await pending
  connections[0].close()
  await new Promise((r) => setTimeout(r, 60))
  expect({
    processes: connections.length,
    writes: connections.reduce((n, c) => n + c.writes.length, 0),
    status: service.getById(session.id)?.status,
  }).toEqual({ processes: 1, writes: 1, status: 'failed' })
})
