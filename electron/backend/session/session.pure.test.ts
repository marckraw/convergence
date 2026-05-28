import { describe, expect, it } from 'vitest'
import {
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
        state: 'queued',
        text: 'continue',
        attachment_ids_json: '["att-1"]',
        skill_selections_json: '[{"providerId":"codex","skillName":"x"}]',
        provider_request_id: null,
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
    })
  })
})
