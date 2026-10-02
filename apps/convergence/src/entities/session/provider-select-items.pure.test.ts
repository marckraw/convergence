import { describe, expect, it } from 'vitest'
import {
  effortSelectItems,
  providerSelectItems,
} from './provider-select-items.pure'
import type { ProviderInfo, ProviderModelOption } from './session.types'

function provider(overrides: Partial<ProviderInfo> & Pick<ProviderInfo, 'id'>) {
  return {
    name: overrides.id,
    vendorLabel: '',
    kind: 'conversation',
    supportsContinuation: true,
    supportsConversationReset: false,
    defaultModelId: '',
    modelOptions: [],
    attachments: {
      supportsImage: false,
      supportsPdf: false,
      supportsText: false,
      maxImageBytes: 0,
      maxPdfBytes: 0,
      maxTextBytes: 0,
      maxTotalBytes: 0,
    },
    midRunInput: {
      supportsAnswer: false,
      supportsNativeFollowUp: false,
      supportsAppQueuedFollowUp: false,
      supportsSteer: false,
      supportsInterrupt: false,
      defaultRunningMode: null,
    },
    ...overrides,
  } as ProviderInfo
}

const claude = provider({
  id: 'claude-code',
  name: 'Claude Code',
  vendorLabel: 'Anthropic',
})
const pi = provider({ id: 'pi', name: 'Pi', vendorLabel: 'Pi' })
const antigravity = provider({
  id: 'antigravity',
  name: 'Antigravity',
  vendorLabel: 'Google',
})

describe('providerSelectItems (CONV-17)', () => {
  it('says the vendor, with the provider’s own name under it when they differ', () => {
    expect(providerSelectItems([{ descriptor: claude }])).toEqual([
      {
        id: 'claude-code',
        label: 'Anthropic',
        description: 'Claude Code',
        badge: undefined,
        disabled: false,
        vendorLabel: 'Anthropic',
        name: 'Claude Code',
      },
    ])
    expect(providerSelectItems([{ descriptor: pi }])[0]).toMatchObject({
      label: 'Pi',
      description: undefined,
    })
  })

  it('falls back to the provider’s name when it has no vendor', () => {
    expect(
      providerSelectItems([
        { descriptor: provider({ id: 'shell', name: 'Shell' }) },
      ])[0],
    ).toMatchObject({ label: 'Shell', description: undefined })
  })

  it('lists a provider this machine won’t run, disabled, with why in place of its name', () => {
    expect(
      providerSelectItems([
        { descriptor: claude, blockedReason: 'Not installed on grok-mac.' },
      ])[0],
    ).toMatchObject({
      label: 'Anthropic',
      description: 'Not installed on grok-mac.',
      disabled: true,
    })
  })

  it('marks an early provider ALPHA', () => {
    expect(
      providerSelectItems([{ descriptor: antigravity, blockedReason: null }])[0]
        ?.badge,
    ).toEqual({ label: 'ALPHA', title: expect.any(String) })
  })
})

describe('effortSelectItems (CONV-17)', () => {
  const model: ProviderModelOption = {
    id: 'sonnet',
    label: 'Claude Sonnet',
    defaultEffort: 'medium',
    effortOptions: [
      { id: 'low', label: 'Low' },
      { id: 'high', label: 'High', description: 'Thinks longer.' },
    ],
  } as ProviderModelOption

  it('lists the model’s efforts, with what each means', () => {
    expect(effortSelectItems({ model, effort: null })).toEqual([
      { id: 'low', label: 'Low', description: undefined },
      { id: 'high', label: 'High', description: 'Thinks longer.' },
    ])
  })

  it('keeps a stranded row’s effort, alone, when there is no model', () => {
    expect(
      effortSelectItems({
        model: null,
        effort: { id: 'high', label: 'High' },
      }),
    ).toEqual([{ id: 'high', label: 'High', description: undefined }])
  })

  it('is empty with neither', () => {
    expect(effortSelectItems({ model: null, effort: null })).toEqual([])
  })
})
