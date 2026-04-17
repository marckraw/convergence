import { describe, expect, it } from 'vitest'
import { buildNamingPrompt, sanitizeTitle } from './session-naming.pure'

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
