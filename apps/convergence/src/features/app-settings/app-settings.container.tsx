import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { FC } from 'react'
import {
  resolveProviderSelection,
  providerApi,
  selectLocalProviders,
  useSessionStore,
  type ReasoningEffort,
  type ProviderInfo,
} from '@/entities/session'
import {
  notificationsApi,
  type NotificationPrefs,
  type NotificationSeverity,
} from '@/entities/notifications'
import {
  appSettingsApi,
  DEFAULT_COMMAND_CENTER_SHORTCUT,
  executionHostApi,
  executionHostDaemonCredentialsApi,
  useAppSettingsStore,
  type AppSettings,
  type AppSettingsInput,
  type CommandCenterShortcutPrefs,
  type ContextAlertSettings,
  type DebugLoggingPrefs,
  type ExecutionHostDaemonEnvironmentOverride,
} from '@/entities/app-settings'
import {
  findShortcutConflict,
  formatShortcutLabel,
  resolveShortcutRecording,
  shortcutPlatformFromOs,
} from '@/shared/lib/keyboard-shortcut.pure'
import { providerDebugApi } from '@/entities/provider-debug'
import { useDialogStore } from '@/entities/dialog'
import { useUpdatesStore, type UpdatePrefs } from '@/entities/updates'
import { systemApi } from '@/shared'
import { useSaveAsYouGo } from '@/shared/lib/use-save-as-you-go'
import {
  AppSettingsDialog,
  type AppSettingsSectionId,
} from './app-settings.presentational'
import {
  describeOrphanedExecutionHostEnvironmentOverride,
  executionHostEndpointDrafts,
  executionHostSessionCounts,
  nextExecutionHostEndpointId,
  persistableExecutionHostEndpoints,
  type ExecutionHostEndpointDraft,
  type ExecutionHostSessionCounts,
} from './execution-host-settings.pure'

interface AppSettingsContainerProps {
  /** What opens it; left out where the dialog store opens it (the sidebar's menus). */
  trigger?: ReactElement
}

interface Draft {
  providerId: string
  modelId: string
  effortId: ReasoningEffort | ''
}

const EMPTY_DRAFT: Draft = { providerId: '', modelId: '', effortId: '' }
const EMPTY_NAMING_DRAFT: Record<string, string> = {}
const EMPTY_EXTRACTION_DRAFT: Record<string, string> = {}
const DEFAULT_SECTION: AppSettingsSectionId = 'session-defaults'

/**
 * Settings saves as you go (DS4, R6): a switch or a choice is kept at once; a
 * typed value once the typing has paused this long, and at once when the
 * dialog closes.
 */
const SAVE_NOW_MS = 0
const SAVE_AFTER_TYPING_MS = 400

/** Everything Settings is editing, as it stands: what each save is built from. */
interface SettingsDrafts {
  selection: ReturnType<typeof resolveProviderSelection>
  naming: Record<string, string>
  extraction: Record<string, string>
  endpoints: readonly ExecutionHostEndpointDraft[]
  notifications: NotificationPrefs | null
  updates: UpdatePrefs | null
  debugLogging: DebugLoggingPrefs | null
  contextAlert: ContextAlertSettings | null
  describeWorkBlocks: boolean | null
  piModels: string[] | null
  shortcut: CommandCenterShortcutPrefs | null
}

/**
 * The whole settings record a save writes: each draft, else what is stored.
 * A shortcut that collides with another binding, and an endpoint whose address
 * isn't valid yet, keep their stored values, so a half-made change never
 * replaces a working one.
 */
