import { describe, expect, it } from 'vitest'
import {
  getProviderDisplayLabel,
  resolveProviderSelection,
} from './provider-selection.pure'

const providers = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium' as const,
        effortOptions: [
          { id: 'low' as const, label: 'Low' },
          { id: 'medium' as const, label: 'Medium' },
          { id: 'high' as const, label: 'High' },
        ],
      },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    supportsContinuation: true,
    defaultModelId: 'gpt-5.4',
    modelOptions: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        defaultEffort: 'medium' as const,
        effortOptions: [
          { id: 'minimal' as const, label: 'Minimal' },
          { id: 'medium' as const, label: 'Medium' },
          { id: 'high' as const, label: 'High' },
        ],
      },
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        defaultEffort: 'high' as const,
        effortOptions: [
          { id: 'low' as const, label: 'Low' },
          { id: 'medium' as const, label: 'Medium' },
          { id: 'high' as const, label: 'High' },
          { id: 'xhigh' as const, label: 'Very High' },
        ],
      },
    ],
  },
]

describe('resolveProviderSelection', () => {
  it('uses the vendor label for provider display text', () => {
    expect(getProviderDisplayLabel(providers[0]!)).toBe('Anthropic')
  })

  it('falls back to the first provider and its defaults', () => {
    const selection = resolveProviderSelection(providers, null, null, null)

    expect(selection.providerId).toBe('claude-code')
    expect(selection.modelId).toBe('sonnet')
    expect(selection.effortId).toBe('medium')
  })

  it('keeps an explicitly selected model and valid effort', () => {
    const selection = resolveProviderSelection(
      providers,
      'codex',
      'gpt-5.3-codex',
      'xhigh',
    )

    expect(selection.providerLabel).toBe('OpenAI')
    expect(selection.modelId).toBe('gpt-5.3-codex')
    expect(selection.effortId).toBe('xhigh')
  })

  it('resets effort when the selected model does not support it', () => {
    const selection = resolveProviderSelection(
      providers,
      'codex',
      'gpt-5.4',
      'xhigh',
    )

    expect(selection.modelId).toBe('gpt-5.4')
    expect(selection.effortId).toBe('medium')
  })
})
