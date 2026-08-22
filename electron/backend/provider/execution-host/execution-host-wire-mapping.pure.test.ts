import { describe, expect, it } from 'vitest'
import {
  decodeExecutionCommandEnvelope,
  decodeExecutionEventEnvelope,
  decodeExecutionStartRequest,
  encodeExecutionCommandEnvelope,
  encodeExecutionEventEnvelope,
  encodeExecutionStartRequest,
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostCommandEnvelope,
  type ExecutionHostEvent,
  type ExecutionHostEventEnvelope,
  type ExecutionSessionDelta,
} from '@mrck-labs/execution-host-protocol'
import {
  buildWireApproveCommand,
  buildWireDenyCommand,
  buildWireSendMessageCommand,
  buildWireStartRequest,
  buildWireStopCommand,
  toLocalSessionDelta,
  EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS,
  EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS,
  EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS,
  EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS,
} from './execution-host-wire-mapping.pure'
import type { SessionStartConfig } from '../provider.types'

function eventEnvelope(event: ExecutionHostEvent): ExecutionHostEventEnvelope {
  return {
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    sessionId: 'session-1',
    seq: 7,
    event,
  }
}

function wireItem(overrides: Record<string, unknown>) {
  return {
    id: 'item-1',
    state: 'complete',
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:01.000Z',
    providerMeta: {
      providerId: 'claude',
      providerItemId: null,
      providerEventType: 'assistant',
    },
    ...overrides,
  }
}

// The codecs the adapter now depends on are the package's, not ours. These
// pin the behaviour the deleted byte-copy codec used to guarantee, so a
// package upgrade that loosened or tightened them would fail here first.
describe('execution host event envelope codec', () => {
  const events: ExecutionHostEvent[] = [
    {
      kind: 'delta',
      delta: { kind: 'session.patch', patch: { status: 'running' } },
    },
    { kind: 'status', status: 'running' },
    { kind: 'attention', attention: 'needs-approval' },
    { kind: 'continuation-token', token: 'tok-123' },
    {
      kind: 'context-window',
      contextWindow: {
        availability: 'unavailable',
        source: 'provider',
        reason: 'not reported',
      },
    },
    { kind: 'activity', activity: 'tool:Bash' },
    { kind: 'activity', activity: null },
    { kind: 'heartbeat' },
  ]

  it.each(events.map((e) => [e.kind, e] as const))(
    'round-trips %s events',
    (_kind, event) => {
      const envelope = eventEnvelope(event)
      const decoded = decodeExecutionEventEnvelope(
        encodeExecutionEventEnvelope(envelope),
      )
      expect(decoded).toEqual({ ok: true, value: envelope })
    },
  )

  it('rejects malformed json', () => {
    expect(decodeExecutionEventEnvelope('{nope')).toEqual({
      ok: false,
      reason: 'malformed-json',
    })
  })

  it('rejects unsupported protocol versions', () => {
    const raw = JSON.stringify({
      ...eventEnvelope({ kind: 'heartbeat' }),
      protocolVersion: 99,
    })
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unsupported-protocol-version',
    })
  })

  it('rejects envelopes without a positive integer seq', () => {
    const raw = JSON.stringify({
      ...eventEnvelope({ kind: 'heartbeat' }),
      seq: 0,
    })
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    })
  })

  it('rejects unknown event kinds', () => {
    const raw = JSON.stringify(
      eventEnvelope({ kind: 'telepathy' } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unknown-kind',
    })
  })

  it('rejects invalid event payloads', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'status',
        status: 'exploded',
      } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects invalid activity signals', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'activity',
        activity: 'dancing',
      } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })
})

