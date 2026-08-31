import { describe, expect, it } from 'vitest'
import {
  describeWireDeltaShape,
  describeWireEventShape,
  describeWireTokenShape,
} from './execution-host-wire-trace.pure'

const SECRET_TOKEN = '7f3c9a11-2b4d-4e6f-8a90-1c2d3e4f5a6b'

describe('describeWireTokenShape', () => {
  it('reports a UUID token as a length and a form, never its value', () => {
    const shape = describeWireTokenShape(SECRET_TOKEN)
    expect(shape).toEqual({ chars: 36, form: 'uuid' })
    expect(JSON.stringify(shape)).not.toContain(SECRET_TOKEN)
  })

  it('classifies a non-UUID token as opaque', () => {
    expect(describeWireTokenShape('sess_abc123')).toEqual({
      chars: 11,
      form: 'opaque',
    })
  })

  it('distinguishes an empty token from a real one', () => {
    expect(describeWireTokenShape('')).toEqual({ chars: 0, form: 'opaque' })
  })
})

describe('describeWireEventShape', () => {
  it('carries the status of a status event', () => {
    expect(
      describeWireEventShape({ kind: 'status', status: 'completed' }),
    ).toEqual({ kind: 'status', status: 'completed' })
  })

  it('describes a continuation-token event without quoting the token', () => {
    const shape = describeWireEventShape({
      kind: 'continuation-token',
      token: SECRET_TOKEN,
    })
    expect(shape).toEqual({
      kind: 'continuation-token',
      continuationToken: { chars: 36, form: 'uuid' },
    })
    expect(JSON.stringify(shape)).not.toContain(SECRET_TOKEN)
  })

  it('carries the attention state', () => {
    expect(
      describeWireEventShape({
        kind: 'attention',
        attention: 'needs-approval',
      }),
    ).toEqual({ kind: 'attention', attention: 'needs-approval' })
  })

  it('carries the activity signal, including a tool signal', () => {
    expect(
      describeWireEventShape({ kind: 'activity', activity: 'tool:Bash' }),
    ).toEqual({ kind: 'activity', activity: 'tool:Bash' })
  })

  it('reduces a context-window event to availability and source', () => {
    expect(
      describeWireEventShape({
        kind: 'context-window',
        contextWindow: {
          availability: 'available',
          source: 'provider',
          usedTokens: 1000,
          windowTokens: 200000,
          usedPercentage: 0.5,
          remainingPercentage: 99.5,
        },
      }),
    ).toEqual({
      kind: 'context-window',
      contextWindow: { availability: 'available', source: 'provider' },
    })
  })

  it('describes a heartbeat as nothing but its kind', () => {
    expect(describeWireEventShape({ kind: 'heartbeat' })).toEqual({
      kind: 'heartbeat',
    })
  })
})

