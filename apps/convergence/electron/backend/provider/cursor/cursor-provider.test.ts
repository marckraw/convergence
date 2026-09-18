import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import { buildSkillCatalogId } from '../../skills/skill-catalog.pure'
import type {
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillSelection,
} from '../../skills/skills.types'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CursorProvider } from './cursor-provider'

function waitFor(
  assertion: () => void,
  timeoutMs = 300,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

function startProvider(
  config?: Partial<Parameters<CursorProvider['start']>[0]>,
  options?: {
    skillsCatalog?: ProviderSkillCatalog
    debugSink?: ProviderDebugSink
    holdPrompt?: boolean
    requestTimeoutMs?: number
  },
) {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {
    holdPrompt: options?.holdPrompt,
  })
  const provider = options?.skillsCatalog
    ? new CursorProvider(
        'agent',
        options.debugSink ?? noopDebugSink,
        {
          list: vi.fn(
            async () => options.skillsCatalog as ProviderSkillCatalog,
          ),
        },
        {
          requestTimeoutMs: options.requestTimeoutMs,
        },
      )
    : new CursorProvider(
        'agent',
        options?.debugSink ?? noopDebugSink,
        undefined,
        {
          requestTimeoutMs: options?.requestTimeoutMs,
        },
      )
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
    ...config,
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  const attentions: string[] = []
  const continuationTokens: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange((status) => statuses.push(status))
  handle.onAttentionChange((attention) => attentions.push(attention))
  handle.onContinuationToken((token) => continuationTokens.push(token))
  return {
    child,
    server,
    handle,
    deltas,
    statuses,
    attentions,
    continuationTokens,
  }
}

function cursorSkill(name = 'review'): SkillCatalogEntry {
  const input = {
    providerId: 'cursor' as const,
    name,
    path: null,
    scope: 'system' as const,
    rawScope: 'command',
  }

  return {
    id: buildSkillCatalogId(input),
    providerId: 'cursor',
    providerName: 'Cursor',
    name,
    path: input.path,
    scope: input.scope,
    rawScope: input.rawScope,
    displayName: name,
    description: 'Review current changes.',
    shortDescription: 'Review current changes.',
    sourceLabel: 'Cursor command',
    enabled: true,
    dependencies: [],
    warnings: [],
  }
}

function cursorCatalog(skills: SkillCatalogEntry[]): ProviderSkillCatalog {
  return {
    providerId: 'cursor',
    providerName: 'Cursor',
    catalogSource: 'native-rpc',
    invocationSupport: 'native-command',
    activationConfirmation: 'none',
    skills,
    error: null,
  }
}

