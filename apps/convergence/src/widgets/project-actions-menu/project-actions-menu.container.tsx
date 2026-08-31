import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import type { Project } from '@/entities/project'
import {
  selectLatestRunsByScriptId,
  useProjectScriptStore,
  type ProjectScript,
  type ProjectScriptRun,
} from '@/entities/project-script'
import { ProjectScriptEditor } from '@/features/project-script-editor'
import { DropdownMenu, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'
import { isProjectScriptRunActive } from './project-actions-menu.pure'
import { ProjectActionsMenuPresentational } from './project-actions-menu.presentational'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'
import type { ProjectActionItem } from './project-actions-menu.types'

interface ProjectActionsMenuProps {
  project: Project
  runtimeCwd?: string | null
}

const EMPTY_SCRIPTS: ProjectScript[] = []
const EMPTY_RUNS: ProjectScriptRun[] = []

export const ProjectActionsMenu: FC<ProjectActionsMenuProps> = ({
  project,
  runtimeCwd,
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
  const [menuOpen, setMenuOpen] = useState(false)
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
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <ProjectActionsTrigger
            selectedScript={selectedItem?.script ?? null}
            running={selectedItem?.running ?? false}
          />
        </DropdownMenuTrigger>
        <ProjectActionsMenuPresentational
          projectName={project.name}
          items={items}
          outputByRunId={outputByRunId}
          expandedRunIds={expandedRunIds}
          error={error}
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
          onDelete={(script) => {
            const confirmed = window.confirm(
              `Delete action "${script.name}"?\n\nRun history for this action will also be removed.`,
            )
            if (confirmed) {
              void deleteScript(script.id, project.id)
            }
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
        />
      </DropdownMenu>

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
