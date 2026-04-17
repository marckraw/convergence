import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { GitBranch, Settings2 } from 'lucide-react'
import {
  normalizeProjectSettings,
  useProjectStore,
  type WorkspaceStartStrategy,
} from '@/entities/project'
import { Button } from '@/shared/ui/button'
import { ProjectSettingsDialog } from './project-settings.presentational'

export const ProjectSettingsDialogContainer: FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject)
  const updateProjectSettings = useProjectStore(
    (state) => state.updateProjectSettings,
  )

  const [open, setOpen] = useState(false)
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
      setOpen(false)
      setError(null)
    }
  }, [activeProject])

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
      setOpen(false)
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
      onOpenChange={setOpen}
      projectName={activeProject.name}
      strategy={strategy}
      baseBranchName={baseBranchName}
      isSaving={isSaving}
      error={error}
      onStrategyChange={setStrategy}
      onBaseBranchNameChange={setBaseBranchName}
      onSave={() => void handleSave()}
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
