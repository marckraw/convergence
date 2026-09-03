import type Database from 'better-sqlite3'
import type { ExecutionHostEndpointRepository } from '../execution-host-endpoint/execution-host-endpoint.repository'
import type { ExecutionHostEndpoint } from '../execution-host-endpoint/execution-host-endpoint.types'
import { removedExecutionHostEndpointIds } from '../execution-host-endpoint/execution-host-endpoint.pure'
import { ExecutionHostConfigurationEpochs } from '../execution-host-endpoint/execution-host-configuration-epoch'
import type { NotificationPrefs } from '../notifications/notifications.types'
import type { StateService } from '../state/state.service'
import type { ProviderDescriptor } from '../provider/provider.types'
import type { UpdatePrefs } from '../updates/updates.types'
import {
  type AppSettings,
  type AppSettingsInput,
  type DebugLoggingPrefs,
  type LanesPrefs,
  type ResolvedSessionDefaults,
  type StoredAppSettings,
} from './app-settings.types'
import { APP_SETTINGS_KEY } from './app-settings.constants'
import {
  filterPiDescriptor,
  parseAppSettings,
  parseCommandCenterShortcut,
  parseDebugLoggingPrefs,
  parseFavoriteModelsPrefs,
  parseLanesPrefs,
  parseNotificationPrefs,
  parseOnboardingPrefs,
  parsePiModelVisibilityPrefs,
  parseUpdatePrefs,
  resolveSessionDefaultsFromSettings,
  validateAppSettings,
  validateCommandCenterShortcut,
  validateFavoriteModels,
  validateModelMap,
  validatePiModelVisibility,
} from './app-settings.pure'

type ProviderDescriptorLoader = () => Promise<ProviderDescriptor[]>

/**
 * The credential store an Endpoint's token lives in (MAR-2642).
 *
 * Named as a port rather than taking the concrete service so this module keeps
 * knowing only one thing about tokens: that a credential lives and dies with
 * its Endpoint. Required rather than optional, so the wiring cannot go missing
 * and leave every gate green with tokens quietly outliving their machines.
 */
export interface ExecutionHostEndpointCredentials {
  /** Destroys one named Endpoint's token, or rejects having left it stored. */
  forgetEndpoint(endpointId: string): Promise<void>
  /**
   * Destroys every stored credential whose Endpoint no longer exists, and
   * answers with the accounts it emptied.
   *
   * `isLive` is a question rather than a list because the store asks it again
   * at the moment of each delete: an Endpoint added while the sweep was
   * running is not an orphan.
   */
  sweepEndpoints(isLive: (endpointId: string) => boolean): Promise<string[]>
}

export class AppSettingsService {
  /**
   * Which configuration each Endpoint is currently understood to have
   * (MAR-2689 round 6).
   *
   * Owned here rather than by the registry or the host because the epoch is
   * only ever *read* as part of the Endpoint list, and this service is the one
   * door that list comes out of. Owned by a host, it would have to be gathered
   * back up per Endpoint at the splice; owned by the registry, the settings
   * door would depend on the thing that depends on it. One owner, two inputs --
   * `observeExecutionHostConfiguration`, called by the resolver that mints a
   * connection for a named Endpoint, and `observeExecutionHostCapabilities`,
   * called where a handshake lands (MAR-2689 round 8) -- and nothing else.
   */
  private readonly configurationEpochs = new ExecutionHostConfigurationEpochs()

  constructor(
    private readonly db: Database.Database,
    private readonly stateService: StateService,
    private readonly loadDescriptors: ProviderDescriptorLoader,
    private readonly executionHostEndpoints: ExecutionHostEndpointRepository,
    private readonly executionHostCredentials: ExecutionHostEndpointCredentials,
  ) {}

  async getAppSettings(): Promise<AppSettings> {
    const raw = this.stateService.get(APP_SETTINGS_KEY)
    const parsed = parseAppSettings(raw)
    const descriptors = await this.loadDescriptors()
    return this.withExecutionHostEndpoints(
      validateAppSettings(parsed, descriptors),
    )
  }

