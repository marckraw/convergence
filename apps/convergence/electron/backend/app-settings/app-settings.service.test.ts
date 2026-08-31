import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { DEFAULT_NOTIFICATION_PREFS } from '../notifications/notifications.defaults'
import {
  recordingExecutionHostCredentials,
  type RecordingExecutionHostCredentials,
} from '../credentials/execution-host-daemon-credentials.fixture'
import { ExecutionHostEndpointRepository } from '../execution-host-endpoint/execution-host-endpoint.repository'
import { StateService } from '../state/state.service'
import type {
  ProviderAttachmentCapability,
  ProviderDescriptor,
} from '../provider/provider.types'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import { DEFAULT_UPDATE_PREFS } from '../updates/updates.defaults'
import { APP_SETTINGS_KEY } from './app-settings.constants'
import { AppSettingsService } from './app-settings.service'
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
      fastModelId: 'haiku',
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
        {
          id: 'haiku',
          label: 'Claude Haiku',
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
      id: 'codex',
      name: 'Codex',
      vendorLabel: 'OpenAI',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'gpt-5.6',
      modelOptions: [
        {
          id: 'gpt-5.6',
          label: 'GPT-5.6 Sol',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'none', label: 'None' },
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
            { id: 'xhigh', label: 'Very High' },
            { id: 'max', label: 'Max' },
          ],
        },
        {
          id: 'gpt-5.5',
          label: 'GPT-5.5',
          defaultEffort: 'medium',
          effortOptions: [
            { id: 'minimal', label: 'Minimal' },
            { id: 'low', label: 'Low' },
            { id: 'medium', label: 'Medium' },
            { id: 'high', label: 'High' },
          ],
        },
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

function buildPiDescriptor(): ProviderDescriptor {
  return {
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
        id: 'openrouter/builtin',
        label: 'OpenRouter Built-in',
        defaultEffort: 'medium',
        effortOptions: [{ id: 'medium', label: 'Medium' }],
        source: 'provider',
      },
      {
        id: 'github-copilot/gpt-5.4',
        label: 'GitHub Copilot GPT-5.4',
        defaultEffort: 'medium',
        effortOptions: [{ id: 'medium', label: 'Medium' }],
        source: 'provider',
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
  }
}