describe('execution host command envelope codec', () => {
  const commands: ExecutionHostCommandEnvelope['command'][] = [
    buildWireSendMessageCommand('hello', undefined, undefined, {
      deliveryMode: 'normal',
      queuedInputId: 'q-1',
    }),
    buildWireApproveCommand('appr-1'),
    buildWireDenyCommand(),
    buildWireStopCommand(),
  ]

  it.each(commands.map((c) => [c.kind, c] as const))(
    'round-trips %s commands',
    (_kind, command) => {
      const envelope: ExecutionHostCommandEnvelope = {
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
        sessionId: 'session-1',
        command,
      }
      const decoded = decodeExecutionCommandEnvelope(
        encodeExecutionCommandEnvelope(envelope),
      )
      expect(decoded).toEqual({ ok: true, value: envelope })
    },
  )

  it('rejects send-message commands without text', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      sessionId: 'session-1',
      command: { kind: 'send-message' },
    })
    expect(decodeExecutionCommandEnvelope(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects unknown command kinds', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      sessionId: 'session-1',
      command: { kind: 'restart' },
    })
    expect(decodeExecutionCommandEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unknown-kind',
    })
  })

  it('carries local attachments and skill selections through opaquely', () => {
    const command = buildWireSendMessageCommand(
      'hello',
      [{ id: 'att-1', name: 'a.png' }] as never,
      [{ id: 'skill-1' }] as never,
    )
    expect(command).toEqual({
      kind: 'send-message',
      text: 'hello',
      attachments: [{ id: 'att-1', name: 'a.png' }],
      skillSelections: [{ id: 'skill-1' }],
    })
  })

  it('omits absent optional command fields entirely', () => {
    expect(buildWireSendMessageCommand('hello')).toEqual({
      kind: 'send-message',
      text: 'hello',
    })
  })
})

describe('buildWireStartRequest', () => {
  const localConfig: SessionStartConfig = {
    sessionId: 'session-1',
    workingDirectory: '/work/repo',
    initialMessage: 'hello',
    model: 'claude-fable-5',
    effort: 'medium',
    continuationToken: null,
    permissionConfig: { preset: 'yolo' },
  }

  it('round-trips a start request through the wire codec', () => {
    const request = buildWireStartRequest('claude', localConfig)
    expect(
      decodeExecutionStartRequest(encodeExecutionStartRequest(request)),
    ).toEqual({ ok: true, value: request })
  })

  it('round-trips a start request with a workspace source', () => {
    const request = buildWireStartRequest('claude', {
      ...localConfig,
      workingDirectory: '',
      workspace: {
        repository: 'https://github.com/example/repo.git',
        ref: 'main',
        branchName: 'agent/session-1',
      },
    })
    expect(request.workspace).toEqual({
      repository: 'https://github.com/example/repo.git',
      ref: 'main',
      branchName: 'agent/session-1',
    })
    expect(
      decodeExecutionStartRequest(encodeExecutionStartRequest(request)),
    ).toEqual({ ok: true, value: request })
  })

  it('rejects start requests with an invalid workspace source', () => {
    const raw = JSON.stringify({
      ...buildWireStartRequest('claude', localConfig),
      workspace: { repository: '' },
    })
    expect(decodeExecutionStartRequest(raw)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    })
  })

  it('rejects start requests with incomplete config', () => {
    const raw = JSON.stringify({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      providerId: 'claude',
      config: { sessionId: 'session-1' },
    })
    expect(decodeExecutionStartRequest(raw)).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    })
  })

  /**
   * The behaviour-neutrality proof for MAR-2576. Before this slice the local
   * config went onto the wire verbatim and the daemon's own decoder discarded
   * whatever it did not model. Mapping explicitly must leave the daemon
   * holding exactly the same value it held before.
   */
  it('decodes on the daemon to the same value the unmapped config did', () => {
    const fullConfig: SessionStartConfig = {
      ...localConfig,
      initialAttachments: [{ id: 'att-1' }] as never,
      initialSkillSelections: [{ id: 'skill-1' }] as never,
      previousAssistantTexts: ['earlier reply'],
      serviceTier: 'priority',
      providerAccountId: 'account-1',
    }

    const legacyBody = JSON.stringify({
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
      providerId: 'claude',
      config: fullConfig,
    })
    const mappedBody = encodeExecutionStartRequest(
      buildWireStartRequest('claude', fullConfig),
    )

    expect(legacyBody).not.toEqual(mappedBody)
    expect(decodeExecutionStartRequest(mappedBody)).toEqual(
      decodeExecutionStartRequest(legacyBody),
    )
  })

  it('names every local start-config field the wire cannot carry', () => {
    expect(EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS).toEqual([
      'initialAttachments',
      'initialSkillSelections',
      'previousAssistantTexts',
      'serviceTier',
      'providerAccountId',
    ])

    const request = buildWireStartRequest('claude', {
      ...localConfig,
      initialAttachments: [{ id: 'att-1' }] as never,
      initialSkillSelections: [{ id: 'skill-1' }] as never,
      previousAssistantTexts: ['earlier reply'],
      serviceTier: 'priority',
      providerAccountId: 'account-1',
    })

    for (const field of EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS) {
      expect(request.config).not.toHaveProperty(field)
    }
  })

  it('carries the permission config and omits it when unset', () => {
    expect(
      buildWireStartRequest('claude', localConfig).config.permissionConfig,
    ).toEqual({ preset: 'yolo' })

    const withoutPermission: SessionStartConfig = {
      sessionId: 'session-1',
      workingDirectory: '/work/repo',
      initialMessage: 'hello',
      model: 'claude-fable-5',
      effort: 'medium',
      continuationToken: null,
    }
    expect(
      buildWireStartRequest('claude', withoutPermission).config,
    ).not.toHaveProperty('permissionConfig')
  })
})