function settingsInput(
  drafts: SettingsDrafts,
  stored: AppSettings,
): AppSettingsInput {
  const shortcut = drafts.shortcut ?? stored.commandCenterShortcut
  return {
    defaultProviderId: drafts.selection.providerId || null,
    defaultModelId: drafts.selection.modelId || null,
    defaultEffortId: drafts.selection.effort?.id ?? null,
    namingModelByProvider: drafts.naming,
    extractionModelByProvider: drafts.extraction,
    commandCenterShortcut: findShortcutConflict(shortcut)
      ? stored.commandCenterShortcut
      : shortcut,
    // The list is the whole fact (MAR-2642). Each row keeps the id it was
    // seeded with, so editing a name or an address is an edit to the machine
    // sessions already point at rather than a new one; a row is only gone
    // because it was explicitly removed.
    executionHostEndpoints: persistableExecutionHostEndpoints(
      drafts.endpoints,
      stored.executionHostEndpoints,
    ),
    notifications: drafts.notifications ?? stored.notifications,
    onboarding: stored.onboarding,
    updates: drafts.updates ?? stored.updates,
    debugLogging: drafts.debugLogging ?? stored.debugLogging,
    contextAlert: drafts.contextAlert ?? stored.contextAlert,
    describeWorkBlocks: drafts.describeWorkBlocks ?? stored.describeWorkBlocks,
    piModelVisibility: {
      additionalModelIds:
        drafts.piModels ?? stored.piModelVisibility.additionalModelIds,
    },
    favoriteModels: stored.favoriteModels,
  }
}

function isAppSettingsSection(value: unknown): value is AppSettingsSectionId {
  return (
    value === 'session-defaults' ||
    value === 'session-naming' ||
    value === 'session-forking' ||
    value === 'credentials' ||
    value === 'provider-accounts' ||
    value === 'usage' ||
    value === 'pi-models' ||
    value === 'notifications' ||
    value === 'updates' ||
    value === 'insights' ||
    value === 'shortcuts' ||
    value === 'debug-logging'
  )
}

