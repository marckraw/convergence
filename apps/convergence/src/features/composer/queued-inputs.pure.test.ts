import { describe, expect, it } from 'vitest'
import type { SessionQueuedInput } from '@/entities/session'
import { queuedInputPreview, queuedInputViews } from './queued-inputs.pure'

const queued = (
  overrides: Partial<SessionQueuedInput> = {},
): SessionQueuedInput => ({
  id: 'q-1',
  sessionId: 's-1',
  deliveryMode: 'follow-up',
  state: 'queued',
  text: 'Then run the gates',
  attachmentIds: [],
  skillSelections: [],
  providerRequestId: null,
  queuePosition: 1,
  redeliveredBy: false,
  error: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  ...overrides,
})

describe('queuedInputPreview (CONV-30)', () => {
  it('reads its words, or what it carries when it has none', () => {
    expect(queuedInputPreview({ text: '  hi ', attachmentIds: [] })).toBe('hi')
    expect(queuedInputPreview({ text: ' ', attachmentIds: ['a'] })).toBe(
      '1 attachment',
    )
    expect(queuedInputPreview({ text: '', attachmentIds: ['a', 'b'] })).toBe(
      '2 attachments',
    )
    expect(queuedInputPreview({ text: '', attachmentIds: [] })).toBe(
      'Empty input',
    )
  })
})

describe('queuedInputViews (CONV-30)', () => {
  it('says how it goes and when (MAR-2971 R1)', () => {
    expect(queuedInputViews([queued()], false)).toEqual([
      {
        id: 'q-1',
        mode: 'Follow-up',
        state: 'Waiting for the next turn',
        preview: 'Then run the gates',
        error: null,
        canDeliverNow: false,
        cancelUnavailable: null,
      },
    ])
  })

  it('says a waiting one waits for compaction while the conversation compacts (MAR-3288 R7)', () => {
    expect(queuedInputViews([queued()], true)[0]?.state).toBe(
      'Waits for compaction',
    )
    expect(
      queuedInputViews([queued({ state: 'dispatching' })], true)[0]?.state,
    ).toBe('Dispatching')
  })

  it('offers Deliver now on a failed row, once (MAR-2971 lap 5)', () => {
    const [failed, replaced] = queuedInputViews(
      [
        queued({ state: 'failed', error: 'Provider refused' }),
        queued({ id: 'q-2', state: 'failed', redeliveredBy: true }),
      ],
      false,
    )
    expect(failed).toMatchObject({
      state: 'Failed',
      error: 'Provider refused',
      canDeliverNow: true,
    })
    expect(replaced?.canDeliverNow).toBe(false)
  })

  it('says why a delivered, delivering or cancelled one can’t be cancelled (R2)', () => {
    expect(
      queuedInputViews(
        [
          queued({ state: 'dispatching' }),
          queued({ state: 'sent' }),
          queued({ state: 'cancelled' }),
          queued({ state: 'failed' }),
        ],
        false,
      ).map((view) => view.cancelUnavailable),
    ).toEqual([
      'It is being delivered now.',
      'It was delivered already.',
      'It was cancelled already.',
      null,
    ])
  })

  it('names steer and interrupt', () => {
    expect(
      queuedInputViews(
        [
          queued({ deliveryMode: 'steer' }),
          queued({ deliveryMode: 'interrupt' }),
        ],
        false,
      ).map((view) => view.mode),
    ).toEqual(['Steer', 'Interrupt'])
  })
})