describe('toLocalSessionDelta', () => {
  it('maps a session patch and drops the fields the local row lacks', () => {
    const delta: ExecutionSessionDelta = {
      kind: 'session.patch',
      patch: {
        status: 'running',
        attention: 'none',
        activity: 'thinking',
        continuationToken: 'tok-1',
        updatedAt: '2026-08-22T10:00:00.000Z',
        prUrl: 'https://github.com/example/repo/pull/1',
        roomId: 'room-1',
      },
    }

    expect(toLocalSessionDelta(delta)).toEqual({
      kind: 'session.patch',
      patch: {
        status: 'running',
        attention: 'none',
        activity: 'thinking',
        continuationToken: 'tok-1',
        updatedAt: '2026-08-22T10:00:00.000Z',
      },
    })
    expect(EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS).toEqual([
      'prUrl',
      'roomId',
    ])
  })

  it('maps every wire conversation item kind onto a local draft', () => {
    const items: Array<[string, Record<string, unknown>]> = [
      [
        'message',
        wireItem({ kind: 'message', actor: 'assistant', text: 'hi' }),
      ],
      [
        'thinking',
        wireItem({ kind: 'thinking', actor: 'assistant', text: 'hmm' }),
      ],
      [
        'tool-call',
        wireItem({ kind: 'tool-call', toolName: 'Bash', inputText: 'ls' }),
      ],
      [
        'tool-result',
        wireItem({
          kind: 'tool-result',
          toolName: 'Bash',
          relatedItemId: 'item-0',
          outputText: 'ok',
        }),
      ],
      [
        'approval-request',
        wireItem({ kind: 'approval-request', description: 'run ls' }),
      ],
      [
        'input-request',
        wireItem({
          kind: 'input-request',
          prompt: 'which?',
          request: { kind: 'text', prompt: 'which?' },
        }),
      ],
      ['note', wireItem({ kind: 'note', level: 'warning', text: 'heads up' })],
    ]

    for (const [kind, item] of items) {
      const local = toLocalSessionDelta({
        kind: 'conversation.item.add',
        item: item as never,
      })
      expect(local).toMatchObject({
        kind: 'conversation.item.add',
        item: { id: 'item-1', kind, turnId: null },
      })
    }
  })

  it('preserves the structured interaction request on an input request', () => {
    const request = {
      kind: 'choice' as const,
      questions: [
        {
          id: 'q-1',
          question: 'Pick one',
          header: 'Options',
          options: [{ label: 'a' }, { label: 'b' }],
          multiSelect: false,
        },
      ],
    }
    const local = toLocalSessionDelta({
      kind: 'conversation.item.add',
      item: wireItem({
        kind: 'input-request',
        prompt: 'Pick one',
        request,
      }) as never,
    })
    expect(local).toMatchObject({
      item: { kind: 'input-request', request },
    })
  })

  /**
   * The wire item carries daemon-side attachment descriptors and a delivery
   * lifecycle; the local item stores attachment ids resolved against
   * Convergence's own store and has no reader for delivery.
   */
  it('drops the wire-only message fields the local item cannot store', () => {
    const local = toLocalSessionDelta({
      kind: 'conversation.item.add',
      item: wireItem({
        kind: 'message',
        actor: 'user',
        text: 'hi',
        attachments: [
          { id: 'a-1', name: 'x.png', mimeType: 'image/png', sizeBytes: 10 },
        ],
        delivery: 'delivered',
      }) as never,
    })

    expect(local).toEqual({
      kind: 'conversation.item.add',
      item: {
        id: 'item-1',
        turnId: null,
        kind: 'message',
        actor: 'user',
        text: 'hi',
        state: 'complete',
        createdAt: '2026-08-22T10:00:00.000Z',
        updatedAt: '2026-08-22T10:00:01.000Z',
        providerMeta: {
          providerId: 'claude',
          providerItemId: null,
          providerEventType: 'assistant',
        },
      },
    })
    expect(EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS).toEqual([
      'attachments',
      'delivery',
      'textAppend',
    ])
  })

  it('narrows an item patch to the fields the local item models', () => {
    const local = toLocalSessionDelta({
      kind: 'conversation.item.patch',
      itemId: 'item-1',
      patch: {
        text: 'streaming text',
        state: 'streaming',
        textAppend: ' more',
        delivery: 'queued',
      } as never,
    })

    expect(local).toEqual({
      kind: 'conversation.item.patch',
      itemId: 'item-1',
      patch: { state: 'streaming', text: 'streaming text' },
    })
  })

  it('maps a turn add with a remote turn left unattributed', () => {
    const local = toLocalSessionDelta({
      kind: 'turn.add',
      turn: {
        id: 'turn-1',
        sessionId: 'session-1',
        sequence: 1,
        startedAt: '2026-08-22T10:00:00.000Z',
        endedAt: null,
        status: 'running',
        summary: null,
      },
    })

    expect(local).toEqual({
      kind: 'turn.add',
      turn: {
        id: 'turn-1',
        sessionId: 'session-1',
        sequence: 1,
        startedAt: '2026-08-22T10:00:00.000Z',
        endedAt: null,
        status: 'running',
        summary: null,
        providerAccountId: null,
        model: null,
        effort: null,
      },
    })
  })

  it('maps turn file changes and drops the wire-only diff flags', () => {
    const local = toLocalSessionDelta({
      kind: 'turn.fileChanges.add',
      turnId: 'turn-1',
      fileChanges: [
        {
          id: 'fc-1',
          sessionId: 'session-1',
          turnId: 'turn-1',
          repoRoot: 'packages/app',
          filePath: 'src/index.ts',
          oldPath: null,
          status: 'modified',
          additions: 3,
          deletions: 1,
          diff: '@@',
          truncated: false,
          binary: false,
          createdAt: '2026-08-22T10:00:00.000Z',
        },
      ],
    })

    expect(local).toEqual({
      kind: 'turn.fileChanges.add',
      turnId: 'turn-1',
      fileChanges: [
        {
          id: 'fc-1',
          sessionId: 'session-1',
          turnId: 'turn-1',
          filePath: 'src/index.ts',
          oldPath: null,
          status: 'modified',
          additions: 3,
          deletions: 1,
          diff: '@@',
          createdAt: '2026-08-22T10:00:00.000Z',
        },
      ],
    })
  })

  it('drops the wire delta kinds that have no local counterpart', () => {
    expect(EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS).toEqual(['turn.patch'])
    expect(
      toLocalSessionDelta({
        kind: 'turn.patch',
        turnId: 'turn-1',
        patch: { status: 'completed' },
      }),
    ).toBeNull()
  })

  /**
   * A live daemon envelope (agents-daemon 0.26.1 * f62fd1b2), captured
   * verbatim, decoded by the package and mapped to the local delta.
   */
  it('maps a real streaming envelope from agents-daemon 0.26.1', () => {
    const raw = JSON.stringify({
      protocolVersion: 1,
      sessionId: 'session-1',
      seq: 12,
      event: {
        kind: 'delta',
        delta: {
          kind: 'conversation.item.patch',
          itemId: 'item-9',
          patch: { text: 'Hello there', state: 'streaming' },
        },
      },
    })

    const decoded = decodeExecutionEventEnvelope(raw)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.event.kind).toBe('delta')
    if (decoded.value.event.kind !== 'delta') return

    expect(toLocalSessionDelta(decoded.value.event.delta)).toEqual({
      kind: 'conversation.item.patch',
      itemId: 'item-9',
      patch: { text: 'Hello there', state: 'streaming' },
    })
  })
})
