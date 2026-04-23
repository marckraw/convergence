import { describe, expect, it } from 'vitest'
import {
  buildClaudeDescriptor,
  buildEffortOptions,
  buildFallbackCodexDescriptor,
  buildFallbackPiDescriptor,
  CODEX_ATTACHMENT_CAPABILITY,
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
    expect(buildFallbackPiDescriptor().vendorLabel).toBe('Pi')
  })

  it('exposes pi-compatible effort options on the pi fallback descriptor', () => {
    const descriptor = buildFallbackPiDescriptor()
    const effortIds = descriptor.modelOptions[0]?.effortOptions.map(
      (option) => option.id,
    )
    expect(effortIds).toEqual([
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  it('normalizes invalid default model and effort values', () => {
    const normalized = normalizeProviderDescriptor({
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
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
      attachments: CODEX_ATTACHMENT_CAPABILITY,
    })

    expect(normalized.defaultModelId).toBe('gpt-5.4')
    expect(normalized.modelOptions[0]?.defaultEffort).toBe('medium')
  })
})
