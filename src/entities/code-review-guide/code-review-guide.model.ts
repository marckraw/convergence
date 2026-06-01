import { create } from 'zustand'
import { buildCodeReviewGuideKey } from './code-review-guide.pure'
import { codeReviewGuideApi } from './code-review-guide.api'
import type {
  CodeReviewGuide,
  CodeReviewGuideGenerateRequest,
  CodeReviewGuideLookupRequest,
} from './code-review-guide.types'

interface CodeReviewGuideState {
  guidesByKey: Record<string, CodeReviewGuide>
  loadingGuideKeys: Record<string, boolean>
  generatingGuideKeys: Record<string, boolean>
  error: string | null
}

interface CodeReviewGuideActions {
  loadGuide: (
    input: CodeReviewGuideLookupRequest,
  ) => Promise<CodeReviewGuide | null>
  generateGuide: (
    input: CodeReviewGuideGenerateRequest,
  ) => Promise<CodeReviewGuide | null>
  refreshGuide: (
    input: CodeReviewGuideGenerateRequest,
  ) => Promise<CodeReviewGuide | null>
  clearError: () => void
}

export type CodeReviewGuideStore = CodeReviewGuideState & CodeReviewGuideActions

type CodeReviewGuideStoreSet = (
  partial:
    | Partial<CodeReviewGuideStore>
    | ((state: CodeReviewGuideStore) => Partial<CodeReviewGuideStore>),
) => void

const guideRequestsByKey = new Map<string, Promise<CodeReviewGuide | null>>()
const guideGenerationRequestsByKey = new Map<
  string,
  Promise<CodeReviewGuide | null>
>()

export const useCodeReviewGuideStore = create<CodeReviewGuideStore>(
  (set, get): CodeReviewGuideStore => ({
    guidesByKey: {},
    loadingGuideKeys: {},
    generatingGuideKeys: {},
    error: null,

    loadGuide: async (input) => {
      const key = buildCodeReviewGuideKey(input)
      const cachedGuide = get().guidesByKey[key]
      if (cachedGuide) return cachedGuide

      const pendingRequest = guideRequestsByKey.get(key)
      if (pendingRequest) return pendingRequest

      set((state) => ({
        loadingGuideKeys: { ...state.loadingGuideKeys, [key]: true },
        error: null,
      }))

      const request = (async () => {
        try {
          const guide = await codeReviewGuideApi.getGuide(input)
          if (guide) {
            set((state) => ({
              guidesByKey: { ...state.guidesByKey, [key]: guide },
            }))
          }
          return guide
        } catch (err) {
          set({ error: errorMessage(err, 'Failed to load code review guide') })
          return null
        } finally {
          set((state) => ({
            loadingGuideKeys: { ...state.loadingGuideKeys, [key]: false },
          }))
          guideRequestsByKey.delete(key)
        }
      })()

      guideRequestsByKey.set(key, request)
      return request
    },

    generateGuide: async (input) => runGuideGeneration(set, input, 'generate'),

    refreshGuide: async (input) => runGuideGeneration(set, input, 'refresh'),

    clearError: () => set({ error: null }),
  }),
)

function runGuideGeneration(
  set: CodeReviewGuideStoreSet,
  input: CodeReviewGuideGenerateRequest,
  mode: 'generate' | 'refresh',
): Promise<CodeReviewGuide | null> {
  const key = buildCodeReviewGuideKey(input)
  const pendingRequest = guideGenerationRequestsByKey.get(key)
  if (pendingRequest) return pendingRequest

  set((state) => ({
    generatingGuideKeys: { ...state.generatingGuideKeys, [key]: true },
    error: null,
  }))

  const request = (async () => {
    try {
      const guide =
        mode === 'refresh'
          ? await codeReviewGuideApi.refreshGuide(input)
          : await codeReviewGuideApi.generateGuide(input)
      set((state) => ({
        guidesByKey: { ...state.guidesByKey, [key]: guide },
      }))
      return guide
    } catch (err) {
      set({
        error: errorMessage(
          err,
          mode === 'refresh'
            ? 'Failed to refresh code review guide'
            : 'Failed to generate code review guide',
        ),
      })
      return null
    } finally {
      set((state) => ({
        generatingGuideKeys: { ...state.generatingGuideKeys, [key]: false },
      }))
      guideGenerationRequestsByKey.delete(key)
    }
  })()

  guideGenerationRequestsByKey.set(key, request)
  return request
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
