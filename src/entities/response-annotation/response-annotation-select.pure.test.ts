import { describe, expect, it } from 'vitest'
import {
  selectAnnotationsForMessage,
  selectPendingAnnotations,
} from './response-annotation-select.pure'
import type { ResponseAnnotation } from './response-annotation.types'

function annotation(
  overrides: Partial<ResponseAnnotation> & { id: string },
): ResponseAnnotation {
  return {
    messageId: 'msg-1',
    quotedText: 'quote',
    prefix: '',
    suffix: '',
    body: 'body',
    kind: 'comment',
    state: 'pending',
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('selectPendingAnnotations', () => {
  it('shows only what the next send will carry', () => {
    const result = selectPendingAnnotations([
      annotation({ id: 'a' }),
      annotation({ id: 'b', state: 'sent' }),
      annotation({ id: 'c' }),
    ])

    expect(result.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('keeps the order it was given', () => {
    const result = selectPendingAnnotations([
      annotation({ id: 'second', createdAt: '2026-08-06T09:00:00.000Z' }),
      annotation({ id: 'first', createdAt: '2026-08-06T11:00:00.000Z' }),
    ])

    expect(result.map((entry) => entry.id)).toEqual(['second', 'first'])
  })
})

describe('selectAnnotationsForMessage', () => {
  it('finds everything anchored to one message, sent included', () => {
    // Sent ones are what a past message keeps showing; dropping them here
    // would erase the record of the exchange having happened.
    const result = selectAnnotationsForMessage(
      [
        annotation({ id: 'a', messageId: 'msg-1' }),
        annotation({ id: 'b', messageId: 'msg-2' }),
        annotation({ id: 'c', messageId: 'msg-1', state: 'sent' }),
      ],
      'msg-1',
    )

    expect(result.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('answers nothing for a message nobody annotated', () => {
    expect(
      selectAnnotationsForMessage([annotation({ id: 'a' })], 'msg-other'),
    ).toEqual([])
  })
})
