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
import { ProjectActionLogDrawerPresentational } from './project-action-log-drawer.presentational'
import { isProjectScriptRunActive } from './project-actions-menu.pure'
import { ProjectActionsMenuPresentational } from './project-actions-menu.presentational'
import { ProjectActionsTrigger } from './project-actions-trigger.presentational'
import type {
  ProjectActionItem,
  ProjectActionLogDrawerView,
} from './project-actions-menu.types'

interface ProjectActionsMenuProps {
  project: Project
  onManage: () => void
}

const EMPTY_SCRIPTS: ProjectScript[] = []
const EMPTY_RUNS: ProjectScriptRun[] = []

export const ProjectActionsMenu: FC<ProjectActionsMenuProps> = ({
  project,
  onManage,
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
  const runScript = useProjectScriptStore((state) => state.runScript)
  const stopRun = useProjectScriptStore((state) => state.stopRun)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
  const [drawerRunId, setDrawerRunId] = useState<string | null>(null)

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
  const drawerView = useMemo<ProjectActionLogDrawerView | null>(() => {
    if (!drawerRunId) return null
    const run = runs.find((entry) => entry.id === drawerRunId)
    if (!run) return null
    const script = scripts.find((entry) => entry.id === run.scriptId)
    if (!script) return null
    return {
      script,
      run,
      output: outputByRunId[run.id] ?? [],
    }
  }, [drawerRunId, outputByRunId, runs, scripts])

  useEffect(() => {
    void loadForProject(project.id)
  }, [loadForProject, project.id])

  useEffect(() => subscribeToRunEvents(), [subscribeToRunEvents])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ProjectActionsTrigger
            selectedScript={selectedItem?.script ?? null}
            running={selectedItem?.running ?? false}
          />
        </DropdownMenuTrigger>
        <ProjectActionsMenuPresentational
          projectName={project.name}
          items={items}
          onRun={(item) => {
            setSelectedScriptId(item.script.id)
            if (item.running && item.latestRun) {
              setDrawerRunId(item.latestRun.id)
              return
            }
            void runScript(item.script.id, project.id).then((run) => {
              if (run) setDrawerRunId(run.id)
            })
          }}
          onAdd={() => setEditorOpen(true)}
          onManage={onManage}
        />
      </DropdownMenu>

      {drawerView && (
        <ProjectActionLogDrawerPresentational
          view={drawerView}
          onStop={() => {
            void stopRun(drawerView.run.id)
          }}
          onClose={() => setDrawerRunId(null)}
        />
      )}

      <ProjectScriptEditor
        open={editorOpen}
        script={null}
        onOpenChange={setEditorOpen}
        onSave={async (input) => {
          await createScript({ projectId: project.id, ...input })
        }}
      />
    </>
  )
}
