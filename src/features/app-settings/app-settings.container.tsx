import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { AppSettingsDialog } from './app-settings.presentational'

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

export const AppSettingsDialogContainer: FC<AppSettingsContainerProps> = ({
  trigger,
}) => {
  const open = useDialogStore((s) => s.openDialog === 'app-settings')
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

  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const settings = useAppSettingsStore((s) => s.settings)
  const isLoaded = useAppSettingsStore((s) => s.isLoaded)
  const isSaving = useAppSettingsStore((s) => s.isSaving)
  const error = useAppSettingsStore((s) => s.error)
  const loadSettings = useAppSettingsStore((s) => s.load)
  const saveSettings = useAppSettingsStore((s) => s.save)
  const clearError = useAppSettingsStore((s) => s.clearError)

  useEffect(() => {
    if (open) {
      loadProviders()
      if (!isLoaded) void loadSettings()
    }
  }, [open, loadProviders, loadSettings, isLoaded])

  useEffect(() => {
    if (!open) return
    setDraft({
      providerId: settings.defaultProviderId ?? '',
      modelId: settings.defaultModelId ?? '',
      effortId: settings.defaultEffortId ?? '',
    })
    setNamingDraft({ ...settings.namingModelByProvider })
    clearError()
  }, [open, settings, clearError])

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

  const handleRestoreDefaults = useCallback(() => {
    const fallback = resolveProviderSelection(providers, null, null, null)
    setDraft({
      providerId: fallback.providerId,
      modelId: fallback.modelId,
      effortId: fallback.effortId,
    })
  }, [providers])

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
      })
      closeDialog()
    } catch {
      // error already surfaced on store
    }
  }, [saveSettings, selection, namingDraft, closeDialog])

  return (
    <AppSettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      providers={providers}
      selection={selection}
      namingDraft={namingDraft}
      isSaving={isSaving}
      error={error}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={handleEffortChange}
      onNamingModelChange={handleNamingModelChange}
      onSave={handleSave}
      onCancel={handleCancel}
      onRestoreDefaults={handleRestoreDefaults}
    />
  )
}
