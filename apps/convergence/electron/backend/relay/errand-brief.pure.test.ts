import { describe, expect, it } from 'vitest'
import { composeErrandBrief } from './errand-brief.pure'

describe('composeErrandBrief', () => {
  it('names Any-finish delivery without a baton (mutation: emit a BATON line)', () => {
    expect(
      composeErrandBrief(
        { roleCard: 'You are the reviewer.', returnWire: { instruction: '' } },
        'Studio — Fable',
        'Review this branch.\nKeep the report concise.',
      ),
    ).toBe(
      'You are the reviewer.\n\nWhen you finish, your last message is delivered to Studio — Fable — make it the report.\n\nReview this branch.\nKeep the report concise.',
    )
  })

  it('keeps the card and payload without return instructions (mutation: emit delivery without a return wire)', () => {
    expect(
      composeErrandBrief(
        { roleCard: 'You are the reviewer.', returnWire: null },
        'Studio — Fable',
        'Review this branch.\nKeep the report concise.',
      ),
    ).toBe(
      'You are the reviewer.\n\nReview this branch.\nKeep the report concise.',
    )
  })

  it.each([null, { instruction: '' }])(
    'preserves the payload bytes when the role card is null: %j (mutation: add a delivery line without a role card)',
    (returnWire) => {
      const payload = '  Review this branch.\n\nKeep this spacing.\n'
      expect(
        composeErrandBrief({ roleCard: null, returnWire }, 'Fable', payload),
      ).toBe(payload)
    },
  )
})
