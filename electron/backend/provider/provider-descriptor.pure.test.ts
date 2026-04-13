import { describe, expect, it } from 'vitest'
import {
  buildClaudeDescriptor,
  buildEffortOptions,
  buildFallbackCodexDescriptor,
  normalizeProviderDescriptor,
} from './provider-descriptor.pure'

describe('provider-descriptor', () => {
  it('builds labeled effort options', () => {
    expect(
      buildEffortOptions(['minimal', 'high'], { high: 'Deep reasoning' }),
    ).toEqual([
      { id: 'minimal', label: 'Minimal', description: undefined },
      { id: 'high', label: 'High', description: 'Deep reasoning' },
    ])
  })

  it('returns the expected built-in provider descriptors', () => {
    expect(buildClaudeDescriptor().vendorLabel).toBe('Anthropic')
    expect(buildFallbackCodexDescriptor().vendorLabel).toBe('OpenAI')
  })

  it('normalizes invalid default model and effort values', () => {
    const normalized = normalizeProviderDescriptor({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      supportsContinuation: true,
      defaultModelId: 'missing',
      modelOptions: [
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          defaultEffort: 'xhigh',
          effortOptions: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
          ],
        },
      ],
    })

    expect(normalized.defaultModelId).toBe('gpt-5.4')
    expect(normalized.modelOptions[0]?.defaultEffort).toBe('medium')
  })
})