describe('describeWireDeltaShape', () => {
  it('names the fields a session.patch carried and keeps its enum values', () => {
    expect(
      describeWireDeltaShape({
        kind: 'session.patch',
        patch: {
          status: 'completed',
          attention: 'finished',
          activity: null,
          updatedAt: '2026-08-23T10:00:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'session.patch',
      patchFields: ['status', 'attention', 'activity', 'updatedAt'],
      status: 'completed',
      attention: 'finished',
      activity: null,
    })
  })

  it('describes a continuationToken patch without quoting the token', () => {
    const shape = describeWireDeltaShape({
      kind: 'session.patch',
      patch: { continuationToken: SECRET_TOKEN },
    })
    expect(shape).toEqual({
      kind: 'session.patch',
      patchFields: ['continuationToken'],
      continuationToken: { chars: 36, form: 'uuid' },
    })
    expect(JSON.stringify(shape)).not.toContain(SECRET_TOKEN)
  })

  it('distinguishes a cleared token from an absent one', () => {
    expect(
      describeWireDeltaShape({
        kind: 'session.patch',
        patch: { continuationToken: null },
      }),
    ).toEqual({
      kind: 'session.patch',
      patchFields: ['continuationToken'],
      continuationToken: null,
    })
    expect(
      describeWireDeltaShape({
        kind: 'session.patch',
        patch: { status: 'idle' },
      }),
    ).not.toHaveProperty('continuationToken')
  })

  it('reduces an added message to a kind, an actor and a character count', () => {
    const shape = describeWireDeltaShape({
      kind: 'conversation.item.add',
      item: {
        id: 'i1',
        kind: 'message',
        state: 'streaming',
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z',
        providerMeta: {
          providerId: 'claude',
          providerItemId: null,
          providerEventType: null,
        },
        actor: 'assistant',
        text: 'the secret plan',
      },
    })
    expect(shape).toEqual({
      kind: 'conversation.item.add',
      itemKind: 'message',
      itemState: 'streaming',
      actor: 'assistant',
      textChars: 15,
    })
    expect(JSON.stringify(shape)).not.toContain('secret')
  })

  it('reduces an added tool-call to its kind and state, with no input text', () => {
    const shape = describeWireDeltaShape({
      kind: 'conversation.item.add',
      item: {
        id: 'i2',
        kind: 'tool-call',
        state: 'complete',
        createdAt: '2026-08-23T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z',
        providerMeta: {
          providerId: 'claude',
          providerItemId: null,
          providerEventType: null,
        },
        toolName: 'Bash',
        inputText: 'cat ~/.ssh/id_rsa',
      },
    })
    expect(shape).toEqual({
      kind: 'conversation.item.add',
      itemKind: 'tool-call',
      itemState: 'complete',
    })
    expect(JSON.stringify(shape)).not.toContain('id_rsa')
  })

  it('reduces an item patch to field names and text sizes', () => {
    const shape = describeWireDeltaShape({
      kind: 'conversation.item.patch',
      itemId: 'i1',
      patch: { text: 'hello world', state: 'complete' },
    })
    expect(shape).toEqual({
      kind: 'conversation.item.patch',
      patchFields: ['text', 'state'],
      itemState: 'complete',
      textChars: 11,
    })
    expect(JSON.stringify(shape)).not.toContain('hello world')
  })

  it('counts an appended chunk without quoting it', () => {
    expect(
      describeWireDeltaShape({
        kind: 'conversation.item.patch',
        itemId: 'i1',
        patch: { textAppend: 'abcde' },
      }),
    ).toEqual({
      kind: 'conversation.item.patch',
      patchFields: ['textAppend'],
      textAppendChars: 5,
    })
  })

  it('carries turn status and drops the turn summary', () => {
    expect(
      describeWireDeltaShape({
        kind: 'turn.add',
        turn: {
          id: 't1',
          sessionId: 's1',
          sequence: 1,
          startedAt: '2026-08-23T10:00:00.000Z',
          endedAt: null,
          status: 'running',
          summary: 'summarised private work',
        },
      }),
    ).toEqual({ kind: 'turn.add', turnStatus: 'running' })

    const patchShape = describeWireDeltaShape({
      kind: 'turn.patch',
      turnId: 't1',
      patch: {
        status: 'completed',
        endedAt: '2026-08-23T10:01:00.000Z',
        summary: 'summarised private work',
      },
    })
    expect(patchShape).toEqual({
      kind: 'turn.patch',
      patchFields: ['status', 'endedAt', 'summary'],
      turnStatus: 'completed',
    })
    expect(JSON.stringify(patchShape)).not.toContain('private work')
  })

  it('counts file changes and quotes neither path nor diff', () => {
    const shape = describeWireDeltaShape({
      kind: 'turn.fileChanges.add',
      turnId: 't1',
      fileChanges: [
        {
          id: 'f1',
          sessionId: 's1',
          turnId: 't1',
          filePath: 'src/secret.ts',
          oldPath: null,
          status: 'modified',
          additions: 1,
          deletions: 0,
          diff: '+ const apiKey = "sk-live"',
          truncated: false,
          binary: false,
          createdAt: '2026-08-23T10:00:00.000Z',
        },
      ],
    })
    expect(shape).toEqual({
      kind: 'turn.fileChanges.add',
      fileChangeCount: 1,
    })
    expect(JSON.stringify(shape)).not.toContain('sk-live')
    expect(JSON.stringify(shape)).not.toContain('secret.ts')
  })
})