  /**
   * Endpoints live in their own rows, not in the settings blob, because a
   * session references one by id and the blob has no identity to reference.
   * Splicing them in here keeps a single stored fact behind the single settings
   * object every caller already reads (MAR-2620).
   */
  private withExecutionHostEndpoints(settings: StoredAppSettings): AppSettings {
    return {
      ...settings,
      // The epoch rides the list rather than travelling on a channel of its
      // own, so a reader cannot hold an Endpoint and its configuration epoch
      // from two different moments (MAR-2689 round 6). Spliced at the single
      // door, so `appSettings:get` and the `appSettings:updated` broadcast
      // cannot come to carry different answers.
      executionHostEndpoints: this.executionHostEndpoints
        .list()
        .map((endpoint) => ({
          ...endpoint,
          configurationEpoch: this.configurationEpochs.epochFor(endpoint.id),
        })),
    }
  }

  /**
   * Records the daemon configuration an Endpoint was just resolved under
   * (MAR-2689 round 6).
   *
   * Called by `AppSettingsRemoteExecutionHostConnectionResolver`, which is the
   * only place a base URL and a token are put together for a named Endpoint.
   * The fingerprint arrives already computed and is never stored: what is kept
   * is an integer that moves when it changes, so the renderer learns *that*
   * this machine is configured differently without learning anything about
   * how.
   */
  observeExecutionHostConfiguration(
    endpointId: string,
    configurationFingerprint: string,
  ): void {
    this.configurationEpochs.observe(
      endpointId,
      'configuration',
      configurationFingerprint,
    )
  }

  /**
   * Records what an Endpoint's daemon advertised in the handshake that just
   * landed (MAR-2689 round 8).
   *
   * The epoch's second input, on the same ledger and reaching the renderer on
   * the same Endpoint list, because an answer derived from a machine depends on
   * what that machine says it can do as much as on which machine it is. A
   * daemon upgraded at the same address and under the same credential moves no
   * fingerprint at all; without this the Projects catalog it can no longer
   * serve stayed in force in the renderer while main's own provenance had
   * already stopped accepting it, and the strip went on offering a place the
   * start door refused.
   *
   * Called by `RemoteExecutionHost` through the registry, at the one place a
   * handshake lands, for the same reason the configuration is observed where a
   * connection is resolved: a change between two reads is invisible to anything
   * that only looks at read time.
   */
  observeExecutionHostCapabilities(
    endpointId: string,
    capabilitiesFingerprint: string,
  ): void {
    this.configurationEpochs.observe(
      endpointId,
      'capabilities',
      capabilitiesFingerprint,
    )
  }

  /**
   * Whether an Endpoint with this id is configured at this instant
   * (MAR-2682).
   *
   * Synchronous because the caller is. The Remote Execution Host registry
   * builds a host inside `hostFor`, which has no await in it -- and an await
   * there would *be* the window this closes: a removal landing between an
   * asynchronous check and the mint would leave a cached host, and a primed
   * request, for a machine nobody is configured for. Endpoints already live in
   * their own rows and `list()` reads them synchronously, so nothing new is
   * being promised here.
   */
  hasExecutionHostEndpoint(endpointId: string): boolean {
    return this.executionHostEndpoints.getById(endpointId) !== null
  }

