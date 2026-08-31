import { create } from 'zustand'
import { spaceApi } from './space.api'
import type {
  CreateSpaceInput,
  CreateSpaceArtifactInput,
  CreateSpaceArtifactsFromPathsInput,
  Space,
  SpaceAttempt,
  SpaceArtifact,
  SpaceSource,
  SpaceSynthesisResult,
  LinkSpaceAttemptInput,
  UpdateSpaceAttemptInput,
  UpdateSpaceInput,
  UpdateSpaceArtifactInput,
} from './space.types'

interface SpaceState {
  spaces: Space[]
  attemptsBySpaceId: Record<string, SpaceAttempt[]>
  attemptsBySessionId: Record<string, SpaceAttempt[]>
  artifactsBySpaceId: Record<string, SpaceArtifact[]>
  sourcesBySpaceId: Record<string, SpaceSource[]>
  loading: boolean
  error: string | null
}

interface SpaceActions {
  loadSpaces: () => Promise<void>
  createSpace: (input: CreateSpaceInput) => Promise<Space | null>
  updateSpace: (id: string, input: UpdateSpaceInput) => Promise<Space | null>
  archiveSpace: (id: string) => Promise<Space | null>
  unarchiveSpace: (id: string) => Promise<Space | null>
  deleteSpace: (id: string) => Promise<void>
  loadAttempts: (spaceId: string) => Promise<void>
  loadAttemptsForSession: (sessionId: string) => Promise<void>
  linkAttempt: (input: LinkSpaceAttemptInput) => Promise<SpaceAttempt | null>
  updateAttempt: (
    id: string,
    spaceId: string,
    input: UpdateSpaceAttemptInput,
  ) => Promise<SpaceAttempt | null>
  unlinkAttempt: (id: string, spaceId: string) => Promise<void>
  setPrimaryAttempt: (
    spaceId: string,
    attemptId: string,
  ) => Promise<SpaceAttempt | null>
  loadArtifacts: (spaceId: string) => Promise<void>
  addArtifact: (
    input: CreateSpaceArtifactInput,
  ) => Promise<SpaceArtifact | null>
  addArtifactsFromPaths: (
    input: CreateSpaceArtifactsFromPathsInput,
  ) => Promise<SpaceArtifact[]>
  updateArtifact: (
    id: string,
    spaceId: string,
    input: UpdateSpaceArtifactInput,
  ) => Promise<SpaceArtifact | null>
  deleteArtifact: (id: string, spaceId: string) => Promise<void>
  loadSources: (spaceId: string) => Promise<void>
  addSourcesFromPaths: (
    spaceId: string,
    paths: string[],
  ) => Promise<SpaceSource[]>
  deleteSource: (id: string, spaceId: string) => Promise<void>
  synthesize: (
    spaceId: string,
    requestId?: string,
  ) => Promise<SpaceSynthesisResult | null>
  clearError: () => void
}

export type SpaceStore = SpaceState & SpaceActions

