import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type { FC, ReactNode } from 'react'
import {
  normalizeProjectSettings,
  useProjectStore,
  type WorkspaceEnvFileCopyMode,
  type WorkspaceStartStrategy,
} from '@/entities/project'
import { useDialogStore } from '@/entities/dialog'
import { useConfirm } from '@convergence/ui'
import { useSaveAsYouGo } from '@/shared/lib/use-save-as-you-go'
import { ProjectSettingsDialog } from './project-settings.presentational'

/**
 * Project settings save as you go (DS4, R6): a switch or a choice at once, a
 * typed value once typing pauses this long, and at once on close.
 */
const SAVE_NOW_MS = 0
const SAVE_AFTER_TYPING_MS = 400

interface ProjectSettingsDrafts {
  strategy: WorkspaceStartStrategy
  baseBranchName: string
  envCopyMode: WorkspaceEnvFileCopyMode
  envPatternsText: string
}

interface ProjectSettingsDialogContainerProps {
  /**
   * The project's context items, below the settings. Its item editor keeps a
   * draft until Save, and says whether it holds one through `onDraftChange`,
   * so closing the dialog can ask before dropping it (DLG-10).
   */
  contextSection?: (
    projectId: string,
    onDraftChange: (unsaved: boolean) => void,
  ) => ReactNode
  trigger?: ReactElement
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
  const [strategy, setStrategy] =
    useState<WorkspaceStartStrategy>('base-branch')
  const [baseBranchName, setBaseBranchName] = useState('')
  const [envCopyMode, setEnvCopyMode] =
    useState<WorkspaceEnvFileCopyMode>('copy-missing')
  const [envPatternsText, setEnvPatternsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Closing with a context item's changes unsaved asks first (R5, DLG-10).
  const confirm = useConfirm()
  const contextDraftUnsaved = useRef(false)
  const handleContextDraftChange = useCallback((unsaved: boolean) => {
    contextDraftUnsaved.current = unsaved
  }, [])

  const settings = useMemo(
    () => normalizeProjectSettings(activeProject?.settings),
    [activeProject?.settings],
  )

  // Seeded once per open, never from a save's answer: that would overwrite
  // what is being typed.
  const seededFor = useRef<string | null>(null)
  const activeProjectId = activeProject?.id ?? null
  useEffect(() => {
    if (!open) {
      seededFor.current = null
      return
    }
    if (seededFor.current === activeProjectId) return
    seededFor.current = activeProjectId
    setStrategy(settings.workspaceCreation.startStrategy)
    setBaseBranchName(settings.workspaceCreation.baseBranchName ?? '')
    setEnvCopyMode(settings.workspaceEnvFiles.copyMode)
    setEnvPatternsText(settings.workspaceEnvFiles.patterns.join(', '))
    setError(null)
  }, [open, activeProjectId, settings])

  // What each save is built from, as of the latest render.
  const drafts = useRef<ProjectSettingsDrafts>({
    strategy,
    baseBranchName,
    envCopyMode,
    envPatternsText,
  })
  drafts.current = { strategy, baseBranchName, envCopyMode, envPatternsText }

  const { scheduleSave, flush } = useSaveAsYouGo(() => {
    const projectId = activeProjectId
    if (!projectId) return null
    return async () => {
      const current = drafts.current
      setError(null)
      try {
        await updateProjectSettings(projectId, {
          workspaceCreation: {
            startStrategy: current.strategy,
            baseBranchName:
              current.strategy === 'base-branch' &&
              current.baseBranchName.trim()
                ? current.baseBranchName.trim()
                : null,
          },
          workspaceEnvFiles: {
            copyMode: current.envCopyMode,
            patterns: current.envPatternsText
              .split(',')
              .map((pattern) => pattern.trim())
              .filter(Boolean),
          },
        })
      } catch (nextError) {
        const reason = nextError instanceof Error ? ` ${nextError.message}` : ''
        setError(`Couldn’t save the project settings.${reason}`)
      }
    }
  })

  const handleOpenChange = useCallback(
    async (next: boolean) => {
      if (next) {
        openDialog('project-settings')
        return
      }
      if (contextDraftUnsaved.current) {
        // The settings save as you go, but a context item's editor keeps its
        // draft until Save: Done, Escape or ✕ would drop it, so it asks.
        const discard = await confirm({
          title: 'Discard the context item you’re editing?',
          description: 'Your changes to it haven’t been saved.',
          confirmLabel: 'Discard',
          cancelLabel: 'Keep editing',
          variant: 'danger',
        })
        if (!discard) return
      }
      // Leaving with a typed value still waiting keeps it.
      flush()
      closeDialog()
    },
    [openDialog, closeDialog, confirm, flush],
  )

  useEffect(() => {
    if (!activeProject) {
      closeDialog()
      setError(null)
    }
  }, [activeProject, closeDialog])

  if (!activeProject) {
    return null
  }

  const handleStrategyChange = (next: WorkspaceStartStrategy) => {
    setStrategy(next)
    scheduleSave(SAVE_NOW_MS)
  }

  const handleBaseBranchNameChange = (value: string) => {
    setBaseBranchName(value)
    scheduleSave(SAVE_AFTER_TYPING_MS)
  }

  const handleEnvCopyEnabledChange = (enabled: boolean) => {
    setEnvCopyMode((current) => {
      if (!enabled) return 'disabled'
      return current === 'disabled' ? 'copy-missing' : current
    })
    scheduleSave(SAVE_NOW_MS)
  }

  const handleEnvOverwriteChange = (enabled: boolean) => {
    setEnvCopyMode(enabled ? 'overwrite' : 'copy-missing')
    scheduleSave(SAVE_NOW_MS)
  }

  const handleEnvPatternsTextChange = (value: string) => {
    setEnvPatternsText(value)
    scheduleSave(SAVE_AFTER_TYPING_MS)
  }

  return (
    <ProjectSettingsDialog
      open={open}
      onOpenChange={(next) => void handleOpenChange(next)}
      projectName={activeProject.name}
      strategy={strategy}
      baseBranchName={baseBranchName}
      envCopyEnabled={envCopyMode !== 'disabled'}
      envOverwrite={envCopyMode === 'overwrite'}
      envPatternsText={envPatternsText}
      error={error}
      onStrategyChange={handleStrategyChange}
      onBaseBranchNameChange={handleBaseBranchNameChange}
      onEnvCopyEnabledChange={handleEnvCopyEnabledChange}
      onEnvOverwriteChange={handleEnvOverwriteChange}
      onEnvPatternsTextChange={handleEnvPatternsTextChange}
      contextSection={contextSection?.(
        activeProject.id,
        handleContextDraftChange,
      )}
      trigger={trigger}
    />
  )
}
