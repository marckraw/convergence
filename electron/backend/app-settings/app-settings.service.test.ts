import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import { StateService } from '../state/state.service'
import type {
  ProviderAttachmentCapability,
  ProviderDescriptor,
} from '../provider/provider.types'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import { DEFAULT_UPDATE_PREFS } from '../updates/updates.defaults'
import { AppSettingsService, APP_SETTINGS_KEY } from './app-settings.service'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_ONBOARDING_PREFS,
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
          id: 'sonnet',
          label: 'Claude Sonnet',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
          ],
        },
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
      ],
      attachments: TEST_ATTACHMENT_CAPABILITY,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    },
    {
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'gpt-5.4',
      modelOptions: [
        {
          id: 'gpt-5.4',
          label: 'GPT-5.4',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'minimal', label: 'Minimal' },
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
          ],
        },
      ],
      attachments: TEST_ATTACHMENT_CAPABILITY,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    },
  ]
}

describe('AppSettingsService', () => {
  let stateService: StateService
  let service: AppSettingsService
  let descriptors: ProviderDescriptor[]

  beforeEach(() => {
    const db = getDatabase()
    stateService = new StateService(db)
    descriptors = buildDescriptors()
    service = new AppSettingsService(stateService, async () => descriptors)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  describe('getAppSettings', () => {
    it('returns all null when nothing is stored', async () => {
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('round-trips a saved settings object', async () => {
      await service.setAppSettings({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('coerces all fields to null when stored provider is no longer registered', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'ghost',
          defaultModelId: 'sonnet',
          defaultEffortId: 'medium',
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('drops model and effort when stored model is no longer offered by the provider', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'claude-code',
          defaultModelId: 'ghost-model',
          defaultEffortId: 'medium',
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: 'claude-code',
        defaultModelId: null,
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('drops effort when stored effort is not offered by the model', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'claude-code',
          defaultModelId: 'sonnet',
          defaultEffortId: 'xhigh',
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('returns empty settings when the stored blob is malformed', async () => {
      stateService.set(APP_SETTINGS_KEY, '{not json')
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })
  })

  describe('setAppSettings', () => {
    it('throws on unknown provider id', async () => {
      await expect(
        service.setAppSettings({
          defaultProviderId: 'ghost',
          defaultModelId: null,
          defaultEffortId: null,
          namingModelByProvider: {},
        }),
      ).rejects.toThrow(/Unknown provider id/)
    })

    it('throws on unknown model id for provider', async () => {
      await expect(
        service.setAppSettings({
          defaultProviderId: 'claude-code',
          defaultModelId: 'ghost',
          defaultEffortId: null,
        }),
      ).rejects.toThrow(/Unknown model id/)
    })

    it('throws on unknown effort id for model', async () => {
      await expect(
        service.setAppSettings({
          defaultProviderId: 'claude-code',
          defaultModelId: 'sonnet',
          defaultEffortId: 'xhigh',
        }),
      ).rejects.toThrow(/Unknown effort id/)
    })

    it('allows clearing settings back to null', async () => {
      await service.setAppSettings({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      })
      const cleared = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
      })
      expect(cleared).toEqual({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      })
    })

    it('nulls out model and effort when provider is null', async () => {
      const stored = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      })
      expect(stored.defaultModelId).toBeNull()
      expect(stored.defaultEffortId).toBeNull()
    })
  })

  describe('resolveSessionDefaults', () => {
    it('uses stored settings when they are valid', async () => {
      await service.setAppSettings({
        defaultProviderId: 'claude-code',
        defaultModelId: 'opus',
        defaultEffortId: 'max',
      })
      const resolved = await service.resolveSessionDefaults()
      expect(resolved).toEqual({
        providerId: 'claude-code',
        modelId: 'opus',
        effortId: 'max',
      })
    })

    it('falls back to first provider / provider default model / model default effort when nothing is stored', async () => {
      const resolved = await service.resolveSessionDefaults()
      expect(resolved).toEqual({
        providerId: 'claude-code',
        modelId: 'sonnet',
        effortId: 'medium',
      })
    })

    it('falls back when stored provider is missing', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'ghost',
          defaultModelId: 'sonnet',
          defaultEffortId: 'medium',
        }),
      )
      const resolved = await service.resolveSessionDefaults()
      expect(resolved).toEqual({
        providerId: 'claude-code',
        modelId: 'sonnet',
        effortId: 'medium',
      })
    })

    it('falls back effort through medium when the model has no default', async () => {
      descriptors = [
        {
          ...descriptors[0],
          modelOptions: [
            {
              id: 'sonnet',
              label: 'Claude Sonnet',
              defaultEffort: null,
              effortOptions: [
                { id: 'low', label: 'Low' },
                { id: 'medium', label: 'Medium' },
                { id: 'high', label: 'High' },
              ],
            },
          ],
        },
      ]
      const resolved = await service.resolveSessionDefaults()
      expect(resolved?.effortId).toBe('medium')
    })

    it('returns null when there are no providers at all', async () => {
      descriptors = []
      const resolved = await service.resolveSessionDefaults()
      expect(resolved).toBeNull()
    })
  })

  describe('resolveExtractionModel', () => {
    it('returns the configured override when set', async () => {
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        extractionModelByProvider: { 'claude-code': 'opus' },
      })
      const resolved = await service.resolveExtractionModel('claude-code')
      expect(resolved).toBe('opus')
    })

    it('falls back to the provider default model when no override is configured', async () => {
      const resolved = await service.resolveExtractionModel('claude-code')
      expect(resolved).toBe('sonnet')
    })

    it('returns null when the provider is unknown', async () => {
      const resolved = await service.resolveExtractionModel('ghost')
      expect(resolved).toBeNull()
    })

    it('ignores an override that points to a model the provider no longer offers', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          extractionModelByProvider: { 'claude-code': 'ghost-model' },
        }),
      )
      const resolved = await service.resolveExtractionModel('claude-code')
      expect(resolved).toBe('sonnet')
    })
  })

  describe('notifications', () => {
    it('hydrates missing notifications field on read with defaults', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'claude-code',
          defaultModelId: 'sonnet',
          defaultEffortId: 'medium',
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings.notifications).toEqual(DEFAULT_NOTIFICATION_PREFS)
    })

    it('hydrates missing nested event keys with defaults', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          notifications: {
            enabled: false,
            events: { finished: false },
          },
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings.notifications).toEqual({
        ...DEFAULT_NOTIFICATION_PREFS,
        enabled: false,
        events: {
          ...DEFAULT_NOTIFICATION_PREFS.events,
          finished: false,
        },
      })
    })

    it('rejects non-boolean values and falls back to defaults per field', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          notifications: {
            enabled: 'yes',
            toasts: 1,
            sounds: false,
            system: null,
            events: { finished: 'on', errored: false },
          },
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings.notifications).toEqual({
        ...DEFAULT_NOTIFICATION_PREFS,
        sounds: false,
        events: {
          ...DEFAULT_NOTIFICATION_PREFS.events,
          errored: false,
        },
      })
    })

    it('round-trips a custom notifications object through setAppSettings', async () => {
      const custom = {
        ...DEFAULT_NOTIFICATION_PREFS,
        sounds: false,
        suppressWhenFocused: false,
        events: {
          ...DEFAULT_NOTIFICATION_PREFS.events,
          needsApproval: false,
        },
      }
      const stored = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        notifications: custom,
      })
      expect(stored.notifications).toEqual(custom)
      const reloaded = await service.getAppSettings()
      expect(reloaded.notifications).toEqual(custom)
    })

    it('preserves existing notifications when input omits the field', async () => {
      const custom = {
        ...DEFAULT_NOTIFICATION_PREFS,
        toasts: false,
      }
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        notifications: custom,
      })
      const stored = await service.setAppSettings({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      })
      expect(stored.notifications).toEqual(custom)
    })
  })

  describe('updates', () => {
    it('hydrates missing updates field on read with defaults', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          defaultProviderId: 'claude-code',
          defaultModelId: 'sonnet',
          defaultEffortId: 'medium',
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings.updates).toEqual(DEFAULT_UPDATE_PREFS)
    })

    it('rejects non-boolean backgroundCheckEnabled and falls back to default', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          updates: { backgroundCheckEnabled: 'yes' },
        }),
      )
      const settings = await service.getAppSettings()
      expect(settings.updates).toEqual(DEFAULT_UPDATE_PREFS)
    })

    it('round-trips a toggled backgroundCheckEnabled through setAppSettings', async () => {
      const stored = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        updates: { backgroundCheckEnabled: false },
      })
      expect(stored.updates).toEqual({ backgroundCheckEnabled: false })
      const reloaded = await service.getAppSettings()
      expect(reloaded.updates).toEqual({ backgroundCheckEnabled: false })
    })

    it('preserves existing updates when input omits the field', async () => {
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        updates: { backgroundCheckEnabled: false },
      })
      const stored = await service.setAppSettings({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      })
      expect(stored.updates).toEqual({ backgroundCheckEnabled: false })
    })
  })

  describe('debug logging', () => {
    it('defaults to disabled when nothing is stored', async () => {
      const settings = await service.getAppSettings()
      expect(settings.debugLogging).toEqual(DEFAULT_DEBUG_LOGGING_PREFS)
    })

    it('round-trips an enabled toggle', async () => {
      const stored = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        debugLogging: { enabled: true },
      })
      expect(stored.debugLogging).toEqual({ enabled: true })
      const reloaded = await service.getAppSettings()
      expect(reloaded.debugLogging).toEqual({ enabled: true })
      expect(service.getDebugLoggingPrefsSync()).toEqual({ enabled: true })
    })

    it('rejects non-boolean enabled and falls back to default', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({ debugLogging: { enabled: 'sure' } }),
      )
      const settings = await service.getAppSettings()
      expect(settings.debugLogging).toEqual(DEFAULT_DEBUG_LOGGING_PREFS)
    })

    it('preserves existing debugLogging when input omits the field', async () => {
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        debugLogging: { enabled: true },
      })
      const stored = await service.setAppSettings({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      })
      expect(stored.debugLogging).toEqual({ enabled: true })
    })
  })
})
