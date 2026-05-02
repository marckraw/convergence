import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { projectApi, type Project } from '@/entities/project'
import {
  useWorkboardStore,
  workboardApi,
  type WorkboardProjectMappingRecord,
  type WorkboardTrackerSourceRecord,
} from '@/entities/workboard'
import {
  WorkboardSettingsView,
  type WorkboardMappingForm,
  type WorkboardSourceForm,
} from './workboard-settings.presentational'

const DEFAULT_SOURCE_FORM: WorkboardSourceForm = {
  type: 'linear',
  name: 'Linear personal',
  token: '',
  teamKey: '',
  projectName: '',
  labels: 'convergence-loop',
  first: '50',
  siteUrl: '',
  email: '',
  apiToken: '',
  jql: 'labels = convergence-loop ORDER BY updated DESC',
  maxResults: '50',
}

const DEFAULT_MAPPING_FORM: WorkboardMappingForm = {
  sourceId: '',
  projectId: '',
  name: '',
  priority: '10',
  teamKey: '',
  projectName: '',
  projectKey: '',
  labels: 'convergence-loop',
  components: '',
  workflowPolicy: 'simple-loop',
  sandboxMode: 'docker',
  branchPrefix: 'sandcastle',
  provider: 'codex',
  model: 'gpt-5.5',
  effort: 'high',
  maxIterations: '1',
}

function csv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberOrDefault(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const WorkboardSettings: FC = () => {
  const loadSnapshot = useWorkboardStore((state) => state.loadSnapshot)
  const [sources, setSources] = useState<WorkboardTrackerSourceRecord[]>([])
  const [mappings, setMappings] = useState<WorkboardProjectMappingRecord[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sourceForm, setSourceForm] =
    useState<WorkboardSourceForm>(DEFAULT_SOURCE_FORM)
  const [mappingForm, setMappingForm] =
    useState<WorkboardMappingForm>(DEFAULT_MAPPING_FORM)
  const [saving, setSaving] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const loadSetup = useCallback(async () => {
    const [nextSources, nextMappings, nextProjects] = await Promise.all([
      workboardApi.listTrackerSources(),
      workboardApi.listProjectMappings(),
      projectApi.getAll(),
    ])
    setSources(nextSources)
    setMappings(nextMappings)
    setProjects(nextProjects)
    setMappingForm((current) => ({
      ...current,
      sourceId: current.sourceId || nextSources[0]?.id || '',
      projectId: current.projectId || nextProjects[0]?.id || '',
    }))
  }, [])

  useEffect(() => {
    void loadSetup().catch((err) => {
      setSetupError(
        err instanceof Error ? err.message : 'Failed to load Workboard setup',
      )
    })
  }, [loadSetup])

  const saveSource = async () => {
    setSaving(true)
    setSetupError(null)
    try {
      if (!sourceForm.name.trim()) throw new Error('Source name is required')
      if (sourceForm.type === 'linear' && !sourceForm.token.trim()) {
        throw new Error('Linear API token is required')
      }
      if (sourceForm.type === 'jira') {
        if (!sourceForm.siteUrl.trim())
          throw new Error('Jira site URL is required')
        if (!sourceForm.email.trim()) throw new Error('Jira email is required')
        if (!sourceForm.apiToken.trim())
          throw new Error('Jira API token is required')
      }

      await workboardApi.upsertTrackerSource(
        sourceForm.type === 'linear'
          ? {
              type: 'linear',
              name: sourceForm.name,
              enabled: true,
              auth: { token: sourceForm.token },
              sync: {
                labels: csv(sourceForm.labels),
                teamKey: sourceForm.teamKey,
                projectName: sourceForm.projectName,
                first: sourceForm.first,
              },
            }
          : {
              type: 'jira',
              name: sourceForm.name,
              enabled: true,
              auth: {
                siteUrl: sourceForm.siteUrl,
                email: sourceForm.email,
                apiToken: sourceForm.apiToken,
              },
              sync: {
                jql: sourceForm.jql,
                maxResults: sourceForm.maxResults,
              },
            },
      )
      setSourceForm({
        ...DEFAULT_SOURCE_FORM,
        type: sourceForm.type,
        name: sourceForm.type === 'linear' ? 'Linear personal' : 'Jira work',
      })
      await loadSetup()
      await loadSnapshot()
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : 'Failed to save tracker source',
      )
    } finally {
      setSaving(false)
    }
  }

  const saveMapping = async () => {
    setSaving(true)
    setSetupError(null)
    try {
      if (!mappingForm.name.trim()) throw new Error('Mapping name is required')
      if (!mappingForm.sourceId) throw new Error('Tracker source is required')
      if (!mappingForm.projectId)
        throw new Error('Convergence project is required')

      await workboardApi.upsertProjectMapping({
        sourceId: mappingForm.sourceId,
        projectId: mappingForm.projectId,
        name: mappingForm.name,
        enabled: true,
        priority: numberOrDefault(mappingForm.priority, 10),
        matcher: {
          labels: csv(mappingForm.labels),
          teamKey: mappingForm.teamKey,
          projectName: mappingForm.projectName,
          projectKey: mappingForm.projectKey,
          components: csv(mappingForm.components),
        },
        workflowPolicy: mappingForm.workflowPolicy,
        sandboxMode: mappingForm.sandboxMode,
        branchPrefix: mappingForm.branchPrefix,
        stageDefaults: {
          implementer: {
            provider: mappingForm.provider,
            model: mappingForm.model,
            effort: mappingForm.effort,
            maxIterations: numberOrDefault(mappingForm.maxIterations, 1),
          },
        },
      })
      setMappingForm((current) => ({
        ...DEFAULT_MAPPING_FORM,
        sourceId: current.sourceId,
        projectId: current.projectId,
      }))
      await loadSetup()
      await loadSnapshot()
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : 'Failed to save project mapping',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkboardSettingsView
      sources={sources}
      mappings={mappings}
      projects={projects}
      sourceForm={sourceForm}
      mappingForm={mappingForm}
      saving={saving}
      setupError={setupError}
      onSourceFormChange={(patch) =>
        setSourceForm((current) => ({ ...current, ...patch }))
      }
      onMappingFormChange={(patch) =>
        setMappingForm((current) => ({ ...current, ...patch }))
      }
      onSaveSource={() => {
        void saveSource()
      }}
      onSaveMapping={() => {
        void saveMapping()
      }}
    />
  )
}
