import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { GitBranch, Settings2 } from 'lucide-react'
import {
  normalizeProjectSettings,
  useProjectStore,
  type WorkspaceEnvFileCopyMode,
  type WorkspaceStartStrategy,
} from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { Button } from '@/shared/ui/button'
import { ProjectSettingsDialog } from './project-settings.presentational'

interface ProjectSettingsDialogContainerProps {
  contextSection?: (projectId: string) => ReactNode
  trigger?: ReactNode
}

export const ProjectSettingsDialogContainer: FC<
  ProjectSettingsDialogContainerProps
> = ({ contextSection, trigger }) => {
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
  const [envCopyMode, setEnvCopyMode] =
    useState<WorkspaceEnvFileCopyMode>('copy-missing')
  const [envPatternsText, setEnvPatternsText] = useState('')
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
    setEnvCopyMode(settings.workspaceEnvFiles.copyMode)
    setEnvPatternsText(settings.workspaceEnvFiles.patterns.join(', '))
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
        workspaceEnvFiles: {
          copyMode: envCopyMode,
          patterns: envPatternsText
            .split(',')
            .map((pattern) => pattern.trim())
            .filter(Boolean),
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

  const handleEnvCopyEnabledChange = (enabled: boolean) => {
    setEnvCopyMode((current) => {
      if (!enabled) return 'disabled'
      return current === 'disabled' ? 'copy-missing' : current
    })
  }

  const handleEnvOverwriteChange = (enabled: boolean) => {
    setEnvCopyMode(enabled ? 'overwrite' : 'copy-missing')
  }

  return (
    <ProjectSettingsDialog
      open={open}
      onOpenChange={handleOpenChange}
      projectName={activeProject.name}
      strategy={strategy}
      baseBranchName={baseBranchName}
      envCopyEnabled={envCopyMode !== 'disabled'}
      envOverwrite={envCopyMode === 'overwrite'}
      envPatternsText={envPatternsText}
      isSaving={isSaving}
      error={error}
      onStrategyChange={setStrategy}
      onBaseBranchNameChange={setBaseBranchName}
      onEnvCopyEnabledChange={handleEnvCopyEnabledChange}
      onEnvOverwriteChange={handleEnvOverwriteChange}
      onEnvPatternsTextChange={setEnvPatternsText}
      onSave={() => void handleSave()}
      contextSection={contextSection?.(activeProject.id)}
      trigger={
        trigger ?? (
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
        )
      }
    />
  )
}
