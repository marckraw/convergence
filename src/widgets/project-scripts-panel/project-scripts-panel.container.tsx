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
import { ProjectScriptsPanelPresentational } from './project-scripts-panel.presentational'

interface ProjectScriptsPanelProps {
  project: Project
}

const EMPTY_SCRIPTS: ProjectScript[] = []
const EMPTY_RUNS: ProjectScriptRun[] = []

export const ProjectScriptsPanel: FC<ProjectScriptsPanelProps> = ({
  project,
}) => {
  const scripts = useProjectScriptStore(
    (state) => state.scriptsByProjectId[project.id] ?? EMPTY_SCRIPTS,
  )
  const runs = useProjectScriptStore(
    (state) => state.runsByProjectId[project.id] ?? EMPTY_RUNS,
  )
  const outputByRunId = useProjectScriptStore((state) => state.outputByRunId)
  const error = useProjectScriptStore((state) => state.error)
  const loadForProject = useProjectScriptStore((state) => state.loadForProject)
  const subscribeToRunEvents = useProjectScriptStore(
    (state) => state.subscribeToRunEvents,
  )
  const createScript = useProjectScriptStore((state) => state.createScript)
  const updateScript = useProjectScriptStore((state) => state.updateScript)
  const deleteScript = useProjectScriptStore((state) => state.deleteScript)
  const runScript = useProjectScriptStore((state) => state.runScript)
  const stopRun = useProjectScriptStore((state) => state.stopRun)
  const [editingScript, setEditingScript] = useState<ProjectScript | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(
    () => new Set(),
  )
  const latestRunsByScriptId = useMemo(
    () => selectLatestRunsByScriptId(runs),
    [runs],
  )

  useEffect(() => {
    void loadForProject(project.id)
  }, [loadForProject, project.id])

  useEffect(() => subscribeToRunEvents(), [subscribeToRunEvents])

  return (
    <>
      <ProjectScriptsPanelPresentational
        scripts={scripts}
        latestRunsByScriptId={latestRunsByScriptId}
        outputByRunId={outputByRunId}
        expandedRunIds={expandedRunIds}
        error={error}
        onAdd={() => {
          setEditingScript(null)
          setEditorOpen(true)
        }}
        onEdit={(script) => {
          setEditingScript(script)
          setEditorOpen(true)
        }}
        onDelete={(script) => {
          const confirmed = window.confirm(
            `Delete script "${script.name}"?\n\nRun history for this script will also be removed.`,
          )
          if (confirmed) {
            void deleteScript(script.id, project.id)
          }
        }}
        onRun={(script) => {
          void runScript(script.id, project.id).then((run) => {
            if (!run) return
            setExpandedRunIds((current) => new Set(current).add(run.id))
          })
        }}
        onStop={(run) => {
          void stopRun(run.id)
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
