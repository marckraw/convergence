import { describe, expect, it } from 'vitest'
import { resolveProviderIcon } from './provider-icon.pure'

describe('provider logo identity', () => {
  it.each([
    ['claude-code', 'anthropic'],
    ['codex', 'openai'],
    ['pi', 'pi'],
    ['cursor', 'cursor'],
    ['antigravity', 'google'],
    ['openrouter', 'openrouter'],
  ])('maps %s to %s', (id, brand) => {
    expect(resolveProviderIcon(id).brand).toBe(brand)
  })

  it('keeps the harness identity even when its display text mentions another model vendor', () => {
    expect(resolveProviderIcon('pi', 'Anthropic', 'Claude Code').brand).toBe(
      'pi',
    )
    expect(resolveProviderIcon('cursor', 'OpenAI', 'GPT').brand).toBe('cursor')
  })

  it.each(['rapid', 'my-codex-proxy', 'constructor', '__proto__'])(
    'does not assign a known brand to unknown ID %s',
    (id) => {
      expect(resolveProviderIcon(id, 'Custom Provider')).toEqual({
        brand: null,
        label: 'Custom Provider',
        initials: 'CP',
      })
    },
  )

  it('uses a vendor when no provider ID exists and preserves unknown-provider initials', () => {
    expect(resolveProviderIcon(null, ' OpenAI ').brand).toBe('openai')
    expect(resolveProviderIcon('custom-agent').initials).toBe('CA')
    expect(resolveProviderIcon().label).toBe('Unknown provider')
  })
})
