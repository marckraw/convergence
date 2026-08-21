import { describe, expect, it } from 'vitest'
import {
  describeModelSelectionRefusal,
  isAttentionRequestSummary,
  parseJsonArray,
  queuedInputFromRow,
  resolveAttentionRequestKind,
} from './session.pure'

describe('session pure helpers', () => {
  it('detects attention request summaries', () => {
    expect(isAttentionRequestSummary({ attention: 'needs-approval' })).toBe(
      true,
    )
    expect(isAttentionRequestSummary({ attention: 'needs-input' })).toBe(true)
    expect(isAttentionRequestSummary({ attention: 'none' })).toBe(false)
  })

  it('resolves attention request kind from summary and row payload', () => {
    expect(
      resolveAttentionRequestKind({ attention: 'needs-approval' }, null),
    ).toBe('approval')
    expect(
      resolveAttentionRequestKind({ attention: 'needs-input' }, null),
    ).toBe('input')
    expect(
      resolveAttentionRequestKind(
        { attention: 'needs-input' },
        {
          kind: 'input-request',
          payload_json: JSON.stringify({ request: { kind: 'choice' } }),
        },
      ),
    ).toBe('question')
    expect(
      resolveAttentionRequestKind(
        { attention: 'needs-input' },
        { kind: 'input-request', payload_json: '{bad json' },
      ),
    ).toBe('input')
    expect(resolveAttentionRequestKind({ attention: 'none' }, null)).toBeNull()
  })

  it('parses arrays defensively', () => {
    expect(parseJsonArray<string>('["a","b"]')).toEqual(['a', 'b'])
    expect(parseJsonArray<string>('{"a":1}')).toEqual([])
    expect(parseJsonArray<string>('{bad json')).toEqual([])
  })

  it('maps queued input rows', () => {
    expect(
      queuedInputFromRow({
        id: 'queued-1',
        session_id: 'session-1',
        delivery_mode: 'follow-up',
        provider_account_id: null,
        state: 'queued',
        text: 'continue',
        attachment_ids_json: '["att-1"]',
        skill_selections_json: '[{"providerId":"codex","skillName":"x"}]',
        provider_request_id: null,
        skip_context_injection: 0,
        relays_muted: 0,
        error: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:01.000Z',
      }),
    ).toMatchObject({
      id: 'queued-1',
      sessionId: 'session-1',
      deliveryMode: 'follow-up',
      state: 'queued',
      attachmentIds: ['att-1'],
      skillSelections: [{ providerId: 'codex', skillName: 'x' }],
      skipContextInjection: false,
    })
  })

  /**
   * Only a relay opener sets this (F9). A row that predates the column reads
   * as "inject as normal", which is what every input a person typed means.
   */
  it('reads the opener injection bypass, defaulting to injecting', () => {
    const row = {
      id: 'queued-2',
      session_id: 'session-1',
      delivery_mode: 'follow-up',
      provider_account_id: null,
      state: 'queued',
      text: '/clear',
      attachment_ids_json: '[]',
      skill_selections_json: '[]',
      provider_request_id: null,
      skip_context_injection: 1,
      relays_muted: 0,
      error: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:01.000Z',
    }

    expect(queuedInputFromRow(row).skipContextInjection).toBe(true)
    expect(
      queuedInputFromRow({ ...row, skip_context_injection: null })
        .skipContextInjection,
    ).toBe(false)
  })

  /**
   * A queued message may wait through a whole turn (F10). The mute belongs to
   * the message, so a row written before the column existed reads as "fire",
   * which is what every message meant before the quiet send.
   */
  it('reads the quiet send off a queued input, defaulting to firing', () => {
    const row = {
      id: 'queued-3',
      session_id: 'session-1',
      delivery_mode: 'follow-up' as const,
      provider_account_id: null,
      state: 'queued',
      text: 'quick aside',
      attachment_ids_json: '[]',
      skill_selections_json: '[]',
      provider_request_id: null,
      skip_context_injection: 0,
      relays_muted: 1,
      error: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:01.000Z',
    }

    expect(queuedInputFromRow(row).relaysMuted).toBe(true)
    expect(queuedInputFromRow({ ...row, relays_muted: 0 }).relaysMuted).toBe(
      false,
    )
    expect(queuedInputFromRow({ ...row, relays_muted: null }).relaysMuted).toBe(
      false,
    )
  })
})

describe('describeModelSelectionRefusal (MAR-2550)', () => {
  const idle = {
    status: 'idle',
    attention: 'none',
    hasActiveHandle: false,
  } as const

  it('allows the change on a settled session with no process attached', () => {
    expect(describeModelSelectionRefusal(idle)).toBeNull()
    expect(
      describeModelSelectionRefusal({ ...idle, status: 'completed' }),
    ).toBeNull()
    expect(
      describeModelSelectionRefusal({
        ...idle,
        status: 'failed',
        attention: 'failed',
      }),
    ).toBeNull()
    expect(
      describeModelSelectionRefusal({ ...idle, attention: 'finished' }),
    ).toBeNull()
  })

  it('refuses while a turn is running', () => {
    expect(
      describeModelSelectionRefusal({
        ...idle,
        status: 'running',
        hasActiveHandle: true,
      }),
    ).toMatch(/current turn to finish/)
  })

  it('refuses while the agent is waiting on the human', () => {
    expect(
      describeModelSelectionRefusal({ ...idle, attention: 'needs-input' }),
    ).toMatch(/Answer the agent first/)
    expect(
      describeModelSelectionRefusal({ ...idle, attention: 'needs-approval' }),
    ).toMatch(/Answer the agent first/)
  })

  it('refuses a settled session that still holds a provider process', () => {
    // The load-bearing case: a completed turn whose handle was kept because no
    // continuation token arrived still routes the next message into the live
    // process, which closed over the model it spawned with.
    expect(
      describeModelSelectionRefusal({
        ...idle,
        status: 'completed',
        attention: 'finished',
        hasActiveHandle: true,
      }),
    ).toMatch(/provider process attached/)
  })
})
