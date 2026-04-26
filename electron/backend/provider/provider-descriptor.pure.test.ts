import { describe, expect, it } from 'vitest'
import {
  buildClaudeDescriptor,
  buildEffortOptions,
  buildFallbackCodexDescriptor,
  buildFallbackPiDescriptor,
  CODEX_ATTACHMENT_CAPABILITY,
  CODEX_MID_RUN_INPUT_CAPABILITY,
  NO_MID_RUN_INPUT_CAPABILITY,
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
    expect(buildClaudeDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'native-event',
    })
    expect(buildFallbackCodexDescriptor().skills).toEqual({
      catalog: 'native-rpc',
      invocation: 'structured-input',
      activationConfirmation: 'none',
    })
    expect(buildFallbackPiDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
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
      midRunInput: CODEX_MID_RUN_INPUT_CAPABILITY,
    })

    expect(normalized.defaultModelId).toBe('gpt-5.4')
    expect(normalized.modelOptions[0]?.defaultEffort).toBe('medium')
    expect(normalized.midRunInput).toEqual(CODEX_MID_RUN_INPUT_CAPABILITY)
    expect(normalized.skills).toEqual({
      catalog: 'unsupported',
      invocation: 'unsupported',
      activationConfirmation: 'none',
    })
  })

  it('defaults unsupported mid-run input capability when normalizing legacy descriptors', () => {
    const normalized = normalizeProviderDescriptor({
      id: 'legacy',
      name: 'Legacy',
      vendorLabel: 'Legacy',
      kind: 'conversation',
      supportsContinuation: false,
      defaultModelId: 'legacy',
      modelOptions: [],
      attachments: CODEX_ATTACHMENT_CAPABILITY,
      midRunInput: undefined as never,
    })

    expect(normalized.midRunInput).toEqual(NO_MID_RUN_INPUT_CAPABILITY)
  })
})