describe('AppSettingsService', () => {
  let stateService: StateService
  let service: AppSettingsService
  let descriptors: ProviderDescriptor[]
  // Records the call rather than the secret: a token's destruction is asserted
  // on the Keychain account that was named, never on a value.
  let credentials: RecordingExecutionHostCredentials
  let forgotten: string[]

  beforeEach(() => {
    const db = getDatabase()
    stateService = new StateService(db)
    descriptors = buildDescriptors()
    credentials = recordingExecutionHostCredentials()
    forgotten = credentials.forgotten
    service = new AppSettingsService(
      db,
      stateService,
      async () => descriptors,
      new ExecutionHostEndpointRepository(db),
      credentials,
    )
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
      })
    })

    it('round-trips a saved settings object', async () => {
      await service.setAppSettings({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
      })
      const settings = await service.getAppSettings()
      expect(settings).toEqual({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
      })
    })

    it('hydrates, deduplicates, and validates favorite models', async () => {
      stateService.set(
        APP_SETTINGS_KEY,
        JSON.stringify({
          favoriteModels: {
            items: [
              { providerId: 'codex', modelId: 'gpt-5.4' },
              { providerId: 'codex', modelId: 'gpt-5.4' },
              { providerId: 'claude-code', modelId: 'opus' },
              { providerId: 'ghost', modelId: 'gpt-5.4' },
              { providerId: 'claude-code', modelId: 'ghost' },
              { providerId: '', modelId: 'opus' },
            ],
          },
        }),
      )

      const settings = await service.getAppSettings()

      expect(settings.favoriteModels).toEqual({
        items: [
          { providerId: 'codex', modelId: 'gpt-5.4' },
          { providerId: 'claude-code', modelId: 'opus' },
        ],
      })
    })
  })

  describe('filterProviderDescriptors', () => {
    it('always keeps models.json Pi models and adds selected available models', async () => {
      descriptors.push(buildPiDescriptor())
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        piModelVisibility: {
          additionalModelIds: ['github-copilot/gpt-5.4'],
        },
      })

      const pi = service
        .filterProviderDescriptors(descriptors)
        .find((descriptor) => descriptor.id === 'pi')

      expect(pi?.modelOptions.map((model) => model.id)).toEqual([
        'openrouter/custom',
        'github-copilot/gpt-5.4',
      ])
    })

    it('migrates legacy Pi Codex visibility ids to GitHub Copilot ids', async () => {
      descriptors.push(buildPiDescriptor())
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        piModelVisibility: {
          additionalModelIds: ['openai-codex/gpt-5.5'],
        },
      })

      const settings = await service.getAppSettings()
      const pi = service
        .filterProviderDescriptors(descriptors)
        .find((descriptor) => descriptor.id === 'pi')

      expect(settings.piModelVisibility.additionalModelIds).toEqual([
        'github-copilot/gpt-5.5',
      ])
      expect(pi?.modelOptions.map((model) => model.id)).toEqual([
        'openrouter/custom',
        'github-copilot/gpt-5.5',
      ])
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
      })
    })

    // MAR-2620: one text field still edits one daemon, and that daemon is now
    // the first Endpoint. The write path has to survive the round trip, because
    // a session records the Endpoint's id and nothing downstream can repair a
    // save that lost it.
    describe('execution host endpoints', () => {
      it('round-trips the endpoint the settings form edits', async () => {
        const stored = await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://daemon.example.com/' },
          ],
        })
        expect(stored.executionHostEndpoints).toEqual([
          expect.objectContaining({
            id: 'kuba',
            label: 'Remote daemon',
            baseUrl: 'https://daemon.example.com',
            position: 0,
          }),
        ])

        const reread = await service.getAppSettings()
        expect(reread.executionHostEndpoints).toEqual(
          stored.executionHostEndpoints,
        )
      })

      it('keeps the endpoint id across an edit, so recorded sessions still resolve', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://old.example.com' },
          ],
        })
        const moved = await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://new.example.com' },
          ],
        })
        expect(moved.executionHostEndpoints[0]).toMatchObject({
          id: 'kuba',
          baseUrl: 'https://new.example.com',
        })
      })

      it('clears the endpoint when the field is emptied', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://daemon.example.com' },
          ],
        })
        const cleared = await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [],
        })
        expect(cleared.executionHostEndpoints).toEqual([])
      })

      it('leaves endpoints alone when the input does not mention them', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://daemon.example.com' },
          ],
        })
        const untouched = await service.setAppSettings({
          defaultProviderId: 'claude-code',
          defaultModelId: 'sonnet',
          defaultEffortId: 'medium',
        })
        expect(untouched.executionHostEndpoints).toHaveLength(1)
      })

      it('refuses a base URL that is not HTTP(S), and saves nothing at all', async () => {
        await expect(
          service.setAppSettings({
            defaultProviderId: 'claude-code',
            defaultModelId: 'sonnet',
            defaultEffortId: 'medium',
            executionHostEndpoints: [
              { id: 'kuba', baseUrl: 'ftp://daemon.example.com' },
            ],
          }),
        ).rejects.toThrow(
          'Remote execution host base URL must be an HTTP(S) URL.',
        )

        // A rejected endpoint list must not leave half a form saved: the
        // provider defaults in the same submission stay unwritten too.
        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toEqual([])
        expect(after.defaultProviderId).toBeNull()
      })

      /**
       * A credential lives and dies with its Endpoint (MAR-2642).
       *
       * The Keychain account *is* the Endpoint id, so an entry left behind by a
       * removal is a token for a machine nobody can see any more: invisible in
       * Settings, unreachable through the UI, and still sitting in the login
       * keychain. Removal is the only gesture that destroys one.
       */
      it('forgets the token of an endpoint the save removed', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })
        expect(forgotten).toEqual([])

        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })

        // Exactly the removed machine's account, and no other one's.
        expect(forgotten).toEqual(['kuba'])
      })

      it('keeps an edited endpoint’s id and its token: an edit is not a removal', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            {
              id: 'kuba',
              label: 'kuba-vps',
              baseUrl: 'https://kuba.example.com',
            },
          ],
        })

        const moved = await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            {
              id: 'kuba',
              label: 'kuba-box',
              baseUrl: 'https://moved.example.com',
            },
          ],
        })

        expect(moved.executionHostEndpoints[0]).toMatchObject({
          id: 'kuba',
          label: 'kuba-box',
          baseUrl: 'https://moved.example.com',
        })
        // Slice 1's guarantee still holds for editing: same id, same Keychain
        // account, same token. Only Remove destroys a credential.
        expect(forgotten).toEqual([])
      })

      /**
       * The Keychain and this database are two systems, so a removal cannot be
       * one write and the only thing left to choose is which goes first. This
       * is the branch that decides it, and the two below are the two costs.
       *
       * The settings commit goes first. Destroying the credential first spends
       * a real token on a save that may then reject — irreversibly gone, while
       * the Endpoint that named it is still stored. Committing first leaves an
       * entry filed under an id no Endpoint will ever bear again, so it can
       * never authenticate anything: inert garbage, and garbage the next sweep
       * collects. Data loss is the worse of the two.
       */
      it('keeps the save when the token cannot be destroyed, and owes the cleanup', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
          ],
        })
        credentials.stored.add('kuba')
        credentials.refuses.add('kuba')

        // The save the user asked for happened, so reporting it as failed
        // would be the lie: what failed is a cleanup they never asked about.
        await expect(
          service.setAppSettings({
            defaultProviderId: null,
            defaultModelId: null,
            defaultEffortId: null,
            executionHostEndpoints: [],
          }),
        ).resolves.toMatchObject({ executionHostEndpoints: [] })

        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toEqual([])
        expect(forgotten).toEqual([])
        // And the residue is still there to be collected.
        expect(credentials.stored.has('kuba')).toBe(true)
      })

      it('sweeps the orphan the failed cleanup left, on the next settings load', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })
        credentials.stored.add('kuba')
        credentials.stored.add('backpack')
        credentials.refuses.add('kuba')

        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })
        expect(credentials.stored.has('kuba')).toBe(true)

        // The keychain lets go later — a relocked keychain unlocked, an
        // authorization prompt answered — and the sweep is what notices.
        credentials.refuses.delete('kuba')
        expect(await service.sweepOrphanedExecutionHostCredentials()).toEqual([
          'kuba',
        ])
        expect(credentials.stored.has('kuba')).toBe(false)

        // And it never reaches a credential whose Endpoint still exists.
        expect(credentials.stored.has('backpack')).toBe(true)
        expect(await service.sweepOrphanedExecutionHostCredentials()).toEqual(
          [],
        )
      })

      /**
       * Two removals are two machines, and they are ordered against nothing
       * (MAR-2642). One at a time means a Keychain that blocks on the first —
       * an authorization prompt nobody is there to answer, a `security` running
       * to its timeout — holds up the cleanup of a machine it has nothing to do
       * with, and a Save that removes both waits on the slowest before it can
       * even start the second.
       *
       * The canary is time, not order: `kuba`'s cleanup is left in flight and
       * `backpack`'s must have finished anyway. Sequence them again and this
       * fails, because `backpack`'s would never have been reached.
       */
      it('does not let one blocked removal hold up another endpoint’s', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })
        credentials.stored.add('kuba')
        credentials.stored.add('backpack')
        const releaseKuba = credentials.block('kuba')

        const save = service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [],
        })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(credentials.forgotten).toEqual(['backpack'])

        releaseKuba()
        await save
        expect(credentials.forgotten).toEqual(['backpack', 'kuba'])
      })

      /**
       * The same property for the sweep, which walks accounts the Keychain
       * listed rather than endpoints a Save named. One entry the Keychain will
       * not release is next sweep's problem; the entries beside it are still
       * garbage today, and they belong to different machines.
       */
      it('sweeps past a blocked orphan to the ones beside it', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [],
        })
        credentials.stored.add('kuba')
        credentials.stored.add('backpack')
        const releaseKuba = credentials.block('kuba')

        const swept = service.sweepOrphanedExecutionHostCredentials()
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(credentials.stored.has('backpack')).toBe(false)

        releaseKuba()
        expect(await swept).toEqual(['kuba', 'backpack'])
      })

      it('keeps the endpoint and its token when the save itself fails', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
          ],
        })
        credentials.stored.add('kuba')

        const failingWrite = vi
          .spyOn(stateService, 'set')
          .mockImplementation(() => {
            throw new Error('app_state is unwritable')
          })

        await expect(
          service.setAppSettings({
            defaultProviderId: null,
            defaultModelId: null,
            defaultEffortId: null,
            executionHostEndpoints: [],
          }),
        ).rejects.toThrow('app_state is unwritable')
        failingWrite.mockRestore()

        // This is what the order buys. The user still has the machine, and
        // still has the token they would otherwise have had to paste again —
        // a loss nothing could have undone, spent on a save that never landed.
        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toHaveLength(1)
        expect(forgotten).toEqual([])
        expect(credentials.stored.has('kuba')).toBe(true)
      })

      it('destroys no token when the endpoint list is refused before anything is written', async () => {
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://kuba.example.com' },
            { id: 'backpack', baseUrl: 'https://backpack.example.com' },
          ],
        })

        // Removing `kuba` and mistyping `backpack`'s URL in one Save. The list
        // will not normalize, so the save is refused — and the refusal has to
        // land before the credential is destroyed, or a rejected Save would
        // still have taken a token from a machine that is still there.
        await expect(
          service.setAppSettings({
            defaultProviderId: null,
            defaultModelId: null,
            defaultEffortId: null,
            executionHostEndpoints: [
              { id: 'backpack', baseUrl: 'ftp://backpack.example.com' },
            ],
          }),
        ).rejects.toThrow(
          'Remote execution host base URL must be an HTTP(S) URL.',
        )

        expect(forgotten).toEqual([])
        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toHaveLength(2)
      })

      it('refuses an endpoint with no id rather than filling one in', async () => {
        // The other half of "ids are never reused": a blank id used to fall
        // back to 'default', handing a new machine the sessions and the
        // Keychain account of the one the single-host era became.
        await expect(
          service.setAppSettings({
            defaultProviderId: null,
            defaultModelId: null,
            defaultEffortId: null,
            executionHostEndpoints: [
              { id: '  ', baseUrl: 'https://daemon.example.com' },
            ],
          }),
        ).rejects.toThrow(/must carry its own id/)

        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toEqual([])
      })

      it('leaves no endpoint row behind when the settings blob write fails', async () => {
        // The other half of the same rule, and the one only atomicity can
        // give: the endpoints commit before the blob, so a blob write that
        // fails used to leave an Endpoint stored against a Save the user saw
        // rejected. Two writes that must be true together are one write.
        await service.setAppSettings({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
          executionHostEndpoints: [
            { id: 'kuba', baseUrl: 'https://before.example.com' },
          ],
        })

        const failingWrite = vi
          .spyOn(stateService, 'set')
          .mockImplementation(() => {
            throw new Error('app_state is unwritable')
          })

        await expect(
          service.setAppSettings({
            defaultProviderId: null,
            defaultModelId: null,
            defaultEffortId: null,
            executionHostEndpoints: [
              { id: 'kuba', baseUrl: 'https://after.example.com' },
            ],
          }),
        ).rejects.toThrow('app_state is unwritable')

        failingWrite.mockRestore()
        const after = await service.getAppSettings()
        expect(after.executionHostEndpoints).toEqual([
          expect.objectContaining({ baseUrl: 'https://before.example.com' }),
        ])
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

    it('persists valid favorite models and drops unavailable pairs', async () => {
      const stored = await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        favoriteModels: {
          items: [
            { providerId: 'claude-code', modelId: 'opus' },
            { providerId: 'codex', modelId: 'ghost' },
          ],
        },
      })

      expect(stored.favoriteModels).toEqual({
        items: [{ providerId: 'claude-code', modelId: 'opus' }],
      })
    })

    it('preserves existing favorite models when input omits the field', async () => {
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        favoriteModels: {
          items: [{ providerId: 'claude-code', modelId: 'opus' }],
        },
      })

      const stored = await service.setAppSettings({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'medium',
      })

      expect(stored.favoriteModels).toEqual({
        items: [{ providerId: 'claude-code', modelId: 'opus' }],
      })
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

    it('can prefer the provider fast model when no override is configured', async () => {
      const resolved = await service.resolveExtractionModel('claude-code', {
        preferFastDefault: true,
      })
      expect(resolved).toBe('haiku')
    })

    it('keeps the configured override when fast default is preferred', async () => {
      await service.setAppSettings({
        defaultProviderId: null,
        defaultModelId: null,
        defaultEffortId: null,
        extractionModelByProvider: { 'claude-code': 'opus' },
      })
      const resolved = await service.resolveExtractionModel('claude-code', {
        preferFastDefault: true,
      })
      expect(resolved).toBe('opus')
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
