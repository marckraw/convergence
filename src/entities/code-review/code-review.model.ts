import { create } from 'zustand'
import { codeReviewApi } from './code-review.api'
import {
  buildCodeReviewFilePatchKey,
  buildCodeReviewFilePatchSelectionKey,
  buildCodeReviewSummaryKey,
  buildCodeReviewSummarySelectionKey,
} from './code-review.pure'
import type {
  CodeReviewFilePatchRequest,
  CodeReviewListTargetsRequest,
  CodeReviewMode,
  CodeReviewSummary,
  CodeReviewSummaryRequest,
  CodeReviewTarget,
  CodeReviewView,
} from './code-review.types'

interface CodeReviewState {
  isReviewOpen: boolean
  targets: CodeReviewTarget[]
  selectedTarget: CodeReviewTarget | null
  selectedMode: CodeReviewMode
  selectedView: CodeReviewView
  selectedFile: string | null
  targetsLoading: boolean
  summariesByKey: Record<string, CodeReviewSummary>
  summaryKeysBySelectionKey: Record<string, string>
  filePatchesByKey: Record<string, string>
  filePatchKeysBySelectionKey: Record<string, string>
  loadingSummaryKeys: Record<string, boolean>
  loadingFilePatchKeys: Record<string, boolean>
  error: string | null
}

interface CodeReviewActions {
  openReview: (input?: {
    target?: CodeReviewTarget | null
    mode?: CodeReviewMode
    view?: CodeReviewView
    selectedFile?: string | null
  }) => void
  closeReview: () => void
  setSelectedTarget: (target: CodeReviewTarget | null) => void
  setSelectedMode: (mode: CodeReviewMode) => void
  setSelectedView: (view: CodeReviewView) => void
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
  selectedView: 'guide',
  selectedFile: null,
  targetsLoading: false,
  summariesByKey: {},
  summaryKeysBySelectionKey: {},
  filePatchesByKey: {},
  filePatchKeysBySelectionKey: {},
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
      selectedView: input?.view ?? state.selectedView,
      selectedFile:
        input && 'selectedFile' in input
          ? (input.selectedFile ?? null)
          : state.selectedFile,
    })),
  closeReview: () => set({ isReviewOpen: false }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  setSelectedView: (selectedView) => set({ selectedView }),
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
    const selectionKey = buildCodeReviewSummarySelectionKey(input)
    if (!options?.force) {
      const cachedKey = get().summaryKeysBySelectionKey[selectionKey]
      const cachedSummary = cachedKey
        ? get().summariesByKey[cachedKey]
        : undefined
      if (cachedSummary) return cachedSummary

      const pendingRequest = summaryRequestsByKey.get(selectionKey)
      if (pendingRequest) return pendingRequest
    }

    const requestVersion = nextRequestVersion(
      summaryRequestVersionsByKey,
      selectionKey,
    )
    set((state) => ({
      loadingSummaryKeys: {
        ...state.loadingSummaryKeys,
        [selectionKey]: true,
      },
      error: null,
    }))

    const request = (async () => {
      try {
        const summary = await codeReviewApi.getSummary(input)
        const cacheKey = buildCodeReviewSummaryKey({
          ...input,
          cacheIdentity: summary.cacheIdentity,
        })
        if (
          isLatestRequest(
            summaryRequestVersionsByKey,
            selectionKey,
            requestVersion,
          )
        ) {
          set((state) => ({
            summariesByKey: { ...state.summariesByKey, [cacheKey]: summary },
            summaryKeysBySelectionKey: {
              ...state.summaryKeysBySelectionKey,
              [selectionKey]: cacheKey,
            },
          }))
        }
        return summary
      } catch (err) {
        if (
          isLatestRequest(
            summaryRequestVersionsByKey,
            selectionKey,
            requestVersion,
          )
        ) {
          set({
            error: errorMessage(err, 'Failed to load code review summary'),
          })
        }
        return null
      } finally {
        if (
          isLatestRequest(
            summaryRequestVersionsByKey,
            selectionKey,
            requestVersion,
          )
        ) {
          set((state) => ({
            loadingSummaryKeys: {
              ...state.loadingSummaryKeys,
              [selectionKey]: false,
            },
          }))
        }
        if (
          isLatestRequest(
            summaryRequestVersionsByKey,
            selectionKey,
            requestVersion,
          )
        ) {
          summaryRequestsByKey.delete(selectionKey)
        }
      }
    })()

    summaryRequestsByKey.set(selectionKey, request)
    return request
  },

  loadFilePatch: async (input, options) => {
    const key = buildCodeReviewFilePatchKey(input)
    const selectionKey = buildCodeReviewFilePatchSelectionKey(input)
    if (!options?.force) {
      const cachedPatch = get().filePatchesByKey[key]
      if (cachedPatch !== undefined) {
        set((state) => ({
          filePatchKeysBySelectionKey: {
            ...state.filePatchKeysBySelectionKey,
            [selectionKey]: key,
          },
        }))
        return cachedPatch
      }

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
            filePatchKeysBySelectionKey: {
              ...state.filePatchKeysBySelectionKey,
              [selectionKey]: key,
            },
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
