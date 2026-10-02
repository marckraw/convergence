import { useEffect, useMemo, useState } from 'react'
import type { FC, ReactElement, ReactNode } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { laneApi, type Project } from '@/entities/project'
import {
  selectLatestRunsByScriptId,
  useProjectScriptStore,
  type ProjectScript,
  type ProjectScriptRun,
} from '@/entities/project-script'
import { ProjectScriptEditor } from '@/features/project-script-editor'
import { notify, Popover, PopoverTrigger, useConfirm } from '@convergence/ui'
import { isProjectScriptRunActive } from './project-actions-menu.pure'
import {
  ProjectActionsMenuPresentational,
  type ProjectActionsMenuContentFocus,
} from './project-actions-menu.presentational'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'
import type { ProjectActionItem } from './project-actions-menu.types'

interface ProjectActionsMenuProps {
  project: Project
  runtimeCwd?: string | null
  /**
   * Focus handling for the menu's content, from a header that may have moved
   * this control into More (MAR-3427 A).
   */
  contentFocus?: ProjectActionsMenuContentFocus
  /**
   * The menu's open state, when a header owns it: opened from More, or from
   * the header's Project group (MAR-3429 CH4). Uncontrolled without it.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * The header's own trigger in place of the action picker, as the element
   * the popover's trigger renders; it is told whether an action runs.
   */
  renderTrigger?: (state: { running: boolean }) => ReactElement
  /**
   * Sections drawn after the project's actions and lanes, in the same menu
   * (the header's Open in, Pull request and Terminal, CH4 R4).
   */
  children?: ReactNode
}

const EMPTY_SCRIPTS: ProjectScript[] = []
const EMPTY_RUNS: ProjectScriptRun[] = []

export const ProjectActionsMenu: FC<ProjectActionsMenuProps> = ({
  project,
  runtimeCwd,
  contentFocus,
  open,
  onOpenChange,
  renderTrigger,
  children,
}) => {
  const scripts = useProjectScriptStore(
    (state) => state.scriptsByProjectId[project.id] ?? EMPTY_SCRIPTS,
  )
  const runs = useProjectScriptStore(
    (state) => state.runsByProjectId[project.id] ?? EMPTY_RUNS,
  )
  const outputByRunId = useProjectScriptStore((state) => state.outputByRunId)
  const loadForProject = useProjectScriptStore((state) => state.loadForProject)
  const subscribeToRunEvents = useProjectScriptStore(
    (state) => state.subscribeToRunEvents,
  )
  const createScript = useProjectScriptStore((state) => state.createScript)
  const updateScript = useProjectScriptStore((state) => state.updateScript)
  const deleteScript = useProjectScriptStore((state) => state.deleteScript)
  const runScript = useProjectScriptStore((state) => state.runScript)
  const stopRun = useProjectScriptStore((state) => state.stopRun)
  const error = useProjectScriptStore((state) => state.error)
  const openDialog = useDialogStore((state) => state.open)
  const confirm = useConfirm()
  const [ownOpen, setOwnOpen] = useState(false)
  const menuOpen = open ?? ownOpen
  const setMenuOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next)
    onOpenChange?.(next)
  }
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<ProjectScript | null>(null)
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(
    () => new Set(),
  )

  const latestRunsByScriptId = useMemo(
    () => selectLatestRunsByScriptId(runs),
    [runs],
  )
  const items = useMemo<ProjectActionItem[]>(
    () =>
      scripts.map((script) => {
        const latestRun = latestRunsByScriptId[script.id] ?? null
        return {
          script,
          latestRun,
          running: isProjectScriptRunActive(latestRun),
        }
      }),
    [latestRunsByScriptId, scripts],
  )
  const activeItem = items.find((item) => item.running) ?? null
  const selectedItem =
    activeItem ??
    items.find((item) => item.script.id === selectedScriptId) ??
    items[0] ??
    null

  useEffect(() => {
    void loadForProject(project.id)
  }, [loadForProject, project.id])

  useEffect(() => subscribeToRunEvents(), [subscribeToRunEvents])

  return (
    <>
      <Popover
        open={menuOpen}
        onOpenChange={(next, details) => {
          contentFocus?.onOpenChange(next, details)
          setMenuOpen(next)
        }}
      >
        <PopoverTrigger
          render={
            renderTrigger ? (
              renderTrigger({ running: activeItem !== null })
            ) : (
              <ProjectActionsTrigger
                selectedScript={selectedItem?.script ?? null}
                running={selectedItem?.running ?? false}
              />
            )
          }
        />
        <ProjectActionsMenuPresentational
          projectName={project.name}
          contentFocus={contentFocus}
          items={items}
          outputByRunId={outputByRunId}
          expandedRunIds={expandedRunIds}
          error={error}
          isLane={project.laneOf !== null}
          onCreateLane={() => {
            setMenuOpen(false)
            openDialog('lane-create')
          }}
          onRevealLane={() => {
            setMenuOpen(false)
            void laneApi.reveal(project.id).catch((err: unknown) => {
              notify.failure('reveal the lane', err)
            })
          }}
          onRun={(item) => {
            setSelectedScriptId(item.script.id)
            if (item.running && item.latestRun) {
              setExpandedRunIds((current) =>
                new Set(current).add(item.latestRun!.id),
              )
              return
            }
            void runScript(item.script.id, project.id, {
              cwd: runtimeCwd ?? null,
            }).then((run) => {
              if (!run) return
              setExpandedRunIds((current) => new Set(current).add(run.id))
            })
          }}
          onStop={(run) => {
            void stopRun(run.id)
          }}
          onAdd={() => {
            setEditingScript(null)
            setMenuOpen(false)
            setEditorOpen(true)
          }}
          onEdit={(script) => {
            setEditingScript(script)
            setMenuOpen(false)
            setEditorOpen(true)
          }}
          onDelete={async (script) => {
            // The panel closes first: the question takes the focus, and gives
            // it back to the panel's trigger.
            setMenuOpen(false)
            const confirmed = await confirm({
              title: `Delete action “${script.name}”?`,
              description:
                'The action and its run history are deleted for good. Nothing is run.',
              confirmLabel: 'Delete action',
              variant: 'danger',
            })
            if (confirmed) void deleteScript(script.id, project.id)
          }}
          onToggleRun={(runId) => {
            setExpandedRunIds((current) => {
              const next = new Set(current)
              if (next.has(runId)) {
                next.delete(runId)
              } else {
                next.add(runId)
              }
              return next
            })
          }}
        >
          {children}
        </ProjectActionsMenuPresentational>
      </Popover>

      <ProjectScriptEditor
        open={editorOpen}
        script={editingScript}
        onOpenChange={setEditorOpen}
        onSave={async (input) => {
          if (editingScript) {
            await updateScript(editingScript.id, project.id, input)
          } else {
            await createScript({ projectId: project.id, ...input })
          }
        }}
      />
    </>
  )
}
