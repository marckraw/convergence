import { useEffect, useMemo, useRef } from 'react'
import { notify } from '@convergence/ui'
import {
  isAutomaticallyUpdatable,
  useProviderUpdatesStore,
} from '@/entities/provider-updates'
import { useDialogStore } from '@/entities/dialog'

const AVAILABLE_TOAST_ID = 'provider-updates:available'
const UPDATING_TOAST_ID = 'provider-updates:updating'

export function ProviderUpdatesToastContainer() {
  const statuses = useProviderUpdatesStore((s) => s.statuses)
  const updatingProviderId = useProviderUpdatesStore(
    (s) => s.updatingProviderId,
  )
  const lastResult = useProviderUpdatesStore((s) => s.lastResult)
  const updateProvider = useProviderUpdatesStore((s) => s.updateProvider)
  const updateAllOutdated = useProviderUpdatesStore((s) => s.updateAllOutdated)
  const clearResult = useProviderUpdatesStore((s) => s.clearResult)
  const openDialog = useDialogStore((s) => s.open)

  const lastAvailableKeyRef = useRef<string | null>(null)

  const outdatedProviders = useMemo(
    () => statuses.filter(isAutomaticallyUpdatable),
    [statuses],
  )

  useEffect(() => {
    if (outdatedProviders.length === 0) {
      notify.dismiss(AVAILABLE_TOAST_ID)
      lastAvailableKeyRef.current = null
      return
    }

    const key = outdatedProviders
      .map((provider) => `${provider.id}:${provider.update.latestVersion}`)
      .join('|')
    if (lastAvailableKeyRef.current === key) return
    lastAvailableKeyRef.current = key

    const first = outdatedProviders[0]!
    const multiple = outdatedProviders.length > 1
    notify.info(
      multiple
        ? `${outdatedProviders.length} provider updates available`
        : `Provider update available — ${first.name} ${first.update.latestVersion}`,
      {
        id: AVAILABLE_TOAST_ID,
        description: multiple
          ? 'Update local provider CLIs when you are ready.'
          : `${first.update.currentVersion ?? 'Installed'} → ${
              first.update.latestVersion
            }`,
        action: {
          label: multiple ? 'Update all' : 'Update',
          onClick: () => {
            if (multiple) void updateAllOutdated()
            else void updateProvider(first.id)
          },
        },
        secondaryAction: {
          label: 'Providers',
          onClick: () => openDialog('providers'),
        },
        persistent: true,
      },
    )
  }, [openDialog, outdatedProviders, updateAllOutdated, updateProvider])

  useEffect(() => {
    if (!updatingProviderId) {
      notify.dismiss(UPDATING_TOAST_ID)
      return
    }

    const provider = statuses.find((item) => item.id === updatingProviderId)
    notify.loading(`Updating ${provider?.name ?? updatingProviderId}…`, {
      id: UPDATING_TOAST_ID,
      persistent: true,
    })
  }, [statuses, updatingProviderId])

  useEffect(() => {
    if (!lastResult) return

    if (lastResult.ok) {
      notify.success(`${lastResult.providerName} updated`, {
        description: 'New sessions will use the refreshed provider.',
      })
    } else {
      notify.failure(`update ${lastResult.providerName}`, lastResult.error, {
        action: {
          label: 'Providers',
          onClick: () => openDialog('providers'),
        },
      })
    }

    clearResult()
  }, [clearResult, lastResult, openDialog])

  return null
}
