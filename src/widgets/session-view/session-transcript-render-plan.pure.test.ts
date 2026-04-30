import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import { buildConversationRenderPlan } from './session-transcript-render-plan.pure'

const base = {
  sessionId: 'session-1',
  state: 'complete' as const,
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  providerMeta: {
    providerId: 'claude-code',
    providerItemId: null,
    providerEventType: null,
  },
}

function bootContextNote(sequence: number, text: string): ConversationItem {
  return {
    ...base,
    id: `note-${sequence}`,
    sequence,
    turnId: null,
    kind: 'note',
    level: 'info',
    text,
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'context.boot',
    },
  }
}

function userMessage(sequence: number, text: string): ConversationItem {
  return {
    ...base,
    id: `user-${sequence}`,
    sequence,
    turnId: `turn-${sequence}`,
    kind: 'message',
    actor: 'user',
    text,
  }
}

describe('buildConversationRenderPlan', () => {
  it('hides boot context notes and attaches their text to the next user message', () => {
    const note = bootContextNote(
      1,
      '<project:context>\npath\n</project:context>',
    )
    const message = userMessage(2, 'do you know the path?')

    expect(buildConversationRenderPlan([note, message])).toEqual([
      {
        item: message,
        injectedContextText: '<project:context>\npath\n</project:context>',
      },
    ])
  })

  it('keeps non-context notes as normal transcript entries', () => {
    const note: ConversationItem = {
      ...base,
      id: 'note-normal',
      sequence: 1,
      turnId: null,
      kind: 'note',
      level: 'info',
      text: 'Session resumed',
    }
    const message = userMessage(2, 'continue')

    expect(buildConversationRenderPlan([note, message])).toEqual([
      { item: note, injectedContextText: null },
      { item: message, injectedContextText: null },
    ])
  })

  it('renders orphaned boot context notes rather than dropping them', () => {
    const note = bootContextNote(1, '<project:context />')

    expect(buildConversationRenderPlan([note])).toEqual([
      { item: note, injectedContextText: null },
    ])
  })
})
