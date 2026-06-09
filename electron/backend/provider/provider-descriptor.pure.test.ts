import { describe, expect, it } from 'vitest'
import {
  buildClaudeDescriptor,
  buildEffortOptions,
  buildFallbackAntigravityDescriptor,
  buildFallbackCodexDescriptor,
  buildFallbackCursorDescriptor,
  buildFallbackPiDescriptor,
  CODEX_ATTACHMENT_CAPABILITY,
  CODEX_MID_RUN_INPUT_CAPABILITY,
  getMidRunInputCapabilityForProviderId,
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
    expect(buildFallbackCursorDescriptor().vendorLabel).toBe('Anysphere')
    expect(buildFallbackAntigravityDescriptor().vendorLabel).toBe('Google')
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
    expect(buildFallbackCursorDescriptor().skills).toEqual({
      catalog: 'native-rpc',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
    expect(buildFallbackAntigravityDescriptor().skills).toEqual({
      catalog: 'filesystem',
      invocation: 'native-command',
      activationConfirmation: 'none',
    })
  })

  it('exposes current Claude Code aliases and pinned Anthropic model IDs', () => {
    const descriptor = buildClaudeDescriptor()

    expect(descriptor.defaultModelId).toBe('sonnet')
    expect(descriptor.fastModelId).toBe('haiku')
    expect(descriptor.modelOptions.map((option) => option.id)).toEqual([
      'best',
      'fable',
      'sonnet',
      'opus',
      'haiku',
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-haiku-4-5',
    ])
    expect(
      descriptor.modelOptions.find((option) => option.id === 'fable'),
    ).toMatchObject({
      label: 'Claude Fable 5',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Very High' },
        { id: 'max', label: 'Max' },
      ],
    })
    expect(
      descriptor.modelOptions.find((option) => option.id === 'claude-opus-4-8'),
    ).toMatchObject({
      label: 'Claude Opus 4.8',
      contextWindowTokens: 1_000_000,
      defaultEffort: 'high',
    })
  })

  it('builds a conservative Cursor fallback descriptor from P0 ACP decisions', () => {
    const descriptor = buildFallbackCursorDescriptor()

    expect(descriptor).toMatchObject({
      id: 'cursor',
      name: 'Cursor',
      supportsContinuation: true,
      defaultModelId: 'default[]',
      attachments: {
        supportsImage: true,
        supportsPdf: false,
        supportsText: true,
      },
      midRunInput: {
        supportsAnswer: true,
        supportsNativeFollowUp: false,
        supportsAppQueuedFollowUp: true,
        supportsSteer: false,
        supportsInterrupt: false,
      },
      interactions: {
        inputRequests: ['choice', 'plan'],
        passiveUpdates: ['todos', 'task', 'generated-image'],
        unavailable: ['generated-image-artifact-rendering'],
      },
      telemetry: {
        contextWindow: { availability: 'partial', source: 'model-metadata' },
        quota: { availability: 'unavailable', source: 'manual' },
      },
    })
    expect(descriptor.settings?.links?.[0]).toEqual({
      label: 'Cursor dashboard',
      url: 'https://cursor.com/dashboard',
    })
    expect(descriptor.modelOptions).toEqual([
      {
        id: 'default[]',
        label: 'Auto',
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text', 'image'],
        source: 'provider',
      },
    ])
    expect(getMidRunInputCapabilityForProviderId('cursor')).toEqual(
      descriptor.midRunInput,
    )
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

  it('exposes Antigravity official models as model + effort options', () => {
    const descriptor = buildFallbackAntigravityDescriptor()

    expect(descriptor).toMatchObject({
      id: 'antigravity',
      name: 'Antigravity CLI',
      defaultModelId: 'gemini-3.5-flash',
      fastModelId: 'gemini-3.5-flash',
      attachments: {
        supportsImage: false,
        supportsPdf: false,
        supportsText: true,
      },
      midRunInput: {
        supportsAnswer: false,
        supportsNativeFollowUp: false,
        supportsAppQueuedFollowUp: true,
        supportsSteer: false,
        supportsInterrupt: false,
      },
    })
    expect(descriptor.modelOptions.map((option) => option.id)).toEqual([
      'gemini-3.1-pro',
      'gemini-3.5-flash',
      'gemini-3-flash',
      'claude-sonnet-4.6-thinking',
      'claude-opus-4.6-thinking',
      'gpt-oss-120b',
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
