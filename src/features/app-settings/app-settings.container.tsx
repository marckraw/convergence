import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import {
  notificationsApi,
  type NotificationPrefs,
  type NotificationSeverity,
} from '@/entities/notifications'
import {
  useAppSettingsStore,
  type DebugLoggingPrefs,
} from '@/entities/app-settings'
import { providerDebugApi } from '@/entities/provider-debug'
import { useDialogStore } from '@/entities/dialog'
import { useUpdatesStore, type UpdatePrefs } from '@/entities/updates'
import { systemApi } from '@/shared'
import {
  AppSettingsDialog,
  type AppSettingsSectionId,
} from './app-settings.presentational'

interface AppSettingsContainerProps {
  trigger: ReactNode
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

function isAppSettingsSection(value: unknown): value is AppSettingsSectionId {
  return (
    value === 'session-defaults' ||
    value === 'session-naming' ||
    value === 'session-forking' ||
    value === 'notifications' ||
    value === 'updates' ||
    value === 'insights' ||
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
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('app-settings')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [namingDraft, setNamingDraft] =
    useState<Record<string, string>>(EMPTY_NAMING_DRAFT)
  const [extractionDraft, setExtractionDraft] = useState<
    Record<string, string>
  >(EMPTY_EXTRACTION_DRAFT)
  const [notificationsDraft, setNotificationsDraft] =
    useState<NotificationPrefs | null>(null)
  const [updatesDraft, setUpdatesDraft] = useState<UpdatePrefs | null>(null)
  const [debugLoggingDraft, setDebugLoggingDraft] =
    useState<DebugLoggingPrefs | null>(null)
  const [activeSection, setActiveSection] =
    useState<AppSettingsSectionId>(DEFAULT_SECTION)

  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const settings = useAppSettingsStore((s) => s.settings)
  const isLoaded = useAppSettingsStore((s) => s.isLoaded)
  const isSaving = useAppSettingsStore((s) => s.isSaving)
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
      if (!isLoaded) void loadSettings()
    }
  }, [open, loadProviders, loadSettings, isLoaded])

  useEffect(() => {
    if (!open) return
    const requestedSection =
      payload &&
      'appSettingsSection' in payload &&
      isAppSettingsSection(payload.appSettingsSection)
        ? payload.appSettingsSection
        : DEFAULT_SECTION
    setActiveSection(requestedSection)
    setDraft({
      providerId: settings.defaultProviderId ?? '',
      modelId: settings.defaultModelId ?? '',
      effortId: settings.defaultEffortId ?? '',
    })
    setNamingDraft({ ...settings.namingModelByProvider })
    setExtractionDraft({ ...settings.extractionModelByProvider })
    setNotificationsDraft(settings.notifications)
    setUpdatesDraft(settings.updates)
    setDebugLoggingDraft(settings.debugLogging)
    clearError()
  }, [open, payload, settings, clearError])

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
    },
    [providers],
  )

  const handleModelChange = useCallback(
    (nextModelId: string) => {
      const next = resolveProviderSelection(
        providers,
        draft.providerId || null,
        nextModelId,
        null,
      )
      setDraft((current) => ({
        ...current,
        modelId: next.modelId,
        effortId: next.effortId,
      }))
    },
    [providers, draft.providerId],
  )

  const handleEffortChange = useCallback(
    (nextEffortId: ReasoningEffort | '') => {
      setDraft((current) => ({ ...current, effortId: nextEffortId }))
    },
    [],
  )

  const handleNamingModelChange = useCallback(
    (providerId: string, modelId: string) => {
      setNamingDraft((current) => ({ ...current, [providerId]: modelId }))
    },
    [],
  )

  const handleExtractionModelChange = useCallback(
    (providerId: string, modelId: string) => {
      setExtractionDraft((current) => ({ ...current, [providerId]: modelId }))
    },
    [],
  )

  const handleRestoreDefaults = useCallback(() => {
    const fallback = resolveProviderSelection(providers, null, null, null)
    setDraft({
      providerId: fallback.providerId,
      modelId: fallback.modelId,
      effortId: fallback.effortId,
    })
  }, [providers])

  const handleNotificationsChange = useCallback((next: NotificationPrefs) => {
    setNotificationsDraft(next)
  }, [])

  const handleTestFire = useCallback((severity: NotificationSeverity) => {
    void notificationsApi.testFire(severity)
  }, [])

  const handleToggleBackgroundUpdates = useCallback((next: boolean) => {
    setUpdatesDraft({ backgroundCheckEnabled: next })
  }, [])

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

  const handleToggleDebugLogging = useCallback((next: boolean) => {
    setDebugLoggingDraft({ enabled: next })
  }, [])

  const handleOpenDebugLogFolder = useCallback(() => {
    void providerDebugApi.openFolder()
  }, [])

  const platform = useMemo<string | null>(() => {
    const datasetPlatform = document.documentElement.dataset.platform
    if (datasetPlatform) return datasetPlatform
    return systemApi.getInfo()?.platform ?? null
  }, [])

  const handleCancel = useCallback(() => {
    closeDialog()
  }, [closeDialog])

  const handleSave = useCallback(async () => {
    try {
      await saveSettings({
        defaultProviderId: selection.providerId || null,
        defaultModelId: selection.modelId || null,
        defaultEffortId: selection.effort?.id ?? null,
        namingModelByProvider: namingDraft,
        extractionModelByProvider: extractionDraft,
        notifications: notificationsDraft ?? settings.notifications,
        onboarding: settings.onboarding,
        updates: updatesDraft ?? settings.updates,
        debugLogging: debugLoggingDraft ?? settings.debugLogging,
      })
      closeDialog()
    } catch {
      // error already surfaced on store
    }
  }, [
    saveSettings,
    selection,
    namingDraft,
    extractionDraft,
    notificationsDraft,
    updatesDraft,
    debugLoggingDraft,
    settings.notifications,
    settings.onboarding,
    settings.updates,
    settings.debugLogging,
    closeDialog,
  ])

  return (
    <AppSettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      providers={providers}
      selection={selection}
      namingDraft={namingDraft}
      extractionDraft={extractionDraft}
      notificationsDraft={notificationsDraft ?? settings.notifications}
      updatesDraft={updatesDraft ?? settings.updates}
      debugLoggingDraft={debugLoggingDraft ?? settings.debugLogging}
      updatesStatus={updatesStatus}
      updatesVersion={updatesVersion}
      updatesIsDev={updatesIsDev}
      platform={platform}
      isSaving={isSaving}
      error={error}
      activeSection={activeSection}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={handleEffortChange}
      onNamingModelChange={handleNamingModelChange}
      onExtractionModelChange={handleExtractionModelChange}
      onNotificationsChange={handleNotificationsChange}
      onTestFireNotification={handleTestFire}
      onToggleBackgroundUpdates={handleToggleBackgroundUpdates}
      onCheckUpdates={handleCheckNow}
      onDownloadUpdate={handleDownloadUpdate}
      onInstallUpdate={handleInstallUpdate}
      onOpenReleaseNotes={handleOpenReleaseNotes}
      onToggleDebugLogging={handleToggleDebugLogging}
      onOpenDebugLogFolder={handleOpenDebugLogFolder}
      onSectionChange={setActiveSection}
      onSave={handleSave}
      onCancel={handleCancel}
      onRestoreDefaults={handleRestoreDefaults}
    />
  )
}