export const AppSettingsDialogContainer: FC<AppSettingsContainerProps> = ({
  trigger,
}) => {
  const open = useDialogStore((s) => s.openDialog === 'app-settings')
  const payload = useDialogStore((s) => s.payload)
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [namingDraft, setNamingDraft] =
    useState<Record<string, string>>(EMPTY_NAMING_DRAFT)
  const [extractionDraft, setExtractionDraft] = useState<
    Record<string, string>
  >(EMPTY_EXTRACTION_DRAFT)
  const [executionHostEndpointsDraft, setExecutionHostEndpointsDraft] =
    useState<ExecutionHostEndpointDraft[]>([])
  const [sessionCounts, setSessionCounts] =
    useState<ExecutionHostSessionCounts>({ status: 'counting' })
  const [environmentOverride, setEnvironmentOverride] =
    useState<ExecutionHostDaemonEnvironmentOverride | null>(null)
  const [notificationsDraft, setNotificationsDraft] =
    useState<NotificationPrefs | null>(null)
  const [updatesDraft, setUpdatesDraft] = useState<UpdatePrefs | null>(null)
  const [debugLoggingDraft, setDebugLoggingDraft] =
    useState<DebugLoggingPrefs | null>(null)
  const [contextAlertDraft, setContextAlertDraft] =
    useState<ContextAlertSettings | null>(null)
  const [describeWorkBlocksDraft, setDescribeWorkBlocksDraft] = useState<
    boolean | null
  >(null)
  const [piModelDraft, setPiModelDraft] = useState<string[] | null>(null)
  const [shortcutsDraft, setShortcutsDraft] =
    useState<CommandCenterShortcutPrefs | null>(null)
  const [shortcutsConflict, setShortcutsConflict] = useState<string | null>(
    null,
  )
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([])
  const [activeSection, setActiveSection] =
    useState<AppSettingsSectionId>(DEFAULT_SECTION)

  const providers = useSessionStore(selectLocalProviders)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const settings = useAppSettingsStore((s) => s.settings)
  const isLoaded = useAppSettingsStore((s) => s.isLoaded)
  const error = useAppSettingsStore((s) => s.error)
  const loadSettings = useAppSettingsStore((s) => s.load)
  const saveSettings = useAppSettingsStore((s) => s.save)
  const clearError = useAppSettingsStore((s) => s.clearError)

  const updatesStatus = useUpdatesStore((s) => s.status)
  const updatesVersion = useUpdatesStore((s) => s.currentVersion)
  const updatesIsDev = useUpdatesStore((s) => s.isDev)
  const checkForUpdates = useUpdatesStore((s) => s.check)
  const downloadUpdate = useUpdatesStore((s) => s.download)
  const installUpdate = useUpdatesStore((s) => s.install)
  const openReleaseNotes = useUpdatesStore((s) => s.openReleaseNotes)

  useEffect(() => {
    if (open) {
      loadProviders()
      void providerApi.getAllAvailable().then(setAllProviders)
      if (!isLoaded) void loadSettings()
    }
  }, [open, loadProviders, loadSettings, isLoaded])

  /**
   * How many sessions name each execution host, counted afresh every time the
   * dialog opens so a removal can state what it costs.
   *
   * Reset to "counting" first: sessions start, finish and are deleted while
   * Settings is closed, so a count kept from the last open is a number about a
   * different moment, and a stale zero would authorise a removal that strands
   * live sessions. A failure says so rather than reporting none — presenting a
   * destructive removal as free is the lie this era exists to prevent.
   */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSessionCounts({ status: 'counting' })
    void (async () => {
      try {
        const counts = await executionHostApi.sessionCountsByEndpoint()
        if (!cancelled) setSessionCounts(executionHostSessionCounts(counts))
      } catch {
        if (!cancelled) setSessionCounts({ status: 'failed' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  /**
   * Collects the daemon-credential cleanup debt, every time the dialog opens
   * (MAR-2642).
   *
   * A removal commits the settings before it destroys the token, so a Keychain
   * that refused the cleanup leaves an entry filed under an id no Endpoint will
   * ever bear again. Settings are loaded once and then kept, so a sweep that
   * only rode along with that load would run at most once per launch — the user
   * whose cleanup just failed would have to quit the app to have it retried.
   * This is the surface where the removal was made, so reopening it is the
   * gesture that should collect the debt.
   *
   * Fired and not awaited: nothing on this dialog waits on `security`, and a
   * sweep that cannot run today is simply asked for again on the next open.
   */
  useEffect(() => {
    if (!open) return
    void appSettingsApi.sweepExecutionHostCredentials().catch(() => {})
  }, [open])

  /**
   * Whether the environment override exists, read afresh every time the dialog
   * opens (MAR-2642).
   *
   * It is process environment, so it changes only between launches — but it is
   * also the one daemon credential no sweep can collect and no Endpoint row
   * records. Reset to null first so a stale "it is set" from a previous open
   * cannot outlive the answer, and a failure leaves it null: silence is the
   * honest reading of "Convergence could not ask".
   */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setEnvironmentOverride(null)
    void executionHostDaemonCredentialsApi
      .environmentOverride()
      .then((override) => {
        if (!cancelled) setEnvironmentOverride(override)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const requestedSection =
      payload &&
      'appSettingsSection' in payload &&
      isAppSettingsSection(payload.appSettingsSection)
        ? payload.appSettingsSection
        : DEFAULT_SECTION
    setActiveSection(requestedSection)
  }, [open, payload])

  /**
   * Whether the drafts hold what is stored yet: nothing is saved before they
   * do, or a change made while the settings were still loading would write
   * empty drafts over them.
   */
  const seeded = useRef(false)

  /**
   * Seeds every draft from what is stored, once per open (and once the
   * settings have loaded). Not again on each save: Settings saves as you go,
   * and a reseed from a save's answer would overwrite what is being typed.
   */
  useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (!isLoaded) return
    const stored = useAppSettingsStore.getState().settings
    setDraft({
      providerId: stored.defaultProviderId ?? '',
      modelId: stored.defaultModelId ?? '',
      effortId: stored.defaultEffortId ?? '',
    })
    setNamingDraft({ ...stored.namingModelByProvider })
    setExtractionDraft({ ...stored.extractionModelByProvider })
    setExecutionHostEndpointsDraft(
      executionHostEndpointDrafts(stored.executionHostEndpoints),
    )
    setNotificationsDraft(stored.notifications)
    setUpdatesDraft(stored.updates)
    setDebugLoggingDraft(stored.debugLogging)
    setContextAlertDraft(stored.contextAlert)
    setDescribeWorkBlocksDraft(stored.describeWorkBlocks)
    setPiModelDraft(stored.piModelVisibility.additionalModelIds)
    setShortcutsDraft(stored.commandCenterShortcut)
    setShortcutsConflict(null)
    setIsRecordingShortcut(false)
    clearError()
    seeded.current = true
  }, [open, isLoaded, clearError])

  const selection = useMemo(
    () =>
      resolveProviderSelection(
        providers,
        draft.providerId || null,
        draft.modelId || null,
        draft.effortId || null,
      ),
    [providers, draft],
  )

  // What every save is built from, as of the latest render: a save that runs
  // after a change reads the change, and one queued behind another reads
  // whatever came after it.
  const drafts = useRef<SettingsDrafts | null>(null)
  drafts.current = {
    selection,
    naming: namingDraft,
    extraction: extractionDraft,
    endpoints: executionHostEndpointsDraft,
    notifications: notificationsDraft,
    updates: updatesDraft,
    debugLogging: debugLoggingDraft,
    contextAlert: contextAlertDraft,
    describeWorkBlocks: describeWorkBlocksDraft,
    piModels: piModelDraft,
    shortcut: shortcutsDraft,
  }
  /**
   * Saves what Settings holds, after any save still under way; on close, and
   * when the dialog goes, whatever still waits is saved (useSaveAsYouGo).
   */
  const { scheduleSave, flush } = useSaveAsYouGo(() => {
    // Read now, not when its turn comes: closing unseeds the drafts, and the
    // save that closing flushes may wait behind one still under way.
    const ready = seeded.current
    return async () => {
      const current = drafts.current
      if (!ready || !current) return
      try {
        await saveSettings(
          settingsInput(current, useAppSettingsStore.getState().settings),
        )
        // The Pi model list and the defaults decide what providers offer.
        await loadProviders()
      } catch {
        // The store keeps the error, and the dialog shows it.
      }
    }
  })

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        openDialog('app-settings')
        return
      }
      flush()
      closeDialog()
    },
    [openDialog, closeDialog, flush],
  )

  const handleProviderChange = useCallback(
    (nextProviderId: string) => {
      const next = resolveProviderSelection(
        providers,
        nextProviderId,
        null,
        null,
      )
      setDraft({
        providerId: next.providerId,
        modelId: next.modelId,
        effortId: next.effortId,
      })
      scheduleSave(SAVE_NOW_MS)
    },
    [providers, scheduleSave],
  )

  const handleModelChange = useCallback(
    (nextModelId: string, nextProviderId?: string) => {
      const next = resolveProviderSelection(
        providers,
        nextProviderId ?? (draft.providerId || null),
        nextModelId,
        null,
      )
      setDraft((current) => ({
        ...current,
        providerId: next.providerId,
        modelId: next.modelId,
        effortId: next.effortId,
      }))
      scheduleSave(SAVE_NOW_MS)
    },
    [providers, draft.providerId, scheduleSave],
  )

  const handleEffortChange = useCallback(
    (nextEffortId: ReasoningEffort | '') => {
      setDraft((current) => ({ ...current, effortId: nextEffortId }))
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleNamingModelChange = useCallback(
    (providerId: string, modelId: string) => {
      setNamingDraft((current) => ({ ...current, [providerId]: modelId }))
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleExtractionModelChange = useCallback(
    (providerId: string, modelId: string) => {
      setExtractionDraft((current) => ({ ...current, [providerId]: modelId }))
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleExecutionHostLabelChange = useCallback(
    (endpointId: string, value: string) => {
      setExecutionHostEndpointsDraft((current) =>
        current.map((draft) =>
          draft.id === endpointId ? { ...draft, label: value } : draft,
        ),
      )
      scheduleSave(SAVE_AFTER_TYPING_MS)
    },
    [scheduleSave],
  )

  const handleExecutionHostBaseUrlChange = useCallback(
    (endpointId: string, value: string) => {
      setExecutionHostEndpointsDraft((current) =>
        current.map((draft) =>
          draft.id === endpointId ? { ...draft, baseUrl: value } : draft,
        ),
      )
      scheduleSave(SAVE_AFTER_TYPING_MS)
    },
    [scheduleSave],
  )

  const handleAddExecutionHostEndpoint = useCallback(() => {
    setExecutionHostEndpointsDraft((current) => [
      ...current,
      {
        id: nextExecutionHostEndpointId(current, () => crypto.randomUUID()),
        label: '',
        baseUrl: '',
      },
    ])
  }, [])

  const handleRemoveExecutionHostEndpoint = useCallback(
    (endpointId: string) => {
      setExecutionHostEndpointsDraft((current) =>
        current.filter((draft) => draft.id !== endpointId),
      )
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleRestoreDefaults = useCallback(() => {
    const fallback = resolveProviderSelection(providers, null, null, null)
    setDraft({
      providerId: fallback.providerId,
      modelId: fallback.modelId,
      effortId: fallback.effortId,
    })
    scheduleSave(SAVE_NOW_MS)
  }, [providers, scheduleSave])

  const handleNotificationsChange = useCallback(
    (next: NotificationPrefs) => {
      setNotificationsDraft(next)
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleTestFire = useCallback((severity: NotificationSeverity) => {
    void notificationsApi.testFire(severity)
  }, [])

  const handleToggleBackgroundUpdates = useCallback(
    (next: boolean) => {
      setUpdatesDraft({ backgroundCheckEnabled: next })
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleCheckNow = useCallback(() => {
    void checkForUpdates()
  }, [checkForUpdates])

  const handleDownloadUpdate = useCallback(() => {
    void downloadUpdate()
  }, [downloadUpdate])

  const handleInstallUpdate = useCallback(() => {
    void installUpdate()
  }, [installUpdate])

  const handleOpenReleaseNotes = useCallback(() => {
    void openReleaseNotes()
  }, [openReleaseNotes])

  const handleToggleDebugLogging = useCallback(
    (next: boolean) => {
      setDebugLoggingDraft({ enabled: next })
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleToggleDescribeWorkBlocks = useCallback(
    (next: boolean) => {
      setDescribeWorkBlocksDraft(next)
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  // Its numbers are typed, so they wait for the typing to pause.
  const handleContextAlertChange = useCallback(
    (next: ContextAlertSettings) => {
      setContextAlertDraft(next)
      scheduleSave(SAVE_AFTER_TYPING_MS)
    },
    [scheduleSave],
  )

  const handleTogglePiModel = useCallback(
    (modelId: string, next: boolean) => {
      setPiModelDraft((current) => {
        const ids = new Set(current ?? [])
        if (next) ids.add(modelId)
        else ids.delete(modelId)
        return [...ids]
      })
      scheduleSave(SAVE_NOW_MS)
    },
    [scheduleSave],
  )

  const handleOpenDebugLogFolder = useCallback(() => {
    void providerDebugApi.openFolder()
  }, [])

  const handleStartRecordShortcut = useCallback(() => {
    setShortcutsConflict(null)
    setIsRecordingShortcut(true)
  }, [])

  const handleRestoreCommandCenterShortcut = useCallback(() => {
    setShortcutsDraft(DEFAULT_COMMAND_CENTER_SHORTCUT)
    setShortcutsConflict(null)
    scheduleSave(SAVE_NOW_MS)
  }, [scheduleSave])

  useEffect(() => {
    if (!isRecordingShortcut) return

    const handler = (event: KeyboardEvent) => {
      const result = resolveShortcutRecording(event)
      if (result.kind === 'ignore') return

      if (result.kind === 'cancel') {
        event.preventDefault()
        event.stopPropagation()
        setIsRecordingShortcut(false)
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (result.kind === 'invalid-key') {
        setShortcutsConflict(
          'Use a single letter or number key with the primary modifier.',
        )
        setIsRecordingShortcut(false)
        return
      }

      if (result.kind === 'conflict') {
        setShortcutsConflict(result.message)
        setIsRecordingShortcut(false)
        return
      }

      setShortcutsDraft(result.binding)
      setShortcutsConflict(null)
      setIsRecordingShortcut(false)
      scheduleSave(SAVE_NOW_MS)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isRecordingShortcut, scheduleSave])

  const platform = useMemo<string | null>(() => {
    const datasetPlatform = document.documentElement.dataset.platform
    if (datasetPlatform) return datasetPlatform
    return systemApi.getInfo()?.platform ?? null
  }, [])

  const executionHostEnvironmentOverrideWarning = useMemo(
    () =>
      describeOrphanedExecutionHostEnvironmentOverride({
        override: environmentOverride,
        savedEndpoints: settings.executionHostEndpoints,
      }),
    [environmentOverride, settings.executionHostEndpoints],
  )

  const commandCenterShortcutDraft =
    shortcutsDraft ?? settings.commandCenterShortcut
  const commandCenterShortcutLabel = formatShortcutLabel(
    commandCenterShortcutDraft,
    shortcutPlatformFromOs(platform),
  )

  return (
    <AppSettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      providers={providers}
      allProviders={allProviders}
      selection={selection}
      namingDraft={namingDraft}
      extractionDraft={extractionDraft}
      executionHostEndpointsDraft={executionHostEndpointsDraft}
      executionHostSavedEndpoints={settings.executionHostEndpoints}
      executionHostSessionCounts={sessionCounts}
      executionHostEnvironmentOverrideWarning={
        executionHostEnvironmentOverrideWarning
      }
      notificationsDraft={notificationsDraft ?? settings.notifications}
      updatesDraft={updatesDraft ?? settings.updates}
      debugLoggingDraft={debugLoggingDraft ?? settings.debugLogging}
      contextAlertDraft={contextAlertDraft ?? settings.contextAlert}
      describeWorkBlocksDraft={
        describeWorkBlocksDraft ?? settings.describeWorkBlocks
      }
      piModelIdsDraft={
        piModelDraft ?? settings.piModelVisibility.additionalModelIds
      }
      updatesStatus={updatesStatus}
      updatesVersion={updatesVersion}
      updatesIsDev={updatesIsDev}
      platform={platform}
      error={error}
      activeSection={activeSection}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={handleEffortChange}
      onNamingModelChange={handleNamingModelChange}
      onExtractionModelChange={handleExtractionModelChange}
      onAddExecutionHostEndpoint={handleAddExecutionHostEndpoint}
      onExecutionHostLabelChange={handleExecutionHostLabelChange}
      onExecutionHostBaseUrlChange={handleExecutionHostBaseUrlChange}
      onRemoveExecutionHostEndpoint={handleRemoveExecutionHostEndpoint}
      onNotificationsChange={handleNotificationsChange}
      onTestFireNotification={handleTestFire}
      onToggleBackgroundUpdates={handleToggleBackgroundUpdates}
      onCheckUpdates={handleCheckNow}
      onDownloadUpdate={handleDownloadUpdate}
      onInstallUpdate={handleInstallUpdate}
      onOpenReleaseNotes={handleOpenReleaseNotes}
      onToggleDebugLogging={handleToggleDebugLogging}
      onContextAlertChange={handleContextAlertChange}
      onToggleDescribeWorkBlocks={handleToggleDescribeWorkBlocks}
      onTogglePiModel={handleTogglePiModel}
      onOpenDebugLogFolder={handleOpenDebugLogFolder}
      commandCenterShortcutDraft={commandCenterShortcutDraft}
      commandCenterShortcutLabel={commandCenterShortcutLabel}
      shortcutsConflict={shortcutsConflict}
      isRecordingShortcut={isRecordingShortcut}
      onStartRecordShortcut={handleStartRecordShortcut}
      onRestoreCommandCenterShortcut={handleRestoreCommandCenterShortcut}
      onSectionChange={setActiveSection}
      onRestoreDefaults={handleRestoreDefaults}
    />
  )
}
