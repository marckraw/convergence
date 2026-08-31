import { create } from 'zustand'
import { projectScriptApi } from './project-script.api'
import type {
  CreateProjectScriptInput,
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
  RunProjectScriptInput,
  UpdateProjectScriptInput,
} from './project-script.types'

interface ProjectScriptState {
  scriptsByProjectId: Record<string, ProjectScript[]>
  runsByProjectId: Record<string, ProjectScriptRun[]>
  globalActiveRuns: ProjectScriptRun[]
  outputByRunId: Record<string, ProjectScriptRunOutput[]>
  loading: boolean
  error: string | null
}

interface ProjectScriptActions {
  loadForProject: (projectId: string) => Promise<void>
  loadActiveRuns: () => Promise<void>
  createScript: (
    input: CreateProjectScriptInput,
  ) => Promise<ProjectScript | null>
  updateScript: (
    id: string,
    projectId: string,
    input: UpdateProjectScriptInput,
  ) => Promise<ProjectScript | null>
  deleteScript: (id: string, projectId: string) => Promise<void>
  runScript: (
    scriptId: string,
    projectId: string,
    input?: RunProjectScriptInput,
  ) => Promise<ProjectScriptRun | null>
  stopRun: (runId: string) => Promise<ProjectScriptRun | null>
  subscribeToRunEvents: () => () => void
  clearProject: (projectId: string) => void
  clearError: () => void
}

export type ProjectScriptStore = ProjectScriptState & ProjectScriptActions

const MAX_OUTPUT_CHUNKS_PER_RUN = 500
const MAX_OUTPUT_TEXT_CHARS_PER_RUN = 524288

let runEventsSubscriberCount = 0
let unsubscribeRunEvents: (() => void) | null = null

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function upsertRunInState(
  state: ProjectScriptState,
  run: ProjectScriptRun,
): Partial<ProjectScriptState> {
  const shouldBeActive = run.status === 'queued' || run.status === 'running'
  return {
    runsByProjectId: {
      ...state.runsByProjectId,
      [run.projectId]: upsertById(
        state.runsByProjectId[run.projectId] ?? [],
        run,
      ),
    },
    globalActiveRuns: shouldBeActive
      ? upsertById(state.globalActiveRuns, run)
      : state.globalActiveRuns.filter((active) => active.id !== run.id),
  }
}

function appendBoundedRunOutput(
  current: ProjectScriptRunOutput[],
  next: ProjectScriptRunOutput,
): ProjectScriptRunOutput[] {
  const chunks = [...current, next].slice(-MAX_OUTPUT_CHUNKS_PER_RUN)
  const bounded: ProjectScriptRunOutput[] = []
  let remainingChars = MAX_OUTPUT_TEXT_CHARS_PER_RUN

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    if (remainingChars <= 0) break

    const chunk = chunks[index]
    if (chunk.text.length <= remainingChars) {
      bounded.push(chunk)
      remainingChars -= chunk.text.length
      continue
    }

    bounded.push({
      ...chunk,
      text: chunk.text.slice(-remainingChars),
    })
    remainingChars = 0
  }

  return bounded.reverse()
}

export const useProjectScriptStore = create<ProjectScriptStore>((set) => ({
  scriptsByProjectId: {},
  runsByProjectId: {},
  globalActiveRuns: [],
  outputByRunId: {},
  loading: false,
  error: null,

  loadForProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const [scripts, runs] = await Promise.all([
        projectScriptApi.list(projectId),
        projectScriptApi.listRuns(projectId),
      ])
      set((state) => ({
        scriptsByProjectId: {
          ...state.scriptsByProjectId,
          [projectId]: scripts,
        },
        runsByProjectId: {
          ...state.runsByProjectId,
          [projectId]: runs,
        },
        loading: false,
      }))
    } catch (error) {
      set({
        loading: false,
        error: errorMessage(error, 'Failed to load project scripts'),
      })
    }
  },

  loadActiveRuns: async () => {
    try {
      const globalActiveRuns = await projectScriptApi.listActiveRuns()
      set({ globalActiveRuns })
    } catch (error) {
      set({
        error: errorMessage(error, 'Failed to load active script runs'),
      })
    }
  },

  createScript: async (input) => {
    set({ error: null })
    try {
      const created = await projectScriptApi.create(input)
      set((state) => ({
        scriptsByProjectId: {
          ...state.scriptsByProjectId,
          [input.projectId]: upsertById(
            state.scriptsByProjectId[input.projectId] ?? [],
            created,
          ),
        },
      }))
      return created
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to create project script') })
      return null
    }
  },

  updateScript: async (id, projectId, input) => {
    set({ error: null })
    try {
      const updated = await projectScriptApi.update(id, input)
      set((state) => ({
        scriptsByProjectId: {
          ...state.scriptsByProjectId,
          [projectId]: upsertById(
            state.scriptsByProjectId[projectId] ?? [],
            updated,
          ),
        },
      }))
      return updated
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to update project script') })
      return null
    }
  },

  deleteScript: async (id, projectId) => {
    set({ error: null })
    try {
      await projectScriptApi.delete(id)
      set((state) => ({
        scriptsByProjectId: {
          ...state.scriptsByProjectId,
          [projectId]: removeById(
            state.scriptsByProjectId[projectId] ?? [],
            id,
          ),
        },
      }))
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to delete project script') })
    }
  },

  runScript: async (scriptId, _projectId, input) => {
    set({ error: null })
    try {
      const run = await projectScriptApi.run(scriptId, input)
      set((state) => upsertRunInState(state, run))
      return run
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to run project script') })
      return null
    }
  },

  stopRun: async (runId) => {
    set({ error: null })
    try {
      const run = await projectScriptApi.stop(runId)
      set((state) => upsertRunInState(state, run))
      return run
    } catch (error) {
      set({ error: errorMessage(error, 'Failed to stop project script') })
      return null
    }
  },

  subscribeToRunEvents: () => {
    if (runEventsSubscriberCount === 0) {
      const offUpdated = projectScriptApi.onRunUpdated((run) => {
        set((state) => upsertRunInState(state, run))
      })
      const offOutput = projectScriptApi.onRunOutput((output) => {
        set((state) => ({
          outputByRunId: {
            ...state.outputByRunId,
            [output.runId]: appendBoundedRunOutput(
              state.outputByRunId[output.runId] ?? [],
              output,
            ),
          },
        }))
      })
      unsubscribeRunEvents = () => {
        offUpdated()
        offOutput()
      }
    }

    runEventsSubscriberCount += 1

    return () => {
      runEventsSubscriberCount = Math.max(0, runEventsSubscriberCount - 1)
      if (runEventsSubscriberCount === 0) {
        unsubscribeRunEvents?.()
        unsubscribeRunEvents = null
      }
    }
  },

  clearProject: (projectId) =>
    set((state) => {
      const scriptsByProjectId = { ...state.scriptsByProjectId }
      const runsByProjectId = { ...state.runsByProjectId }
      const outputByRunId = { ...state.outputByRunId }
      for (const run of runsByProjectId[projectId] ?? []) {
        delete outputByRunId[run.id]
      }
      delete scriptsByProjectId[projectId]
      delete runsByProjectId[projectId]
      return {
        scriptsByProjectId,
        runsByProjectId,
        outputByRunId,
        globalActiveRuns: state.globalActiveRuns.filter(
          (run) => run.projectId !== projectId,
        ),
      }
    }),

  clearError: () => set({ error: null }),
}))
