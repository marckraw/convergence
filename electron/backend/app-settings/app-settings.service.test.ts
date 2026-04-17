import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { StateService } from '../state/state.service'
import type {
  ProviderAttachmentCapability,
  ProviderDescriptor,
} from '../provider/provider.types'
import { AppSettingsService, APP_SETTINGS_KEY } from './app-settings.service'

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
      })
    })

    it('round-trips a saved settings object', async () => {
      await service.setAppSettings({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
      })
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
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
})