function upsertSpace(spaces: Space[], next: Space): Space[] {
  return spaces.some((space) => space.id === next.id)
    ? spaces.map((space) => (space.id === next.id ? next : space))
    : [next, ...spaces]
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  spaces: [],
  attemptsBySpaceId: {},
  attemptsBySessionId: {},
  artifactsBySpaceId: {},
  sourcesBySpaceId: {},
  loading: false,
  error: null,

  loadSpaces: async () => {
    set({ loading: true, error: null })
    try {
      const spaces = await spaceApi.list()
      set({ spaces, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load Spaces',
      })
    }
  },

  createSpace: async (input) => {
    set({ error: null })
    try {
      const space = await spaceApi.create(input)
      set((state) => ({
        spaces: upsertSpace(state.spaces, space),
      }))
      return space
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create Space',
      })
      return null
    }
  },

  updateSpace: async (id, input) => {
    set({ error: null })
    try {
      const space = await spaceApi.update(id, input)
      set((state) => ({
        spaces: upsertSpace(state.spaces, space),
      }))
      return space
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update Space',
      })
      return null
    }
  },

  archiveSpace: async (id) => {
    set({ error: null })
    try {
      const space = await spaceApi.archive(id)
      set((state) => ({
        spaces: upsertSpace(state.spaces, space),
      }))
      return space
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to archive Space',
      })
      return null
    }
  },

  unarchiveSpace: async (id) => {
    set({ error: null })
    try {
      const space = await spaceApi.unarchive(id)
      set((state) => ({
        spaces: upsertSpace(state.spaces, space),
      }))
      return space
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to unarchive Space',
      })
      return null
    }
  },

  deleteSpace: async (id) => {
    set({ error: null })
    try {
      await spaceApi.delete(id)
      set((state) => {
        const attemptsBySpaceId = { ...state.attemptsBySpaceId }
        const attemptsBySessionId = { ...state.attemptsBySessionId }
        const artifactsBySpaceId = { ...state.artifactsBySpaceId }
        const sourcesBySpaceId = { ...state.sourcesBySpaceId }
        delete attemptsBySpaceId[id]
        for (const [sessionId, attempts] of Object.entries(
          attemptsBySessionId,
        )) {
          attemptsBySessionId[sessionId] = attempts.filter(
            (attempt) => attempt.spaceId !== id,
          )
        }
        delete artifactsBySpaceId[id]
        delete sourcesBySpaceId[id]
        return {
          spaces: removeById(state.spaces, id),
          attemptsBySpaceId,
          attemptsBySessionId,
          artifactsBySpaceId,
          sourcesBySpaceId,
        }
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete Space',
      })
    }
  },

  loadAttempts: async (spaceId) => {
    set({ error: null })
    try {
      const attempts = await spaceApi.listAttempts(spaceId)
      set((state) => ({
        attemptsBySpaceId: {
          ...state.attemptsBySpaceId,
          [spaceId]: attempts,
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load Attempts',
      })
    }
  },

  loadAttemptsForSession: async (sessionId) => {
    set({ error: null })
    try {
      const attempts = await spaceApi.listAttemptsForSession(sessionId)
      set((state) => ({
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [sessionId]: attempts,
        },
      }))
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load session Attempts',
      })
    }
  },

  linkAttempt: async (input) => {
    set({ error: null })
    try {
      const attempt = await spaceApi.linkAttempt(input)
      set((state) => ({
        attemptsBySpaceId: {
          ...state.attemptsBySpaceId,
          [input.spaceId]: upsertById(
            state.attemptsBySpaceId[input.spaceId] ?? [],
            attempt,
          ),
        },
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [input.sessionId]: upsertById(
            state.attemptsBySessionId[input.sessionId] ?? [],
            attempt,
          ),
        },
      }))
      return attempt
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to link Attempt',
      })
      return null
    }
  },

  updateAttempt: async (id, spaceId, input) => {
    set({ error: null })
    try {
      const attempt = await spaceApi.updateAttempt(id, input)
      set((state) => ({
        attemptsBySpaceId: {
          ...state.attemptsBySpaceId,
          [spaceId]: upsertById(
            state.attemptsBySpaceId[spaceId] ?? [],
            attempt,
          ),
        },
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [attempt.sessionId]: upsertById(
            state.attemptsBySessionId[attempt.sessionId] ?? [],
            attempt,
          ),
        },
      }))
      return attempt
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update Attempt',
      })
      return null
    }
  },

  unlinkAttempt: async (id, spaceId) => {
    set({ error: null })
    try {
      await spaceApi.unlinkAttempt(id)
      set((state) => ({
        attemptsBySpaceId: {
          ...state.attemptsBySpaceId,
          [spaceId]: removeById(state.attemptsBySpaceId[spaceId] ?? [], id),
        },
        attemptsBySessionId: Object.fromEntries(
          Object.entries(state.attemptsBySessionId).map(
            ([sessionId, attempts]) => [sessionId, removeById(attempts, id)],
          ),
        ),
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to unlink Attempt',
      })
    }
  },

  setPrimaryAttempt: async (spaceId, attemptId) => {
    set({ error: null })
    try {
      const attempt = await spaceApi.setPrimaryAttempt(spaceId, attemptId)
      const attempts = await spaceApi.listAttempts(spaceId)
      set((state) => ({
        attemptsBySpaceId: {
          ...state.attemptsBySpaceId,
          [spaceId]: attempts,
        },
        attemptsBySessionId: attempts.reduce(
          (nextBySession, nextAttempt) => ({
            ...nextBySession,
            [nextAttempt.sessionId]: upsertById(
              nextBySession[nextAttempt.sessionId] ?? [],
              nextAttempt,
            ),
          }),
          { ...state.attemptsBySessionId },
        ),
      }))
      return attempt
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to set primary Attempt',
      })
      return null
    }
  },

  loadArtifacts: async (spaceId) => {
    set({ error: null })
    try {
      const artifacts = await spaceApi.listArtifacts(spaceId)
      set((state) => ({
        artifactsBySpaceId: {
          ...state.artifactsBySpaceId,
          [spaceId]: artifacts,
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load Artifacts',
      })
    }
  },

  addArtifact: async (input) => {
    set({ error: null })
    try {
      const artifact = await spaceApi.addArtifact(input)
      set((state) => ({
        artifactsBySpaceId: {
          ...state.artifactsBySpaceId,
          [input.spaceId]: upsertById(
            state.artifactsBySpaceId[input.spaceId] ?? [],
            artifact,
          ),
        },
      }))
      return artifact
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to add Artifact',
      })
      return null
    }
  },

  addArtifactsFromPaths: async (input) => {
    set({ error: null })
    try {
      const artifacts = await spaceApi.addArtifactsFromPaths(input)
      set((state) => ({
        artifactsBySpaceId: {
          ...state.artifactsBySpaceId,
          [input.spaceId]: [
            ...artifacts,
            ...(state.artifactsBySpaceId[input.spaceId] ?? []).filter(
              (existing) =>
                !artifacts.some((artifact) => artifact.id === existing.id),
            ),
          ],
        },
      }))
      return artifacts
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to add file-backed Artifacts',
      })
      return []
    }
  },

  updateArtifact: async (id, spaceId, input) => {
    set({ error: null })
    try {
      const artifact = await spaceApi.updateArtifact(id, input)
      set((state) => ({
        artifactsBySpaceId: {
          ...state.artifactsBySpaceId,
          [spaceId]: upsertById(
            state.artifactsBySpaceId[spaceId] ?? [],
            artifact,
          ),
        },
      }))
      return artifact
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update Artifact',
      })
      return null
    }
  },

  deleteArtifact: async (id, spaceId) => {
    set({ error: null })
    try {
      await spaceApi.deleteArtifact(id)
      set((state) => ({
        artifactsBySpaceId: {
          ...state.artifactsBySpaceId,
          [spaceId]: removeById(state.artifactsBySpaceId[spaceId] ?? [], id),
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete Artifact',
      })
    }
  },

  loadSources: async (spaceId) => {
    set({ error: null })
    try {
      const sources = await spaceApi.listSources(spaceId)
      set((state) => ({
        sourcesBySpaceId: {
          ...state.sourcesBySpaceId,
          [spaceId]: sources,
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load Sources',
      })
    }
  },

  addSourcesFromPaths: async (spaceId, paths) => {
    set({ error: null })
    try {
      const sources = await spaceApi.addSourcesFromPaths(spaceId, paths)
      set((state) => ({
        sourcesBySpaceId: {
          ...state.sourcesBySpaceId,
          [spaceId]: [
            ...sources,
            ...(state.sourcesBySpaceId[spaceId] ?? []).filter(
              (existing) =>
                !sources.some((source) => source.id === existing.id),
            ),
          ],
        },
      }))
      return sources
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to add Sources',
      })
      return []
    }
  },

  deleteSource: async (id, spaceId) => {
    set({ error: null })
    try {
      await spaceApi.deleteSource(id)
      set((state) => ({
        sourcesBySpaceId: {
          ...state.sourcesBySpaceId,
          [spaceId]: removeById(state.sourcesBySpaceId[spaceId] ?? [], id),
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete Source',
      })
    }
  },

  synthesize: async (spaceId, requestId) => {
    set({ error: null })
    try {
      return await spaceApi.synthesize(spaceId, requestId)
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to synthesize Space',
      })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))
