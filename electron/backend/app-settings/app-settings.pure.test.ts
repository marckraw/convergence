import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import type {
  ProviderAttachmentCapability,
  ProviderDescriptor,
} from '../provider/provider.types'
import { DEFAULT_UPDATE_PREFS } from '../updates/updates.defaults'
import {
  parseAppSettings,
  parseModelMap,
  parseNotificationPrefs,
  resolveGuidedReviewModelFromSettings,
  resolveSessionDefaultsFromSettings,
  validateAppSettings,
  validatePiModelVisibility,
} from './app-settings.pure'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
} from './app-settings.types'

const TEST_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 0,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

function buildDescriptors(): ProviderDescriptor[] {
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      vendorLabel: 'Anthropic',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'sonnet',
      modelOptions: [
        {
          id: 'opus',
          label: 'Claude Opus',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
            { id: 'max', label: 'Max' },
          ],
        },
        {
          id: 'sonnet',
          label: 'Claude Sonnet',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
          ],
        },
      ],
      attachments: TEST_ATTACHMENT_CAPABILITY,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    },
    {
      id: 'pi',
      name: 'Pi Agent',
      vendorLabel: 'Pi',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'openrouter/custom',
      modelOptions: [
        {
          id: 'openrouter/custom',
          label: 'OpenRouter Custom',
          defaultEffort: 'medium',
          effortOptions: [{ id: 'medium', label: 'Medium' }],
          source: 'pi-models-json',
        },
        {
          id: 'github-copilot/gpt-5.5',
          label: 'GitHub Copilot GPT-5.5',
          defaultEffort: 'medium',
          effortOptions: [{ id: 'medium', label: 'Medium' }],
          source: 'provider',
        },
      ],
      attachments: TEST_ATTACHMENT_CAPABILITY,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    },
  ]
}

describe('app-settings pure helpers', () => {
  it('parses model maps without accepting invalid values', () => {
    expect(
      parseModelMap({
        'claude-code': 'sonnet',
        codex: '',
        pi: 123,
      }),
    ).toEqual({ 'claude-code': 'sonnet' })
  })

  it('parses malformed settings as default settings', () => {
    expect(parseAppSettings('{not json')).toEqual({
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      guidedReviewModelByProvider: {},
      commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
      debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
      favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
    })
  })

  it('parses command center shortcut prefs with defaults', () => {
    expect(parseAppSettings(null).commandCenterShortcut).toEqual({
      key: 'k',
      shiftKey: false,
      altKey: false,
    })
    expect(
      parseAppSettings(
        JSON.stringify({
          commandCenterShortcut: { key: 'P', shiftKey: true, altKey: false },
        }),
      ).commandCenterShortcut,
    ).toEqual({ key: 'p', shiftKey: true, altKey: false })
  })

  it('hydrates notification prefs per field', () => {
    expect(
      parseNotificationPrefs({
        enabled: false,
        toasts: 'yes',
        events: { finished: false },
      }),
    ).toEqual({
      ...DEFAULT_NOTIFICATION_PREFS,
      enabled: false,
      events: {
        ...DEFAULT_NOTIFICATION_PREFS.events,
        finished: false,
      },
    })
  })

  it('validates app settings against provider descriptors', () => {
    const descriptors = buildDescriptors()
    const settings = parseAppSettings(
      JSON.stringify({
        defaultProviderId: 'claude-code',
        defaultModelId: 'ghost',
        defaultEffortId: 'medium',
        namingModelByProvider: {
          'claude-code': 'sonnet',
          ghost: 'model',
        },
      }),
    )

    expect(validateAppSettings(settings, descriptors)).toMatchObject({
      defaultProviderId: 'claude-code',
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider: { 'claude-code': 'sonnet' },
    })
  })

  it('normalizes legacy Pi Codex model visibility ids', () => {
    expect(
      validatePiModelVisibility(
        { additionalModelIds: ['openai-codex/gpt-5.5'] },
        buildDescriptors(),
      ),
    ).toEqual({ additionalModelIds: ['github-copilot/gpt-5.5'] })
  })

  it('resolves session defaults from validated settings', () => {
    const descriptors = buildDescriptors()
    const settings = parseAppSettings(
      JSON.stringify({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'high',
      }),
    )

    expect(resolveSessionDefaultsFromSettings(settings, descriptors)).toEqual({
      providerId: 'claude-code',
      modelId: 'sonnet',
      effortId: 'high',
    })
  })

  it('resolves guided review defaults to Opus with medium effort for Claude Code', () => {
    const descriptor = buildDescriptors()[0]!
    const settings = parseAppSettings(null)

    expect(resolveGuidedReviewModelFromSettings(settings, descriptor)).toEqual({
      modelId: 'opus',
      effortId: 'medium',
    })
  })

  it('keeps configured guided review model overrides when valid', () => {
    const descriptor = buildDescriptors()[0]!
    const settings = parseAppSettings(
      JSON.stringify({
        guidedReviewModelByProvider: { 'claude-code': 'sonnet' },
      }),
    )

    expect(resolveGuidedReviewModelFromSettings(settings, descriptor)).toEqual({
      modelId: 'sonnet',
      effortId: 'medium',
    })
  })
})
