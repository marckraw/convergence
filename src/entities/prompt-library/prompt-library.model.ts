import { create } from 'zustand'
import { promptLibraryApi } from './prompt-library.api'
import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryEntry,
  PromptLibraryOptions,
} from './prompt-library.types'

interface PromptLibraryState {
  catalog: PromptLibraryCatalog | null
  isCatalogLoading: boolean
  catalogError: string | null
  selectedPromptId: string | null
  detailsByPromptId: Record<string, PromptLibraryDetails>
  detailsErrorByPromptId: Record<string, string>
  loadingDetailsPromptId: string | null
}

interface PromptLibraryActions {
  loadCatalog: (
    projectId: string,
    options?: PromptLibraryOptions,
  ) => Promise<PromptLibraryCatalog | null>
  loadGlobalCatalog: (
    options?: PromptLibraryOptions,
  ) => Promise<PromptLibraryCatalog | null>
  selectPrompt: (promptId: string | null) => void
  loadDetails: (
    projectId: string,
    prompt: PromptLibraryEntry,
  ) => Promise<PromptLibraryDetails | null>
  reset: () => void
}

export type PromptLibraryStore = PromptLibraryState & PromptLibraryActions

const initialState: PromptLibraryState = {
  catalog: null,
  isCatalogLoading: false,
  catalogError: null,
  selectedPromptId: null,
  detailsByPromptId: {},
  detailsErrorByPromptId: {},
  loadingDetailsPromptId: null,
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function catalogHasPrompt(
  catalog: PromptLibraryCatalog,
  promptId: string | null,
): boolean {
  return (
    promptId !== null && catalog.prompts.some((entry) => entry.id === promptId)
  )
}

export const usePromptLibraryStore = create<PromptLibraryStore>((set) => ({
  ...initialState,

  loadCatalog: async (projectId, options) => {
    set({ isCatalogLoading: true, catalogError: null })
    try {
      const catalog = await promptLibraryApi.listByProjectId(projectId, options)
      set((state) => ({
        catalog,
        isCatalogLoading: false,
        selectedPromptId: catalogHasPrompt(catalog, state.selectedPromptId)
          ? state.selectedPromptId
          : null,
        detailsByPromptId: options?.forceReload ? {} : state.detailsByPromptId,
        detailsErrorByPromptId: options?.forceReload
          ? {}
          : state.detailsErrorByPromptId,
      }))
      return catalog
    } catch (error) {
      set({
        isCatalogLoading: false,
        catalogError: errorMessage(error, 'Failed to load prompt library'),
      })
      return null
    }
  },

  loadGlobalCatalog: async (options) => {
    set({ isCatalogLoading: true, catalogError: null })
    try {
      const catalog = await promptLibraryApi.listGlobal(options)
      set((state) => ({
        catalog,
        isCatalogLoading: false,
        selectedPromptId: catalogHasPrompt(catalog, state.selectedPromptId)
          ? state.selectedPromptId
          : null,
        detailsByPromptId: options?.forceReload ? {} : state.detailsByPromptId,
        detailsErrorByPromptId: options?.forceReload
          ? {}
          : state.detailsErrorByPromptId,
      }))
      return catalog
    } catch (error) {
      set({
        isCatalogLoading: false,
        catalogError: errorMessage(error, 'Failed to load global prompts'),
      })
      return null
    }
  },

  selectPrompt: (promptId) => set({ selectedPromptId: promptId }),

  loadDetails: async (projectId, prompt) => {
    set((state) => ({
      loadingDetailsPromptId: prompt.id,
      detailsErrorByPromptId: {
        ...state.detailsErrorByPromptId,
        [prompt.id]: '',
      },
    }))

    try {
      const details = await promptLibraryApi.readDetails({
        projectId,
        promptId: prompt.id,
        path: prompt.path,
      })
      set((state) => ({
        detailsByPromptId: {
          ...state.detailsByPromptId,
          [prompt.id]: details,
        },
        loadingDetailsPromptId:
          state.loadingDetailsPromptId === prompt.id
            ? null
            : state.loadingDetailsPromptId,
      }))
      return details
    } catch (error) {
      set((state) => ({
        detailsErrorByPromptId: {
          ...state.detailsErrorByPromptId,
          [prompt.id]: errorMessage(error, 'Failed to load prompt details'),
        },
        loadingDetailsPromptId:
          state.loadingDetailsPromptId === prompt.id
            ? null
            : state.loadingDetailsPromptId,
      }))
      return null
    }
  },

  reset: () => set(initialState),
}))
