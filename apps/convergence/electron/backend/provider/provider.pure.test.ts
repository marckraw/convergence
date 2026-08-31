import { describe, expect, it } from 'vitest'
import { isConversationalProvider } from './provider.pure'

describe('isConversationalProvider', () => {
  it('returns true for conversation-kind descriptors', () => {
    expect(isConversationalProvider({ kind: 'conversation' })).toBe(true)
  })

  it('returns false for shell-kind descriptors', () => {
    expect(isConversationalProvider({ kind: 'shell' })).toBe(false)
  })
})
