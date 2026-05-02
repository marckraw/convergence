import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useWorkboardStore, workboardApi } from '@/entities/workboard'
import { RalphTaskDashboardView } from './ralph-task-dashboard.presentational'

export const RalphTaskDashboard: FC = () => {
  const snapshot = useWorkboardStore((state) => state.snapshot)
  const loading = useWorkboardStore((state) => state.loading)
  const operation = useWorkboardStore((state) => state.operation)
  const error = useWorkboardStore((state) => state.error)
  const statusMessage = useWorkboardStore((state) => state.statusMessage)
  const loadSnapshot = useWorkboardStore((state) => state.loadSnapshot)
  const syncSources = useWorkboardStore((state) => state.syncSources)
  const startRun = useWorkboardStore((state) => state.startRun)
  const stopRun = useWorkboardStore((state) => state.stopRun)
  const openDialog = useDialogStore((state) => state.open)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  useEffect(
    () =>
      workboardApi.onSnapshotUpdated((nextSnapshot) => {
        useWorkboardStore.getState().applySnapshot(nextSnapshot)
      }),
    [],
  )

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {error ?? (loading ? 'Loading Agent Workboard...' : 'Agent Workboard')}
      </div>
    )
  }

  return (
    <RalphTaskDashboardView
      snapshot={{
        ...snapshot,
        selectedRunId: selectedRunId ?? snapshot.selectedRunId,
      }}
      operation={operation}
      error={error}
      statusMessage={statusMessage}
      onSelectRun={setSelectedRunId}
      onSyncSources={() => {
        void syncSources()
      }}
      onStartRun={(projectId, issueIds) => {
        void startRun({ projectId, issueIds })
      }}
      onStopRun={(runId) => {
        void stopRun(runId)
      }}
      onOpenSettings={() => {
        openDialog('app-settings', { appSettingsSection: 'workboard' })
      }}
    />
  )
}
