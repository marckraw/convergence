import { describe, expect, it } from 'vitest'
import {
  getProviderDisplayLabel,
  getProviderLifecycleBadge,
  isModelSelectionLocked,
  resolveProviderSelection,
  resolveSessionModelSelectionWrite,
  scopeModelCatalogToProvider,
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

const TEST_MID_RUN_INPUT = {
  supportsAnswer: false,
  supportsNativeFollowUp: false,
  supportsAppQueuedFollowUp: false,
  supportsSteer: false,
  supportsInterrupt: false,
  defaultRunningMode: null,
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
    midRunInput: TEST_MID_RUN_INPUT,
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
    midRunInput: TEST_MID_RUN_INPUT,
  },
]

describe('resolveProviderSelection', () => {
  it('uses the vendor label for provider display text', () => {
    expect(getProviderDisplayLabel(providers[0]!)).toBe('Anthropic')
  })

  it('marks Antigravity as alpha for provider selectors', () => {
    const antigravity = {
      ...providers[0]!,
      id: 'antigravity',
      name: 'Antigravity CLI',
      vendorLabel: 'Google',
    }

    expect(getProviderLifecycleBadge(antigravity)).toEqual({
      label: 'ALPHA',
      title:
        'Antigravity support is early: tool visibility is post-run and provider telemetry is limited.',
    })
    expect(getProviderLifecycleBadge(providers[0]!)).toBeNull()
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

describe('isModelSelectionLocked (MAR-2550)', () => {
  it('leaves a draft composer with no session unlocked', () => {
    expect(isModelSelectionLocked(null)).toBe(false)
  })

  it('unlocks a session that has come to rest', () => {
    expect(
      isModelSelectionLocked({ status: 'completed', attention: 'finished' }),
    ).toBe(false)
    expect(isModelSelectionLocked({ status: 'idle', attention: 'none' })).toBe(
      false,
    )
    expect(
      isModelSelectionLocked({ status: 'failed', attention: 'failed' }),
    ).toBe(false)
  })

  it('locks a running turn', () => {
    expect(
      isModelSelectionLocked({ status: 'running', attention: 'none' }),
    ).toBe(true)
  })

  it('locks a turn that is waiting on the human', () => {
    // The handle is still alive behind an unanswered question, so a change
    // here could only apply to the turn after this one.
    expect(
      isModelSelectionLocked({ status: 'idle', attention: 'needs-input' }),
    ).toBe(true)
    expect(
      isModelSelectionLocked({ status: 'idle', attention: 'needs-approval' }),
    ).toBe(true)
  })
})

describe('scopeModelCatalogToProvider (MAR-2550)', () => {
  it('shows an existing session its own provider and nothing else', () => {
    // The escape this closes: the model dialog reports a provider with every
    // pick, so a catalog holding two providers was a second provider switch.
    const scoped = scopeModelCatalogToProvider(providers, 'claude-code')

    expect(scoped.map((provider) => provider.id)).toEqual(['claude-code'])
  })

  it('leaves a draft the whole catalog', () => {
    // Before a session exists there is no provider to be locked to, and
    // choosing across providers is the point of the dialog.
    expect(scopeModelCatalogToProvider(providers, null)).toBe(providers)
    expect(scopeModelCatalogToProvider(providers, undefined)).toBe(providers)
  })

  it('scopes a departed provider to nothing rather than to everything', () => {
    // A provider missing from the catalog must read as an empty picker. The
    // tempting fallback -- show everything when the match fails -- reopens the
    // door in exactly the case where the session is least understood.
    expect(scopeModelCatalogToProvider(providers, 'pi')).toEqual([])
  })
})

describe('resolveSessionModelSelectionWrite (MAR-2550)', () => {
  const claudeSession = { providerId: 'claude-code' }

  it('resolves a pick from the session own provider into a row write', () => {
    expect(
      resolveSessionModelSelectionWrite(
        providers,
        claudeSession,
        'claude-code',
        'sonnet',
      ),
    ).toEqual({ providerId: 'claude-code', model: 'sonnet', effort: 'medium' })
  })

  it('refuses a pick that belongs to another provider', () => {
    // The bug in full: this pick used to be written as { model: 'gpt-5.4' }
    // with the Codex provider silently dropped, and the next Claude turn
    // spawned with a Codex model id.
    expect(
      resolveSessionModelSelectionWrite(
        providers,
        claudeSession,
        'codex',
        'gpt-5.4',
      ),
    ).toBeNull()
  })

  it('refuses when the session provider has left the catalog', () => {
    // Nothing resolves to `pi`, so the selection lands on some other provider.
    // Refusing beats writing a model the session cannot run.
    expect(
      resolveSessionModelSelectionWrite(
        providers,
        { providerId: 'pi' },
        null,
        'sonnet',
      ),
    ).toBeNull()
  })

  it('defaults an unstated provider to the session own', () => {
    expect(
      resolveSessionModelSelectionWrite(
        providers,
        claudeSession,
        null,
        'sonnet',
      ),
    ).toEqual({ providerId: 'claude-code', model: 'sonnet', effort: 'medium' })
  })
})
