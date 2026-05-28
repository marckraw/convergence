import { describe, expect, it } from 'vitest'
import {
  buildNamingPrompt,
  isAssistantMessageItem,
  isUserMessageItem,
  sanitizeTitle,
} from './session-naming.pure'
import type { ConversationItem } from '../conversation-item.types'

describe('buildNamingPrompt', () => {
  it('includes both turns', () => {
    const prompt = buildNamingPrompt({
      firstUserMessage: 'refactor the auth',
      firstAssistantResponse: 'ok, here is a plan',
    })
    expect(prompt).toContain('User: refactor the auth')
    expect(prompt).toContain('Assistant: ok, here is a plan')
  })

  it('caps long inputs', () => {
    const long = 'a'.repeat(5000)
    const prompt = buildNamingPrompt({
      firstUserMessage: long,
      firstAssistantResponse: long,
    })
    expect(prompt.length).toBeLessThan(5000)
    expect(prompt).toContain('…')
  })
})

describe('sanitizeTitle', () => {
  it('trims and accepts plain titles', () => {
    expect(sanitizeTitle('  Refactor Auth Module  ')).toBe(
      'Refactor Auth Module',
    )
  })

  it('strips surrounding quotes and trailing punctuation', () => {
    expect(sanitizeTitle('"Refactor Auth Module."')).toBe(
      'Refactor Auth Module',
    )
    expect(sanitizeTitle('“Explore Codebase”')).toBe('Explore Codebase')
  })

  it('uses the first line only', () => {
    expect(sanitizeTitle('Refactor Auth Module\n\nDetails below')).toBe(
      'Refactor Auth Module',
    )
  })

  it('rejects empty and too-long titles', () => {
    expect(sanitizeTitle('')).toBeNull()
    expect(sanitizeTitle('   ')).toBeNull()
    expect(sanitizeTitle('a'.repeat(200))).toBeNull()
  })
})

describe('conversation item guards', () => {
  it('detects user and assistant message items', () => {
    const user: ConversationItem = {
      id: 'item-1',
      sessionId: 'session-1',
      sequence: 1,
      turnId: null,
      kind: 'message',
      state: 'complete',
      actor: 'user',
      text: 'hello',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      providerMeta: {
        providerId: 'test',
        providerItemId: null,
        providerEventType: null,
      },
    }
    const assistant = {
      ...user,
      id: 'item-2',
      sequence: 2,
      actor: 'assistant',
    } as ConversationItem
    const tool = {
      ...user,
      id: 'item-3',
      sequence: 3,
      actor: 'tool',
    } as unknown as ConversationItem

    expect(isUserMessageItem(user)).toBe(true)
    expect(isUserMessageItem(assistant)).toBe(false)
    expect(isAssistantMessageItem(assistant)).toBe(true)
    expect(isAssistantMessageItem(tool)).toBe(false)
  })
})
