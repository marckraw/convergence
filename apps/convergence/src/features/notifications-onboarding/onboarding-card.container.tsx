import { useCallback } from 'react'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import { NotificationsOnboardingCard } from './onboarding-card.presentational'

export function NotificationsOnboardingContainer() {
  const settings = useAppSettingsStore((s) => s.settings)
  const isLoaded = useAppSettingsStore((s) => s.isLoaded)
  const save = useAppSettingsStore((s) => s.save)
  const activeProject = useProjectStore((s) => s.activeProject)
  const openDialog = useDialogStore((s) => s.open)

  const dismiss = useCallback(() => {
    void save({
      ...settings,
      onboarding: {
        ...settings.onboarding,
        notificationsCardDismissed: true,
      },
    })
  }, [save, settings])

  const openSettings = useCallback(() => {
    openDialog('app-settings')
  }, [openDialog])

  if (!isLoaded) return null
  if (!activeProject) return null
  if (settings.onboarding.notificationsCardDismissed) return null

  return (
    <NotificationsOnboardingCard
      onOpenSettings={openSettings}
      onDismiss={dismiss}
    />
  )
}
