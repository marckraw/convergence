import { EXECUTION_HOST_UNSENT_HARNESS_FACT_KINDS } from './execution-host-wire-mapping.pure'
import { describe, expect, it } from 'vitest'
import {
  decodeExecutionCommandEnvelope,
  decodeExecutionEventEnvelope,
  decodeExecutionProtocolDescriptor,
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
  settledAttentionForStatus,
  toLocalSessionDelta,
  toWireSessionDelta,
  withSettledAttention,
  withTurnOpenedBy,
  EXECUTION_HOST_UNSENT_LOCAL_DELTA_KINDS,
  EXECUTION_HOST_UNSENT_LOCAL_ITEM_FIELDS,
  EXECUTION_HOST_UNSENT_LOCAL_SEND_OPTION_FIELDS,
  EXECUTION_HOST_UNMAPPED_START_CONFIG_FIELDS,
  EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS,
  EXECUTION_HOST_UNMAPPED_WIRE_FILE_CHANGE_FIELDS,
  EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS,
  EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS,
  EXECUTION_HOST_WORKSPACE_EXCLUSIVE_START_CONFIG_FIELDS,
} from './execution-host-wire-mapping.pure'
import type { SessionStartConfig } from '../provider.types'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  DAEMON_HEALTH_FIXTURE_0_26_1,
  DAEMON_HEALTH_FIXTURE_GIT_SHA,
  DAEMON_HEALTH_FIXTURE_VERSION,
} from '@convergence/execution-host-client'

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

  it('rejects unknown event kinds, saying where they sat (protocol 0.15)', () => {
    const raw = JSON.stringify(
      eventEnvelope({ kind: 'telepathy' } as unknown as ExecutionHostEvent),
    )
    expect(decodeExecutionEventEnvelope(raw)).toEqual({
      ok: false,
      reason: 'unknown-kind',
      skipped: {
        sessionId: 'session-1',
        seq: 7,
        path: 'event.kind',
        kind: 'telepathy',
      },
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

  it('never sends the local provider account id to a host', () => {
    expect(EXECUTION_HOST_UNSENT_LOCAL_SEND_OPTION_FIELDS).toEqual([
      'providerAccountId',
      'onTurnAccepted',
    ])

    // The object SessionHandle.sendMessage actually hands over — the local
    // account id rides along with the delivery bookkeeping.
    const command = buildWireSendMessageCommand('hello', undefined, undefined, {
      deliveryMode: 'normal',
      queuedInputId: 'q-1',
      expectedProviderTurnId: 'turn-9',
      providerAccountId: 'account-1',
      onTurnAccepted: () => {},
    })

    expect(command).toEqual({
      kind: 'send-message',
      text: 'hello',
      options: {
        deliveryMode: 'normal',
        queuedInputId: 'q-1',
        expectedProviderTurnId: 'turn-9',
      },
    })
    // Belt and braces: prove it is absent from the bytes that leave the app,
    // not merely from a structural comparison that ignores extra keys.
    expect(
      encodeExecutionCommandEnvelope({
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
        sessionId: 'session-1',
        command,
      }),
    ).not.toContain('account-1')
  })

  it('carries a structured interaction response through unchanged', () => {
    expect(
      buildWireSendMessageCommand('', undefined, undefined, {
        deliveryMode: 'normal',
        interactionResponse: {
          kind: 'form',
          action: 'accept',
          values: { name: 'Marcin', count: 2, agree: true },
        },
      }),
    ).toEqual({
      kind: 'send-message',
      text: '',
      options: {
        deliveryMode: 'normal',
        interactionResponse: {
          kind: 'form',
          action: 'accept',
          values: { name: 'Marcin', count: 2, agree: true },
        },
      },
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

  /**
   * The remote-start blocker. `workingDirectory` names a directory on the
   * host -- since `projects.v1` the daemon resolves it as a Project -- while
   * `workspace` asks it to clone a repository into a fresh worktree. Daemon
   * 0.26.1 refuses a request that asks for both: HTTP 400 "A session cannot
   * use both a Project working directory and a target repository." Convergence
   * sent both, so every remote session start failed.
   */
  it('omits the working directory when the start carries a workspace', () => {
    const request = buildWireStartRequest('claude', {
      ...localConfig,
      workspace: { repository: 'https://github.com/example/repo.git' },
    })

    expect(request.config).not.toHaveProperty('workingDirectory')
    expect(Object.keys(request.config)).not.toContain('workingDirectory')
    expect(request.workspace).toEqual({
      repository: 'https://github.com/example/repo.git',
    })
  })

  /**
   * The other half of the exclusivity: a working directory with no workspace
   * is a legitimate shape -- it is how a daemon-side Project start will look
   * once RE3 adds the picker -- so the omission must stay conditional.
   */
  it('keeps the working directory when the start carries no workspace', () => {
    const request = buildWireStartRequest('claude', localConfig)

    expect(request.config.workingDirectory).toBe('/work/repo')
    expect(request).not.toHaveProperty('workspace')
  })

  it('names the start-config fields a workspace excludes', () => {
    expect(EXECUTION_HOST_WORKSPACE_EXCLUSIVE_START_CONFIG_FIELDS).toEqual([
      'workingDirectory',
    ])
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
   * Behaviour-neutrality on the no-workspace path. Before this slice the local
   * config went onto the wire verbatim and the daemon's own decoder discarded
   * whatever it did not model. For a start that carries no workspace — the
   * only path this covers, since `localConfig` has none — mapping explicitly
   * must leave the daemon holding exactly the same value it held before.
   *
   * The workspace path is deliberately NOT neutral: it drops
   * `workingDirectory`, which is what makes a remote start work at all against
   * daemon 0.26.1. See
   * EXECUTION_HOST_WORKSPACE_EXCLUSIVE_START_CONFIG_FIELDS and the two cases
   * above.
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
      'noTurnSinceBoundary',
      'readParallelWorkCounts',
      'readTaskStatus',
    ])

    const request = buildWireStartRequest('claude', {
      ...localConfig,
      initialAttachments: [{ id: 'att-1' }] as never,
      initialSkillSelections: [{ id: 'skill-1' }] as never,
      previousAssistantTexts: ['earlier reply'],
      serviceTier: 'priority',
      providerAccountId: 'account-1',
      noTurnSinceBoundary: true,
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
        model: 'opus',
        effort: 'high',
        runningTasks: 2,
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
        prUrl: 'https://github.com/example/repo/pull/1',
        runningTasks: 2,
      },
    })
    expect(EXECUTION_HOST_UNMAPPED_WIRE_SESSION_PATCH_FIELDS).toEqual([
      'roomId',
      'model',
      'effort',
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
      'author',
      'clientMessageId',
      'agentRunId',
      'taskId',
      'attachmentOmissions',
    ])
  })

  it('accepts the item fields protocols 0.15 to 0.23 added, and keeps none of them', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'delta',
        delta: {
          kind: 'conversation.item.add',
          item: wireItem({
            kind: 'tool-result',
            toolName: 'Read',
            relatedItemId: 'call-1',
            outputText: 'read a screenshot',
            agentRunId: 'agent-1',
            taskId: 'task-1',
            attachments: [
              {
                id: 'img-1',
                name: 'screenshot.png',
                mimeType: 'image/png',
                sizeBytes: 10,
                width: 2,
                height: 2,
              },
            ],
            attachmentOmissions: { 'image-too-large': 1 },
          }),
        },
      } as never),
    )
    const decoded = decodeExecutionEventEnvelope(raw)
    expect(decoded).toMatchObject({ ok: true })
    expect(decoded.ok && decoded.warnings).toBeFalsy()
    if (!decoded.ok || decoded.value.event.kind !== 'delta') return
    const local = toLocalSessionDelta(decoded.value.event.delta)
    expect(local?.kind).toBe('conversation.item.add')
    if (local?.kind !== 'conversation.item.add') return
    expect(local.item).toMatchObject({
      kind: 'tool-result',
      outputText: 'read a screenshot',
    })
    for (const field of EXECUTION_HOST_UNMAPPED_WIRE_ITEM_FIELDS)
      expect(local.item).not.toHaveProperty(field)
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
        origin: 'user',
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

  it('names every wire file-change field the local turn record cannot hold', () => {
    // Empty since MAR-2577. The list is kept because it is where a reader asks
    // the question, and "nothing" is an answer worth being able to read.
    expect(EXECUTION_HOST_UNMAPPED_WIRE_FILE_CHANGE_FIELDS).toEqual([])
  })

  it('carries the three fields that decide what a remote diff means', () => {
    // The costly case this repairs (MAR-2577): a diff the daemon cut short used
    // to arrive with no way to say so, and the review surface rendered the
    // fragment as the whole change.
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
          diff: '@@ cut here',
          truncated: true,
          binary: true,
          createdAt: '2026-08-22T10:00:00.000Z',
        },
      ],
    })

    expect(local?.kind).toBe('turn.fileChanges.add')
    if (local?.kind !== 'turn.fileChanges.add') return
    expect(local.fileChanges[0]).toMatchObject({
      repoRoot: 'packages/app',
      truncated: true,
      binary: true,
    })
  })

  it('maps turn file changes, spelling an absent repoRoot as null', () => {
    const local = toLocalSessionDelta({
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
          // Absent on the wire, which means the working-directory root.
          repoRoot: null,
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
  })

  it('drops the wire delta kinds that have no local counterpart', () => {
    expect(EXECUTION_HOST_UNMAPPED_WIRE_DELTA_KINDS).toEqual([
      'turn.patch',
      'evidence',
    ])
    expect(
      toLocalSessionDelta({
        kind: 'turn.patch',
        turnId: 'turn-1',
        patch: { status: 'completed' },
      }),
    ).toBeNull()
  })

  /**
   * Evidence is read so a host sending it is never refused, and left for
   * phase B of R7 (MAR-3684) to apply. Mutation: map it onto the local
   * `harness.evidence` delta and this turns red.
   */
  it('reads an evidence delta and applies none of it yet', () => {
    const raw = JSON.stringify(
      eventEnvelope({
        kind: 'delta',
        delta: {
          kind: 'evidence',
          turnId: 'turn-1',
          evidence: {
            kind: 'task.changed',
            taskId: 'task-1',
            at: '2026-10-13T10:00:00.000Z',
            patch: { status: 'running' },
          },
        },
      }),
    )
    const decoded = decodeExecutionEventEnvelope(raw)
    expect(decoded).toMatchObject({ ok: true })
    expect(decoded.ok && decoded.warnings).toBeFalsy()
    if (!decoded.ok || decoded.value.event.kind !== 'delta') return
    expect(decoded.value.event.delta.kind).toBe('evidence')
    expect(toLocalSessionDelta(decoded.value.event.delta)).toBeNull()
  })

  /**
   * A synthetic envelope, shaped by hand from the package types rather than
   * captured from a daemon: Convergence's SSE stream is authenticated, so no
   * unattended trace of a live one exists. The verbatim capture in this folder
   * is the unauthenticated `/health` descriptor
   * (execution-host-health.fixture.ts); this case proves only that a
   * well-formed envelope survives decode and mapping.
   */
  it('maps a well-formed streaming envelope through decode into a local delta', () => {
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

/**
 * The pairing both encodings of a settle share (MAR-2590).
 *
 * The record ends a turn on either a dedicated `status` event or a
 * `session.patch` carrying a status, so the attention a settle means is
 * derived in one place and applied to both. These pin the derivation itself;
 * the two encodings are pinned against the session record in
 * `remote-execution-host.session.test.ts`.
 */
describe('the attention a settle carries', () => {
  it('pairs each terminal status with the attention it means', () => {
    expect(settledAttentionForStatus('completed')).toBe('finished')
    expect(settledAttentionForStatus('failed')).toBe('failed')
  })

  it('pairs nothing with a status that settles nothing', () => {
    expect(settledAttentionForStatus('running')).toBeNull()
    expect(settledAttentionForStatus('idle')).toBeNull()
  })

  it('fills the attention a terminal patch leaves unsaid', () => {
    expect(withSettledAttention({ status: 'completed' })).toEqual({
      status: 'completed',
      attention: 'finished',
    })
    expect(withSettledAttention({ status: 'failed' })).toEqual({
      status: 'failed',
      attention: 'failed',
    })
  })

  /**
   * A host that states both halves is the authority on its own run: the wire
   * models `status` and `attention` on one patch precisely so it can.
   */
  it('keeps the attention a terminal patch states for itself', () => {
    expect(
      withSettledAttention({ status: 'completed', attention: 'needs-input' }),
    ).toEqual({ status: 'completed', attention: 'needs-input' })
  })

  /**
   * Identity, not merely equality: a patch with nothing to pair is the same
   * object, so nothing downstream can be handed a copy that differs by a key
   * order or an added field.
   */
  it('returns a patch it has nothing to add to unchanged', () => {
    const running = {
      status: 'running' as const,
      activity: 'streaming' as const,
    }
    expect(withSettledAttention(running)).toBe(running)

    const tokenOnly = { continuationToken: 'resume-1' }
    expect(withSettledAttention(tokenOnly)).toBe(tokenOnly)
  })
})

/**
 * Acceptance (b) of MAR-2576: a delta survives local -> wire -> local
 * byte-for-byte. This is the proof the anti-corruption layer does not quietly
 * corrupt the deltas it does carry — as opposed to the losses it declares.
 */
describe('delta round-trip local -> wire -> local', () => {
  const roundTrippable: Array<[string, SessionDelta]> = [
    [
      'session.patch',
      {
        kind: 'session.patch',
        patch: {
          status: 'running',
          attention: 'needs-approval',
          activity: 'tool:Bash',
          continuationToken: 'tok-1',
          updatedAt: '2026-08-22T10:00:00.000Z',
        },
      },
    ],
    [
      'conversation.item.add',
      {
        kind: 'conversation.item.add',
        item: {
          id: 'item-1',
          turnId: null,
          kind: 'message',
          actor: 'assistant',
          text: 'hello',
          state: 'complete',
          createdAt: '2026-08-22T10:00:00.000Z',
          updatedAt: '2026-08-22T10:00:01.000Z',
          providerMeta: {
            providerId: 'claude',
            providerItemId: null,
            providerEventType: 'assistant',
          },
        },
      },
    ],
    [
      'conversation.item.patch',
      {
        kind: 'conversation.item.patch',
        itemId: 'item-1',
        patch: { text: 'hello there', state: 'streaming' },
      },
    ],
  ]

  it.each(roundTrippable)(
    'round-trips a %s delta through the encoded envelope',
    (_kind, local) => {
      const wire = toWireSessionDelta(local)
      expect(wire).not.toBeNull()
      if (!wire) return

      const encoded = encodeExecutionEventEnvelope({
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
        sessionId: 'session-1',
        seq: 1,
        event: { kind: 'delta', delta: wire },
      })
      const decoded = decodeExecutionEventEnvelope(encoded)
      expect(decoded.ok).toBe(true)
      if (!decoded.ok || decoded.value.event.kind !== 'delta') return

      const back = toLocalSessionDelta(decoded.value.event.delta)
      expect(back).toEqual(local)

      // The wire bytes are the thing that has to be stable: mapping the
      // round-tripped delta back out must encode identically. The local
      // object itself is only key-order-normalised, never changed in value.
      expect(back).not.toBeNull()
      if (!back) return
      expect(JSON.stringify(toWireSessionDelta(back))).toEqual(
        JSON.stringify(wire),
      )
    },
  )

  it('names the local-only item fields that do not reach the wire', () => {
    expect(EXECUTION_HOST_UNSENT_LOCAL_ITEM_FIELDS).toEqual([
      'turnId',
      'agentRunId',
      'taskId',
      'agentAttribution',
      'attachmentIds',
      'skillSelections',
      'deliveryMode',
      'action',
    ])

    const wire = toWireSessionDelta({
      kind: 'conversation.item.add',
      item: {
        id: 'item-1',
        turnId: 'turn-1',
        kind: 'message',
        actor: 'user',
        text: 'hi',
        attachmentIds: ['att-1'],
        skillSelections: [{ id: 'skill-1' }] as never,
        deliveryMode: 'steer',
        state: 'complete',
        createdAt: '2026-08-22T10:00:00.000Z',
        updatedAt: '2026-08-22T10:00:01.000Z',
        providerMeta: {
          providerId: 'claude',
          providerItemId: null,
          providerEventType: 'user',
        },
      },
    })

    expect(wire).not.toBeNull()
    if (!wire || wire.kind !== 'conversation.item.add') return
    for (const field of EXECUTION_HOST_UNSENT_LOCAL_ITEM_FIELDS) {
      expect(wire.item).not.toHaveProperty(field)
    }
  })

  it('never sends local turn bookkeeping to a host', () => {
    expect(EXECUTION_HOST_UNSENT_LOCAL_DELTA_KINDS).toEqual([
      'turn.add',
      'turn.fileChanges.add',
      'harness.evidence',
    ])
    expect(
      toWireSessionDelta({
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
      }),
    ).toBeNull()
  })
})

/**
 * The one verbatim trace in this folder. The package's descriptor decoder is
 * strict-defensive, and the live fleet advertises capability ids that are not
 * in its known list — so this is the check that the strictness the mapping
 * layer now depends on does not reject a daemon that is actually running.
 */
describe('execution protocol descriptor from a captured /health', () => {
  it(`accepts the descriptor agents-daemon ${DAEMON_HEALTH_FIXTURE_VERSION} really serves`, () => {
    const health = JSON.parse(DAEMON_HEALTH_FIXTURE_0_26_1) as {
      version: string
      gitSha: string
      executionProtocol: unknown
    }
    expect(health.version).toBe(DAEMON_HEALTH_FIXTURE_VERSION)
    expect(health.gitSha).toBe(DAEMON_HEALTH_FIXTURE_GIT_SHA)

    const decoded = decodeExecutionProtocolDescriptor(health.executionProtocol)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.value.version).toBe(EXECUTION_PROTOCOL_VERSION)
    // Ids the package's known-capability list does not contain. The wire type
    // is `Known | (string & {})` on purpose: the daemon leads, clients follow.
    expect(decoded.value.capabilities).toEqual(
      expect.arrayContaining([
        'deltas.append.v1',
        'rooms.v1',
        'projects.v1',
        'push.v1',
      ]),
    )
  })

  it('rejects a descriptor from a daemon speaking a later protocol', () => {
    expect(
      decodeExecutionProtocolDescriptor({ version: 2, capabilities: [] }),
    ).toEqual({ ok: false, reason: 'unsupported-protocol-version' })
  })
})

it('names every local harness family remote cannot show — mutation remove an inventory entry turns red', () => {
  expect(Object.keys(EXECUTION_HOST_UNSENT_HARNESS_FACT_KINDS)).toEqual([
    'harness.hook',
    'harness.retry',
    'harness.compaction',
    'harness.denial',
    'harness.rateLimit',
    'harness.init',
    'harness.mcpStatus',
  ])
})

it('sends answered as itself now the wire has it (protocol 0.19) — mutation map it to running turns red', () => {
  expect(
    toWireSessionDelta({
      kind: 'session.patch',
      patch: { status: 'answered', attention: 'none', runningTasks: 2 },
    }),
  ).toEqual({
    kind: 'session.patch',
    patch: { status: 'answered', attention: 'none', runningTasks: 2 },
  })
})

it.each([
  { kind: 'status', status: 'answered' },
  {
    kind: 'delta',
    delta: { kind: 'session.patch', patch: { status: 'answered' } },
  },
])('reads answered %j on the wire, never refusing it (MAR-3987)', (event) => {
  const decoded = decodeExecutionEventEnvelope(
    JSON.stringify(eventEnvelope(event as ExecutionHostEvent)),
  )
  expect(decoded).toMatchObject({ ok: true })
  expect(decoded.ok && decoded.warnings).toBeFalsy()
})

describe('who opened a turn (MAR-3987)', () => {
  function turnAddRaw(turn: Record<string, unknown>): string {
    return JSON.stringify(
      eventEnvelope({
        kind: 'delta',
        delta: {
          kind: 'turn.add',
          turn: {
            id: 'turn-1',
            sessionId: 'session-1',
            sequence: 1,
            startedAt: '2026-10-13T10:00:00.000Z',
            endedAt: null,
            status: 'running',
            summary: null,
            ...turn,
          },
        },
      } as never),
    )
  }

  function originOf(raw: string): unknown {
    const decoded = decodeExecutionEventEnvelope(raw)
    if (
      !decoded.ok ||
      decoded.value.event.kind !== 'delta' ||
      decoded.value.event.delta.kind !== 'turn.add'
    )
      return decoded
    return decoded.value.event.delta.turn.origin
  }

  it('reads a harness turn as harness', () => {
    expect(originOf(turnAddRaw({ origin: 'harness' }))).toBe('harness')
  })

  it('reads a turn with no origin as a user turn (protocol 0.22)', () => {
    expect(originOf(turnAddRaw({}))).toBe('user')
  })

  it('stamps a running patch with the origin of the turn it starts', () => {
    expect(withTurnOpenedBy({ status: 'running' }, 'harness')).toEqual({
      status: 'running',
      turnOpenedBy: 'harness',
    })
    expect(withTurnOpenedBy({ status: 'running' }, 'user')).toEqual({
      status: 'running',
      turnOpenedBy: 'user',
    })
  })

  it('leaves a patch that starts no turn, or has no turn to go by, untouched', () => {
    const answered = { status: 'answered' as const }
    expect(withTurnOpenedBy(answered, 'harness')).toBe(answered)
    const running = { status: 'running' as const }
    expect(withTurnOpenedBy(running, null)).toBe(running)
    const said = { status: 'running' as const, turnOpenedBy: 'user' as const }
    expect(withTurnOpenedBy(said, 'harness')).toBe(said)
  })
})

/**
 * agents-daemon #187's envelope timeline for a resident Claude session whose
 * answer leaves a background task running (MAR-3979), read the way
 * Convergence reads it: decoded by protocol 0.23's own reader, then mapped.
 *
 * `tasks:1 -> session.patch{answered, none, 1} -> turn completed -> tasks:0 ->
 * turn.add(harness) -> running -> completed -> attention finished`.
 */
describe("agents-daemon #187's timeline through protocol 0.23 (MAR-3987)", () => {
  const timeline: ExecutionHostEvent[] = [
    {
      kind: 'delta',
      delta: {
        kind: 'turn.add',
        turn: {
          id: 'turn-1',
          sessionId: 'session-1',
          sequence: 1,
          startedAt: '2026-10-13T10:00:00.000Z',
          endedAt: null,
          status: 'running',
          summary: null,
          origin: 'user',
        },
      },
    },
    { kind: 'status', status: 'running' },
    {
      kind: 'delta',
      delta: { kind: 'session.patch', patch: { runningTasks: 1 } },
    },
    {
      kind: 'delta',
      delta: {
        kind: 'session.patch',
        patch: { status: 'answered', attention: 'none', runningTasks: 1 },
      },
    },
    {
      kind: 'delta',
      delta: {
        kind: 'turn.patch',
        turnId: 'turn-1',
        patch: { status: 'completed', endedAt: '2026-10-13T10:01:00.000Z' },
      },
    },
    {
      kind: 'delta',
      delta: { kind: 'session.patch', patch: { runningTasks: 0 } },
    },
    {
      kind: 'delta',
      delta: {
        kind: 'turn.add',
        turn: {
          id: 'turn-2',
          sessionId: 'session-1',
          sequence: 2,
          startedAt: '2026-10-13T10:02:00.000Z',
          endedAt: null,
          status: 'running',
          summary: null,
          origin: 'harness',
        },
      },
    },
    { kind: 'status', status: 'running' },
    { kind: 'status', status: 'completed' },
    {
      kind: 'delta',
      delta: {
        kind: 'turn.patch',
        turnId: 'turn-2',
        patch: { status: 'completed', endedAt: '2026-10-13T10:03:00.000Z' },
      },
    },
    { kind: 'attention', attention: 'finished' },
  ]

  /** One envelope, as the daemon writes it and Convergence reads it. */
  function read(event: ExecutionHostEvent, seq: number) {
    return decodeExecutionEventEnvelope(
      encodeExecutionEventEnvelope({
        protocolVersion: EXECUTION_PROTOCOL_VERSION,
        sessionId: 'session-1',
        seq,
        event,
      }),
    )
  }

  it('decodes every envelope, with no warning', () => {
    for (const [index, event] of timeline.entries()) {
      const decoded = read(event, index + 1)
      expect(decoded).toMatchObject({ ok: true })
      expect(decoded.ok && decoded.warnings).toBeFalsy()
    }
  })

  /**
   * The status each envelope leaves the session at, and the task count it
   * says, as the remote handle reads them: a `status` event or a session
   * patch's status, with the attention its settle means.
   */
  it('shows running, answered and completed, each in its turn', () => {
    const states: string[] = []
    let origin: 'user' | 'harness' | null = null
    for (const [index, event] of timeline.entries()) {
      const decoded = read(event, index + 1)
      if (!decoded.ok) throw new Error(decoded.reason)
      const wire = decoded.value.event
      if (wire.kind === 'delta' && wire.delta.kind === 'turn.add')
        origin = wire.delta.turn.origin
      const patch =
        wire.kind === 'status'
          ? { status: wire.status }
          : wire.kind === 'delta'
            ? (() => {
                const local = toLocalSessionDelta(wire.delta)
                return local?.kind === 'session.patch' ? local.patch : null
              })()
            : null
      if (!patch) continue
      const stamped = withTurnOpenedBy(withSettledAttention(patch), origin)
      if (stamped !== withSettledAttention(patch)) origin = null
      states.push(
        [
          stamped.status ?? '-',
          stamped.attention ?? '-',
          stamped.runningTasks ?? '-',
          stamped.turnOpenedBy ?? '-',
        ].join(' '),
      )
    }
    expect(states).toEqual([
      'running - - user',
      '- - 1 -',
      'answered none 1 -',
      '- - 0 -',
      'running - - harness',
      'completed finished - -',
    ])
  })
})
