import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { GitBranch, Settings2 } from 'lucide-react'
import {
  normalizeProjectSettings,
  useProjectStore,
  type WorkspaceStartStrategy,
} from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { Button } from '@/shared/ui/button'
import { ProjectSettingsDialog } from './project-settings.presentational'

interface ProjectSettingsDialogContainerProps {
  contextSection?: (projectId: string) => ReactNode
}

export const ProjectSettingsDialogContainer: FC<
  ProjectSettingsDialogContainerProps
> = ({ contextSection }) => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const updateProjectSettings = useProjectStore(
    (state) => state.updateProjectSettings,
  )

  const open = useDialogStore((s) => s.openDialog === 'project-settings')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) openDialog('project-settings')
      else closeDialog()
    },
    [openDialog, closeDialog],
  )
  const [strategy, setStrategy] =
    useState<WorkspaceStartStrategy>('base-branch')
  const [baseBranchName, setBaseBranchName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const settings = useMemo(
    () => normalizeProjectSettings(activeProject?.settings),
    [activeProject?.settings],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setStrategy(settings.workspaceCreation.startStrategy)
    setBaseBranchName(settings.workspaceCreation.baseBranchName ?? '')
    setError(null)
  }, [open, settings])

  useEffect(() => {
    if (!activeProject) {
      closeDialog()
      setError(null)
    }
  }, [activeProject, closeDialog])

  if (!activeProject) {
    return null
  }

  const summary =
    settings.workspaceCreation.startStrategy === 'base-branch'
      ? (settings.workspaceCreation.baseBranchName ?? 'Auto')
      : 'HEAD'

  const handleSave = async () => {
    if (!activeProject) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await updateProjectSettings(activeProject.id, {
        workspaceCreation: {
          startStrategy: strategy,
          baseBranchName:
            strategy === 'base-branch' && baseBranchName.trim()
              ? baseBranchName.trim()
              : null,
        },
      })
      closeDialog()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to save project settings',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ProjectSettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={activeProject.name}
      strategy={strategy}
      baseBranchName={baseBranchName}
      isSaving={isSaving}
      error={error}
      onStrategyChange={setStrategy}
      onBaseBranchNameChange={setBaseBranchName}
      onSave={() => void handleSave()}
      contextSection={contextSection?.(activeProject.id)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            Project Settings
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
            <GitBranch className="h-3 w-3" />
            {summary}
          </span>
        </Button>
      }
    />
  )
}