function selection(entry: SkillCatalogEntry): SkillSelection {
  return {
    id: entry.id,
    providerId: entry.providerId,
    providerName: entry.providerName,
    name: entry.name,
    displayName: entry.displayName,
    path: entry.path,
    scope: entry.scope,
    rawScope: entry.rawScope,
    sourceLabel: entry.sourceLabel,
    status: 'selected',
    argumentText: 'current branch',
  }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('CursorProvider', () => {
  it('compresses a loaded session only when ACP advertises /compress', async () => {
    const child = new MockCursorAcpChild()
    spawnMock.mockReturnValue(child)
    const server = createMockCursorAcp(child, {
      availableCommands: ['/compress'],
    })
    const provider = new CursorProvider('agent', noopDebugSink, undefined, {
      requestTimeoutMs: 1_000,
    })

    const result = await provider.manageContext?.(
      {
        sessionId: 'session-1',
        workingDirectory: '/repo',
        initialMessage: '',
        model: null,
        effort: null,
        continuationToken: 'cursor-session-1',
      },
      { kind: 'compact' },
    )

    expect(server.requests.map((request) => request.method)).toEqual([
      'initialize',
      'authenticate',
      'session/load',
      'session/prompt',
    ])
    expect(server.requests.at(-1)?.params).toMatchObject({
      sessionId: 'cursor-session-1',
      prompt: [{ type: 'text', text: '/compress' }],
    })
    expect(result?.contextWindow.availability).toBe('unavailable')
  })

  it('runs one-shot prompts through Cursor ACP and terminates the process', async () => {
    const child = new MockCursorAcpChild()
    spawnMock.mockReturnValue(child)
    const server = createMockCursorAcp(child)
    const provider = new CursorProvider('agent')

    const result = await provider.oneShot({
      prompt: 'name this session',
      modelId: 'composer-2.5[context=300k,fast=true]',
      workingDirectory: '/repo',
    })

    expect(result).toEqual({ text: 'hello world' })
    expect(spawnMock).toHaveBeenCalledWith(
      'agent',
      ['acp'],
      expect.objectContaining({
        cwd: '/repo',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    )
    expect(server.requests.map((request) => request.method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/set_config_option',
      'session/prompt',
    ])
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('starts a Cursor ACP session and streams assistant chunks', async () => {
    const { deltas, statuses, attentions, continuationTokens, server } =
      startProvider()

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })

    expect(continuationTokens).toEqual(['cursor-session-1'])
    expect(server.requests.map((request) => request.method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/prompt',
    ])
    const assistantPatch = deltas
      .filter((delta) => delta.kind === 'conversation.item.patch')
      .at(-1)
    expect(assistantPatch).toMatchObject({
      kind: 'conversation.item.patch',
      patch: {
        text: 'hello world',
        state: 'complete',
      },
    })
  })

  it('does not fail long-running prompts while Cursor continues streaming', async () => {
    const { deltas, server, statuses, attentions } = startProvider(undefined, {
      holdPrompt: true,
      requestTimeoutMs: 25,
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'still ' },
        },
      },
    })
    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'working' },
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(statuses).not.toContain('failed')
    expect(attentions).not.toContain('failed')
    expect(statuses.at(-1)).toBe('running')

    server.resolveHeldPrompt({ stopReason: 'end_turn' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
    expect(JSON.stringify(deltas)).toContain('still working')
  })

  it('applies selected model config to the active Cursor ACP session', async () => {
    const { deltas, server } = startProvider({
      model: 'composer-2.5[context=300k,fast=true]',
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/set_config_option',
      )
    })
    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    expect(server.requests.map((request) => request.method)).toEqual([
      'initialize',
      'authenticate',
      'session/new',
      'session/set_config_option',
      'session/prompt',
    ])
    expect(
      server.requests.find(
        (request) => request.method === 'session/set_config_option',
      )?.params,
    ).toEqual({
      sessionId: 'cursor-session-1',
      configId: 'model',
      value: 'composer-2.5[context=300k,fast=true]',
    })
    expect(
      deltas.find(
        (delta) => delta.kind === 'session.patch' && delta.patch.contextWindow,
      ),
    ).toMatchObject({
      kind: 'session.patch',
      patch: {
        contextWindow: {
          availability: 'unavailable',
          source: 'estimated',
          reason:
            'Cursor ACP reports a 300,000 token context tier for the selected model, but does not expose per-turn token usage to Convergence.',
        },
      },
    })
  })

  it('suppresses replayed session/load updates for continuation sessions', async () => {
    const { deltas, server } = startProvider({
      continuationToken: 'existing-session',
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/load',
      )
    })
    await waitFor(() => {
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(1)
    })

    const renderedText = JSON.stringify(deltas)
    expect(renderedText).not.toContain('old transcript')
    expect(renderedText).toContain('hello world')
  })

  it('routes Cursor permission requests through approval responses', async () => {
    const { server, deltas, attentions, handle } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 77,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: {
          toolCallId: 'tool-1',
          title: 'Run tests',
          kind: 'execute',
          rawInput: { command: 'npm test' },
        },
        options: [
          { optionId: 'allow-once', name: 'Allow once' },
          { optionId: 'reject-once', name: 'Reject' },
        ],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
      expect(JSON.stringify(deltas)).toContain('Run tests')
    })

    handle.approve('77')

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 77,
        result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
      })
    })
  })

  it('routes Cursor permission denials through reject responses', async () => {
    const { server, attentions, handle } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 78,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: {
          toolCallId: 'tool-2',
          title: 'Write file',
          kind: 'edit',
          rawInput: { path: 'README.md' },
        },
        options: [
          { optionId: 'allow-once', name: 'Allow once' },
          { optionId: 'reject-once', name: 'Reject' },
        ],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
    })

    handle.deny('78')

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 78,
        result: { outcome: { outcome: 'selected', optionId: 'reject-once' } },
      })
      expect(attentions.at(-1)).toBe('none')
    })
  })

  it('keeps repeated Cursor approval requests independent', async () => {
    const { server, attentions, handle } = startProvider(undefined, {
      holdPrompt: true,
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    for (const id of [201, 202]) {
      server.send({
        jsonrpc: '2.0',
        id,
        method: 'session/request_permission',
        params: {
          sessionId: 'cursor-session-1',
          toolCall: { title: `Tool ${id}`, kind: 'execute' },
          options: [{ optionId: 'allow-once', name: 'Allow once' }],
        },
      })
    }

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
    })

    handle.approve('201')

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 201,
        result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
      })
      expect(attentions.at(-1)).toBe('needs-approval')
    })

    handle.approve('202')

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 202,
        result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
      })
      expect(attentions.at(-1)).toBe('none')
    })
  })

  it('auto-approves permission requests for yolo sessions', async () => {
    const { server } = startProvider({
      permissionConfig: { preset: 'yolo' },
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 88,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Edit file', kind: 'edit' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 88,
        result: { outcome: { outcome: 'selected', optionId: 'allow-once' } },
      })
    })
  })

  it('routes Cursor ask-question requests through shared input answers', async () => {
    const { server, deltas, attentions, handle } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })
    const promptRequestCount = server.requests.filter(
      (request) => request.method === 'session/prompt',
    ).length

    server.send({
      jsonrpc: '2.0',
      id: 90,
      method: 'cursor/ask_question',
      params: {
        toolCallId: 'call-ask',
        title: 'Need input',
        questions: [
          {
            id: 'mode',
            prompt: 'Which mode should I use?',
            options: [
              { id: 'agent', label: 'Agent' },
              { id: 'plan', label: 'Plan' },
            ],
          },
        ],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-input')
      expect(JSON.stringify(deltas)).toContain('Which mode should I use?')
    })

    handle.sendMessage('Plan', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'choice',
        answers: [{ questionId: 'mode', values: ['Plan'] }],
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 90,
        result: {
          outcome: {
            outcome: 'answered',
            answers: [
              {
                questionId: 'mode',
                selectedOptionIds: ['plan'],
              },
            ],
          },
        },
      })
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(promptRequestCount)
    })
  })

  it('routes Cursor create-plan requests through shared plan decisions', async () => {
    const { server, deltas, attentions, handle } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 91,
      method: 'cursor/create_plan',
      params: {
        toolCallId: 'call-plan',
        name: 'Refactor layout',
        overview: 'Tighten layout behavior.',
        plan: '1. Inspect layout.\n2. Update sizing.',
        todos: [
          {
            id: 'todo-1',
            content: 'Inspect layout',
            status: 'completed',
          },
        ],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-input')
      expect(JSON.stringify(deltas)).toContain('Refactor layout')
      expect(JSON.stringify(deltas)).toContain('Inspect layout')
    })

    handle.sendMessage('', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'plan',
        decision: 'approve',
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 91,
        result: {
          outcome: {
            outcome: 'accepted',
          },
        },
      })
    })
  })

  it('sends selected Cursor commands as ACP slash command prompt text', async () => {
    const entry = cursorSkill('review')
    const { server, deltas } = startProvider(
      {
        initialSkillSelections: [selection(entry)],
      },
      {
        skillsCatalog: cursorCatalog([entry]),
      },
    )

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    const promptRequest = server.requests.find(
      (request) => request.method === 'session/prompt',
    )
    expect(promptRequest?.params?.prompt).toEqual([
      {
        type: 'text',
        text: '/review current branch\n\nhi',
      },
    ])

    await waitFor(() => {
      expect(JSON.stringify(deltas)).toContain('"status":"sent"')
    })
  })

  it('marks stale selected Cursor commands unavailable without sending a prompt', async () => {
    const entry = cursorSkill('review')
    const { server, deltas, statuses } = startProvider(
      {
        initialSkillSelections: [selection(entry)],
      },
      {
        skillsCatalog: cursorCatalog([]),
      },
    )

    await waitFor(() => {
      expect(statuses).toContain('failed')
      expect(JSON.stringify(deltas)).toContain('no longer available')
    })

    expect(
      server.requests.filter((request) => request.method === 'session/prompt'),
    ).toHaveLength(0)
  })

  it('surfaces Cursor passive extension notifications as transcript notes', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      method: 'cursor/update_todos',
      params: {
        toolCallId: 'call-todos',
        merge: true,
        todos: [
          {
            id: 'todo-1',
            content: 'Wire Cursor interactions',
            status: 'in_progress',
          },
        ],
      },
    })
    server.send({
      jsonrpc: '2.0',
      method: 'cursor/generate_image',
      params: {
        toolCallId: 'call-image',
        description: 'App icon',
        filePath: '/tmp/icon.png',
      },
    })

    await waitFor(() => {
      const rendered = JSON.stringify(deltas)
      expect(rendered).toContain('Cursor todos updated')
      expect(rendered).toContain('Wire Cursor interactions')
      expect(rendered).toContain('cannot render it as a shared artifact yet')
      expect(rendered).toContain('cursor/generate_image')
    })
  })

  it('records summarized provider-debug entries for available command updates', async () => {
    const debugSink = { record: vi.fn() }
    const { server } = startProvider(undefined, { debugSink })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: Array.from({ length: 25 }, (_, index) => ({
            name: `cmd-${index}`,
            description: `Command ${index}`,
          })),
        },
      },
    })

    await waitFor(() => {
      expect(debugSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'cursor',
          channel: 'notification',
          method: 'available_commands_update',
          payload: expect.objectContaining({
            sessionUpdate: 'available_commands_update',
            commandCount: 25,
            truncatedCount: 5,
          }),
          note: 'Cursor available command catalog update',
        }),
      )
    })
  })

  it('redacts Cursor prompt bodies before provider-debug persistence', async () => {
    const records: Array<Parameters<ProviderDebugSink['record']>[0]> = []
    const debugSink = {
      record: vi.fn((entry) => records.push(entry)),
    }
    startProvider(
      {
        initialMessage: 'super secret prompt',
      },
      { debugSink },
    )

    await waitFor(() => {
      expect(
        records.find(
          (entry) =>
            entry.direction === 'out' && entry.method === 'session/prompt',
        ),
      ).toBeDefined()
    })

    const promptEntry = records.find(
      (entry) => entry.direction === 'out' && entry.method === 'session/prompt',
    )
    expect(JSON.stringify(promptEntry?.payload)).not.toContain(
      'super secret prompt',
    )
    expect(promptEntry?.payload).toMatchObject({
      sessionId: 'cursor-session-1',
      prompt: {
        count: 1,
        parts: [
          {
            type: 'text',
            textBytes: 19,
          },
        ],
      },
    })
  })

  it('acknowledges passive Cursor extension methods if they arrive as requests', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 92,
      method: 'cursor/update_todos',
      params: {
        toolCallId: 'call-todos',
        todos: [
          {
            id: 'todo-1',
            content: 'Represent todos',
            status: 'completed',
          },
        ],
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 92,
        result: {
          outcome: {
            outcome: 'accepted',
            todos: [
              {
                id: 'todo-1',
                content: 'Represent todos',
                status: 'completed',
              },
            ],
          },
        },
      })
      expect(JSON.stringify(deltas)).toContain('Represent todos')
    })
  })

  it('emits tool call and result items from Cursor updates', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          title: 'Read package.json',
          kind: 'read',
          status: 'pending',
          rawInput: { path: 'package.json' },
        },
      },
    })
    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
          content: [
            { type: 'content', content: { type: 'text', text: 'Done' } },
          ],
        },
      },
    })

    await waitFor(() => {
      expect(JSON.stringify(deltas)).toContain('Read package.json')
      expect(JSON.stringify(deltas)).toContain('Done')
    })
  })

  it('marks the session failed when the provider exits mid-session', async () => {
    const { child, server, statuses } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'initialize',
      )
    })

    child.emit('exit', 1, null)

    await waitFor(() => {
      expect(statuses).toContain('failed')
    })
  })

  it('marks the session failed when Cursor exits while waiting for approval', async () => {
    const { child, server, statuses, attentions } = startProvider(undefined, {
      holdPrompt: true,
    })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 103,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Run command', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
    })

    child.emit('exit', 1, null)

    await waitFor(() => {
      expect(statuses).toContain('failed')
      expect(attentions.at(-1)).toBe('failed')
    })
  })

  it('keeps failed follow-up attempts visible after Cursor disconnects', async () => {
    const { child, server, handle, deltas, statuses, attentions } =
      startProvider(undefined, {
        holdPrompt: true,
      })

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    child.emit('exit', 1, null)

    await waitFor(() => {
      expect(statuses).toContain('failed')
      expect(attentions.at(-1)).toBe('failed')
    })

    handle.sendMessage('are you still there?', undefined, undefined, {
      deliveryMode: 'follow-up',
    })

    await waitFor(() => {
      const rendered = JSON.stringify(deltas)
      expect(rendered).toContain('are you still there?')
      expect(rendered).toContain(
        'Cursor is no longer connected, so this message was not sent.',
      )
    })
  })

  it('stops an active Cursor ACP request and cancels pending provider requests', async () => {
    const { child, server, handle, statuses, attentions } = startProvider(
      undefined,
      {
        holdPrompt: true,
      },
    )

    await waitFor(() => {
      expect(server.requests.map((request) => request.method)).toContain(
        'session/prompt',
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 101,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: { title: 'Run command', kind: 'execute' },
        options: [{ optionId: 'allow-once', name: 'Allow once' }],
      },
    })
    server.send({
      jsonrpc: '2.0',
      id: 102,
      method: 'cursor/ask_question',
      params: {
        toolCallId: 'call-ask-stop',
        title: 'Need input',
        questions: [
          {
            id: 'confirm',
            prompt: 'Continue?',
            options: [{ id: 'yes', label: 'Yes' }],
          },
        ],
      },
    })

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
      expect(attentions).toContain('needs-input')
    })

    handle.stop()

    await waitFor(() => {
      expect(server.responses).toEqual(
        expect.arrayContaining([
          {
            id: 101,
            result: { outcome: { outcome: 'cancelled' } },
          },
          {
            id: 102,
            result: { outcome: { outcome: 'cancelled' } },
          },
        ]),
      )
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
      expect(statuses).toContain('failed')
      expect(attentions.at(-1)).toBe('failed')
    })
  })

  it('keeps one ACP process across three turns (R1)', async () => {
    const { child, server, handle, statuses } = startProvider()

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(
      server.requests.filter((request) => request.method === 'initialize'),
    ).toHaveLength(1)
    expect(
      server.requests.filter((request) => request.method === 'session/prompt'),
    ).toHaveLength(1)
    expect(child.kill).not.toHaveBeenCalled()

    handle.sendMessage('second')
    await waitFor(() => {
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(2)
    })
    handle.sendMessage('third')
    await waitFor(() => {
      expect(
        server.requests.filter(
          (request) => request.method === 'session/prompt',
        ),
      ).toHaveLength(3)
      expect(
        statuses.filter((status) => status === 'completed').length,
      ).toBeGreaterThanOrEqual(3)
    })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(
      server.requests.filter((request) => request.method === 'initialize'),
    ).toHaveLength(1)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('respawns lazily after the idle process dies (R1)', async () => {
    const firstChild = new MockCursorAcpChild()
    const secondChild = new MockCursorAcpChild()
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild)
    const firstServer = createMockCursorAcp(firstChild)
    const secondServer = createMockCursorAcp(secondChild)
    const provider = new CursorProvider('agent')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: '/repo',
      initialMessage: 'hi',
      model: null,
      effort: null,
      continuationToken: null,
    })
    const statuses: string[] = []
    handle.onStatusChange((status) => statuses.push(status))

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(firstServer.requests.map((r) => r.method)).toContain('session/new')

    firstChild.emit('exit', 0, null)

    handle.sendMessage('again')
    await waitFor(() => {
      expect(secondServer.requests.map((r) => r.method)).toContain(
        'session/load',
      )
      expect(secondServer.requests.map((r) => r.method)).toContain(
        'session/prompt',
      )
    })
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(
      secondServer.requests.filter((r) => r.method === 'initialize'),
    ).toHaveLength(1)
    expect(secondServer.requests.some((r) => r.method === 'session/new')).toBe(
      false,
    )
  })

  it('interrupts with session/cancel notification and keeps the process (R2)', async () => {
    const { child, server, handle, statuses, attentions, deltas } =
      startProvider(undefined, { holdPrompt: true })

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    await expect(handle.interrupt?.()).resolves.toBe('interrupted')
    expect(server.notifications).toEqual(
      expect.arrayContaining([
        {
          method: 'session/cancel',
          params: { sessionId: 'cursor-session-1' },
        },
      ]),
    )

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
    expect(statuses).not.toContain('failed')
    expect(JSON.stringify(deltas)).toContain('stopped by user')
    expect(child.kill).not.toHaveBeenCalled()

    handle.sendMessage('after stop')
    await waitFor(() => {
      expect(
        server.requests.filter((r) => r.method === 'session/prompt'),
      ).toHaveLength(2)
    })
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('sends session/cancel as a notification, never as a request (R2)', async () => {
    const { server, handle } = startProvider(undefined, { holdPrompt: true })
    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    await expect(handle.interrupt?.()).resolves.toBe('interrupted')
    expect(
      server.notifications.some((n) => n.method === 'session/cancel'),
    ).toBe(true)
    expect(server.requests.some((r) => r.method === 'session/cancel')).toBe(
      false,
    )
  })

  it('defers mid-turn text to the app queue (R3)', async () => {
    const { server, handle } = startProvider(undefined, { holdPrompt: true })
    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    expect(handle.sendMessage('queued')).toBe('queue-follow-up')
    expect(
      server.requests.filter((r) => r.method === 'session/prompt'),
    ).toHaveLength(1)

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => {
      expect(
        server.requests.filter((r) => r.method === 'session/prompt'),
      ).toHaveLength(1)
    })
  })

  it('cancels a silent prompt after the silence budget (R4)', async () => {
    vi.useFakeTimers()
    try {
      const { server, handle, statuses, deltas } = startProvider(undefined, {
        holdPrompt: true,
        requestTimeoutMs: 25,
      })

      await vi.waitFor(() => {
        expect(server.requests.map((r) => r.method)).toContain('session/prompt')
      })

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)

      await vi.waitFor(() => {
        expect(
          server.notifications.some((n) => n.method === 'session/cancel'),
        ).toBe(true)
        expect(JSON.stringify(deltas)).toContain(
          'no word from Cursor for 10 minutes',
        )
        expect(statuses).toContain('failed')
      })
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers a refused session/load through session/new (R5)', async () => {
    const child = new MockCursorAcpChild()
    spawnMock.mockReturnValue(child)
    const server = createMockCursorAcp(child, { refuseSessionLoad: true })
    const provider = new CursorProvider('agent')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: '/repo',
      initialMessage: 'hi',
      model: null,
      effort: null,
      continuationToken: 'stale-session',
    })
    const statuses: string[] = []
    const deltas: SessionDelta[] = []
    handle.onStatusChange((status) => statuses.push(status))
    handle.onDelta((delta) => deltas.push(delta))

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(server.requests.map((r) => r.method)).toEqual(
      expect.arrayContaining([
        'initialize',
        'authenticate',
        'session/load',
        'session/new',
        'session/prompt',
      ]),
    )
    expect(statuses).not.toContain('failed')
    expect(JSON.stringify(deltas)).toMatch(
      /continuation was no longer available/i,
    )
  })
})
