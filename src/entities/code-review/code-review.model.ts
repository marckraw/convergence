import { create } from 'zustand'
import { codeReviewApi } from './code-review.api'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewSummaryKey,
} from './code-review.pure'
import type {
  CodeReviewFilePatchRequest,
  CodeReviewListTargetsRequest,
  CodeReviewMode,
  CodeReviewSummary,
  CodeReviewSummaryRequest,
  CodeReviewTarget,
} from './code-review.types'

interface CodeReviewState {
  isReviewOpen: boolean
  targets: CodeReviewTarget[]
  selectedTarget: CodeReviewTarget | null
  selectedMode: CodeReviewMode
  selectedFile: string | null
  targetsLoading: boolean
  summariesByKey: Record<string, CodeReviewSummary>
  filePatchesByKey: Record<string, string>
  loadingSummaryKeys: Record<string, boolean>
  loadingFilePatchKeys: Record<string, boolean>
  error: string | null
}

interface CodeReviewActions {
  openReview: (input?: {
    target?: CodeReviewTarget | null
    mode?: CodeReviewMode
    selectedFile?: string | null
  }) => void
  closeReview: () => void
  setSelectedTarget: (target: CodeReviewTarget | null) => void
  setSelectedMode: (mode: CodeReviewMode) => void
  setSelectedFile: (filePath: string | null) => void
  loadTargets: (
    input: CodeReviewListTargetsRequest,
  ) => Promise<CodeReviewTarget[]>
  loadSummary: (
    input: CodeReviewSummaryRequest,
    options?: CodeReviewLoadOptions,
  ) => Promise<CodeReviewSummary | null>
  loadFilePatch: (
    input: CodeReviewFilePatchRequest,
    options?: CodeReviewLoadOptions,
  ) => Promise<string | null>
  clearError: () => void
}

export type CodeReviewStore = CodeReviewState & CodeReviewActions

interface CodeReviewLoadOptions {
  force?: boolean
}

const summaryRequestsByKey = new Map<
  string,
  Promise<CodeReviewSummary | null>
>()
const summaryRequestVersionsByKey = new Map<string, number>()
const filePatchRequestsByKey = new Map<string, Promise<string | null>>()
const filePatchRequestVersionsByKey = new Map<string, number>()

export const useCodeReviewStore = create<CodeReviewStore>((set, get) => ({
  isReviewOpen: false,
  targets: [],
  selectedTarget: null,
  selectedMode: 'working-tree',
  selectedFile: null,
  targetsLoading: false,
  summariesByKey: {},
  filePatchesByKey: {},
  loadingSummaryKeys: {},
  loadingFilePatchKeys: {},
  error: null,

  openReview: (input) =>
    set((state) => ({
      isReviewOpen: true,
      selectedTarget:
        input && 'target' in input
          ? (input.target ?? null)
          : state.selectedTarget,
      selectedMode: input?.mode ?? state.selectedMode,
      selectedFile:
        input && 'selectedFile' in input
          ? (input.selectedFile ?? null)
          : state.selectedFile,
    })),
  closeReview: () => set({ isReviewOpen: false }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),

  loadTargets: async (input) => {
    set({ targetsLoading: true, error: null })

    try {
      const targets = await codeReviewApi.listTargets(input)
      set((state) => {
        const selectedTarget = state.selectedTarget
          ? (targets.find((target) => target.id === state.selectedTarget?.id) ??
            targets[0] ??
            null)
          : (targets[0] ?? null)
        return { targets, selectedTarget }
      })
      return targets
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load code review targets') })
      return []
    } finally {
      set({ targetsLoading: false })
    }
  },

  loadSummary: async (input, options) => {
    const key = buildCodeReviewSummaryKey(input)
    if (!options?.force) {
      const cachedSummary = get().summariesByKey[key]
      if (cachedSummary) return cachedSummary

      const pendingRequest = summaryRequestsByKey.get(key)
      if (pendingRequest) return pendingRequest
    }

    const requestVersion = nextRequestVersion(summaryRequestVersionsByKey, key)
    set((state) => ({
      loadingSummaryKeys: { ...state.loadingSummaryKeys, [key]: true },
      error: null,
    }))

    const request = (async () => {
      try {
        const summary = await codeReviewApi.getSummary(input)
        if (isLatestRequest(summaryRequestVersionsByKey, key, requestVersion)) {
          set((state) => ({
            summariesByKey: { ...state.summariesByKey, [key]: summary },
          }))
        }
        return summary
      } catch (err) {
        if (isLatestRequest(summaryRequestVersionsByKey, key, requestVersion)) {
          set({
            error: errorMessage(err, 'Failed to load code review summary'),
          })
        }
        return null
      } finally {
        if (isLatestRequest(summaryRequestVersionsByKey, key, requestVersion)) {
          set((state) => ({
            loadingSummaryKeys: { ...state.loadingSummaryKeys, [key]: false },
          }))
        }
        if (isLatestRequest(summaryRequestVersionsByKey, key, requestVersion)) {
          summaryRequestsByKey.delete(key)
        }
      }
    })()

    summaryRequestsByKey.set(key, request)
    return request
  },

  loadFilePatch: async (input, options) => {
    const key = buildCodeReviewFilePatchKey(input)
    if (!options?.force) {
      const cachedPatch = get().filePatchesByKey[key]
      if (cachedPatch !== undefined) return cachedPatch

      const pendingRequest = filePatchRequestsByKey.get(key)
      if (pendingRequest) return pendingRequest
    }

    const requestVersion = nextRequestVersion(
      filePatchRequestVersionsByKey,
      key,
    )
    set((state) => ({
      loadingFilePatchKeys: {
        ...state.loadingFilePatchKeys,
        [key]: true,
      },
      error: null,
    }))

    const request = (async () => {
      try {
        const patch = await codeReviewApi.getFilePatch(input)
        if (
          isLatestRequest(filePatchRequestVersionsByKey, key, requestVersion)
        ) {
          set((state) => ({
            filePatchesByKey: { ...state.filePatchesByKey, [key]: patch },
          }))
        }
        return patch
      } catch (err) {
        if (
          isLatestRequest(filePatchRequestVersionsByKey, key, requestVersion)
        ) {
          set({ error: errorMessage(err, 'Failed to load code review diff') })
        }
        return null
      } finally {
        if (
          isLatestRequest(filePatchRequestVersionsByKey, key, requestVersion)
        ) {
          set((state) => ({
            loadingFilePatchKeys: {
              ...state.loadingFilePatchKeys,
              [key]: false,
            },
          }))
        }
        if (
          isLatestRequest(filePatchRequestVersionsByKey, key, requestVersion)
        ) {
          filePatchRequestsByKey.delete(key)
        }
      }
    })()

    filePatchRequestsByKey.set(key, request)
    return request
  },

  clearError: () => set({ error: null }),
}))

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function nextRequestVersion(map: Map<string, number>, key: string): number {
  const nextVersion = (map.get(key) ?? 0) + 1
  map.set(key, nextVersion)
  return nextVersion
}

function isLatestRequest(
  map: Map<string, number>,
  key: string,
  version: number,
): boolean {
  return map.get(key) === version
}
