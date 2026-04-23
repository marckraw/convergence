import { describe, expect, it } from 'vitest'
import {
  getProviderDisplayLabel,
  resolveProviderSelection,
} from './provider-selection.pure'
import type { ProviderAttachmentCapability } from './session.types'

const TEST_ATTACHMENTS: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

const providers = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation' as const,
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
    attachments: TEST_ATTACHMENTS,
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    kind: 'conversation' as const,
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
    attachments: TEST_ATTACHMENTS,
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

  it('uses stored defaults when explicit selections are missing', () => {
    const selection = resolveProviderSelection(providers, null, null, null, {
      providerId: 'codex',
      modelId: 'gpt-5.3-codex',
      effortId: 'xhigh',
    })

    expect(selection.providerId).toBe('codex')
    expect(selection.modelId).toBe('gpt-5.3-codex')
    expect(selection.effortId).toBe('xhigh')
  })

  it('ignores stored provider when it is not registered', () => {
    const selection = resolveProviderSelection(providers, null, null, null, {
      providerId: 'ghost',
      modelId: 'something',
      effortId: 'high',
    })

    expect(selection.providerId).toBe('claude-code')
    expect(selection.modelId).toBe('sonnet')
    expect(selection.effortId).toBe('medium')
  })

  it('ignores stored model when it does not belong to the resolved provider', () => {
    const selection = resolveProviderSelection(
      providers,
      'claude-code',
      null,
      null,
      {
        providerId: 'codex',
        modelId: 'gpt-5.3-codex',
        effortId: 'xhigh',
      },
    )

    expect(selection.providerId).toBe('claude-code')
    expect(selection.modelId).toBe('sonnet')
    expect(selection.effortId).toBe('medium')
  })

  it('ignores stored effort when it is not offered by the resolved model', () => {
    const selection = resolveProviderSelection(providers, null, null, null, {
      providerId: 'codex',
      modelId: 'gpt-5.4',
      effortId: 'xhigh',
    })

    expect(selection.providerId).toBe('codex')
    expect(selection.modelId).toBe('gpt-5.4')
    expect(selection.effortId).toBe('medium')
  })

  it('explicit selection still wins over stored defaults', () => {
    const selection = resolveProviderSelection(
      providers,
      'claude-code',
      'sonnet',
      'high',
      {
        providerId: 'codex',
        modelId: 'gpt-5.3-codex',
        effortId: 'xhigh',
      },
    )

    expect(selection.providerId).toBe('claude-code')
    expect(selection.modelId).toBe('sonnet')
    expect(selection.effortId).toBe('high')
  })
})