  getNotificationPrefsSync(): NotificationPrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))
      .notifications
  }

  getUpdatePrefsSync(): UpdatePrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)).updates
  }

  getDebugLoggingPrefsSync(): DebugLoggingPrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))
      .debugLogging
  }

  /** Where lanes are created (MAR-2783); `root` null = the app's default. */
  getLanesPrefsSync(): LanesPrefs {
    return parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)).lanes
  }

  filterProviderDescriptors(
    descriptors: ProviderDescriptor[],
  ): ProviderDescriptor[] {
    const settings = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )
    return descriptors.map((descriptor) =>
      filterPiDescriptor(descriptor, settings.piModelVisibility),
    )
  }

  async setAppSettings(input: AppSettingsInput): Promise<AppSettings> {
    const descriptors = await this.loadDescriptors()
    const provider = descriptors.find(
      (item) => item.id === input.defaultProviderId,
    )
    if (input.defaultProviderId !== null && !provider) {
      throw new Error(`Unknown provider id: ${input.defaultProviderId}`)
    }

    let model = null as ProviderDescriptor['modelOptions'][number] | null
    if (provider && input.defaultModelId !== null) {
      model =
        provider.modelOptions.find(
          (item) => item.id === input.defaultModelId,
        ) ?? null
      if (!model) {
        throw new Error(
          `Unknown model id for provider ${provider.id}: ${input.defaultModelId}`,
        )
      }
    }

    if (model && input.defaultEffortId !== null) {
      const effort = model.effortOptions.find(
        (item) => item.id === input.defaultEffortId,
      )
      if (!effort) {
        throw new Error(
          `Unknown effort id for model ${model.id}: ${input.defaultEffortId}`,
        )
      }
    }

    const namingModelByProvider = validateModelMap(
      input.namingModelByProvider ?? {},
      descriptors,
    )
    const extractionModelByProvider = validateModelMap(
      input.extractionModelByProvider ?? {},
      descriptors,
    )

    const existing = parseAppSettings(this.stateService.get(APP_SETTINGS_KEY))

    const notifications =
      input.notifications === undefined
        ? existing.notifications
        : parseNotificationPrefs(input.notifications)
    const onboarding =
      input.onboarding === undefined
        ? existing.onboarding
        : parseOnboardingPrefs(input.onboarding)
    const updates =
      input.updates === undefined
        ? existing.updates
        : parseUpdatePrefs(input.updates)
    const debugLogging =
      input.debugLogging === undefined
        ? existing.debugLogging
        : parseDebugLoggingPrefs(input.debugLogging)
    const piModelVisibility =
      input.piModelVisibility === undefined
        ? existing.piModelVisibility
        : validatePiModelVisibility(
            parsePiModelVisibilityPrefs(input.piModelVisibility),
            descriptors,
          )
    const favoriteModels =
      input.favoriteModels === undefined
        ? validateFavoriteModels(existing.favoriteModels, descriptors)
        : validateFavoriteModels(
            parseFavoriteModelsPrefs(input.favoriteModels),
            descriptors,
          )
    const lanes =
      input.lanes === undefined ? existing.lanes : parseLanesPrefs(input.lanes)
    const commandCenterShortcut =
      input.commandCenterShortcut === undefined
        ? existing.commandCenterShortcut
        : (() => {
            const parsed = parseCommandCenterShortcut(
              input.commandCenterShortcut,
            )
            const validated = validateCommandCenterShortcut(parsed)
            if (!validated) {
              throw new Error(
                'Command Center shortcut must use a single letter or number key.',
              )
            }
            return validated
          })()

    const toStore: StoredAppSettings = {
      defaultProviderId: provider ? provider.id : null,
      defaultModelId: model ? model.id : null,
      defaultEffortId:
        model && input.defaultEffortId !== null ? input.defaultEffortId : null,
      namingModelByProvider,
      extractionModelByProvider,
      commandCenterShortcut,
      notifications,
      onboarding,
      updates,
      debugLogging,
      piModelVisibility,
      favoriteModels,
      lanes,
    }

    // A credential lives and dies with its Endpoint (MAR-2642), and removal is
    // the only gesture that destroys one: an edit to a row's label or URL keeps
    // its id, so it keeps its Keychain account and its token. Priced before
    // anything is written, from the stored rows on one side and the normalizer
    // on the other, so a list that will not normalize is refused here — before
    // anything has been written or destroyed.
    const removedEndpointIds =
      input.executionHostEndpoints === undefined
        ? []
        : removedExecutionHostEndpointIds(
            this.executionHostEndpoints.list(),
            input.executionHostEndpoints,
          )

    // One transaction, because one Save is one fact. The endpoints live in
    // their own rows and the rest of the settings in a blob, and committing
    // them separately means a failure on either side leaves the other half
    // stored: an endpoint row the user saw rejected, standing against a blob
    // that never mentioned it. Endpoints go first inside it so a list that
    // will not normalize aborts before anything is written at all.
    const applySave = this.db.transaction(() => {
      if (input.executionHostEndpoints !== undefined) {
        this.executionHostEndpoints.replaceAll(input.executionHostEndpoints)
      }
      this.stateService.set(APP_SETTINGS_KEY, JSON.stringify(toStore))
    })
    applySave()

    // The Keychain and this database are different systems, so one write
    // across both is not available and the only thing left to choose is the
    // order. The settings commit goes first, and the credential is cleaned up
    // after it, because the two failures are not the same size. Destroying the
    // credential first spends a real token on a save that may then reject — a
    // token irreversibly gone while the Endpoint that named it is still
    // stored. Committing first leaves, at worst, an entry filed under an id no
    // Endpoint will ever bear again: ids are never reused (MAR-2642), so an
    // orphan can never authenticate anything. Inert garbage beats data loss.
    //
    // Which makes a failure here a debt rather than a defect, so it is not
    // raised: the save the user asked for did happen, and reporting it as
    // failed would be the lie. `sweepOrphanedExecutionHostCredentials` collects
    // the debt on the next settings load and on every settings-dialog open, and
    // keeps collecting it until the Keychain lets go.
    //
    // Concurrently, and settled rather than sequenced (MAR-2642): removing two
    // Endpoints removes two machines' credentials, and they are ordered against
    // nothing. One at a time means a Keychain that blocks on the first — an
    // authorization prompt nobody answers, a `security` that runs to its
    // timeout — holds up the cleanup of a machine it has nothing to do with.
    // Each failure is still swallowed against its own Endpoint, so one refusal
    // is one debt rather than the end of the batch.
    await Promise.allSettled(
      removedEndpointIds.map((removed) =>
        this.executionHostCredentials.forgetEndpoint(removed),
      ),
    )

    return this.withExecutionHostEndpoints(toStore)
  }

  /**
   * Destroys stored credentials whose Endpoint no longer exists (MAR-2642).
   *
   * The residue handler for the order above, and self-healing by construction:
   * every credential this store holds belongs to an Endpoint, so an account
   * that is not one of the stored ids is garbage whatever left it there — a
   * cleanup the Keychain refused, or a quit between the commit and it.
   *
   * Liveness is passed as a question rather than a list so the store can ask it
   * again at each delete, against the rows as they are then. Answers with the
   * accounts it emptied, so a caller can say what it did rather than that it
   * ran.
   */
  async sweepOrphanedExecutionHostCredentials(): Promise<string[]> {
    return this.executionHostCredentials.sweepEndpoints(
      (endpointId) => !!this.executionHostEndpoints.getById(endpointId),
    )
  }

  /**
   * The stored Endpoints, read synchronously (MAR-2642).
   *
   * `getAppSettings` is asynchronous only because it validates against provider
   * descriptors, which have nothing to say about which machines exist. A caller
   * that must resolve an Endpoint id *before* its first `await` — because what
   * follows takes a credential queue, and anything awaited before that can be
   * overtaken by the removal it is racing — has no business loading descriptors
   * to do it.
   */
  listExecutionHostEndpoints(): ExecutionHostEndpoint[] {
    return this.executionHostEndpoints.list()
  }

  async resolveNamingModel(providerId: string): Promise<string | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    const stored = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const override = stored.namingModelByProvider[providerId]
    if (override) return override

    if (descriptor.fastModelId) {
      const exists = descriptor.modelOptions.some(
        (option) => option.id === descriptor.fastModelId,
      )
      if (exists) return descriptor.fastModelId
    }

    return descriptor.defaultModelId ?? null
  }

  async resolveExtractionModel(
    providerId: string,
    options: { preferFastDefault?: boolean } = {},
  ): Promise<string | null> {
    const descriptors = await this.loadDescriptors()
    const descriptor = descriptors.find((item) => item.id === providerId)
    if (!descriptor) return null

    const stored = validateAppSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )

    const override = stored.extractionModelByProvider[providerId]
    if (override) return override

    if (options.preferFastDefault && descriptor.fastModelId) {
      const exists = descriptor.modelOptions.some(
        (option) => option.id === descriptor.fastModelId,
      )
      if (exists) return descriptor.fastModelId
    }

    return descriptor.defaultModelId ?? null
  }

  async resolveSessionDefaults(): Promise<ResolvedSessionDefaults | null> {
    const descriptors = await this.loadDescriptors()
    return resolveSessionDefaultsFromSettings(
      parseAppSettings(this.stateService.get(APP_SETTINGS_KEY)),
      descriptors,
    )
  }
}
