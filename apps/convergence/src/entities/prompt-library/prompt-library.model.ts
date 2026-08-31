import { create } from 'zustand'
import { promptLibraryApi } from './prompt-library.api'
import type {
  CreatePromptLibraryInput,
  DeletePromptLibraryInput,
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryEntry,
  PromptLibraryOptions,
  UpdatePromptLibraryInput,
} from './prompt-library.types'

interface PromptLibraryState {
  catalog: PromptLibraryCatalog | null
  isCatalogLoading: boolean
  catalogError: string | null
  selectedPromptId: string | null
  detailsByPromptId: Record<string, PromptLibraryDetails>
  detailsErrorByPromptId: Record<string, string>
  loadingDetailsPromptId: string | null
  isMutating: boolean
  mutationError: string | null
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
  createPrompt: (
    input: CreatePromptLibraryInput,
  ) => Promise<PromptLibraryEntry | null>
  updatePrompt: (
    input: UpdatePromptLibraryInput,
  ) => Promise<PromptLibraryEntry | null>
  deletePrompt: (input: DeletePromptLibraryInput) => Promise<boolean>
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
  isMutating: false,
  mutationError: null,
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

  createPrompt: async (input) => {
    set({ isMutating: true, mutationError: null })
    try {
      const prompt = await promptLibraryApi.create(input)
      set({ isMutating: false, selectedPromptId: prompt.id })
      await usePromptLibraryStore
        .getState()
        .loadCatalog(input.projectId, { forceReload: true })
      return prompt
    } catch (error) {
      set({
        isMutating: false,
        mutationError: errorMessage(error, 'Failed to create prompt'),
      })
      return null
    }
  },

  updatePrompt: async (input) => {
    set({ isMutating: true, mutationError: null })
    try {
      const prompt = await promptLibraryApi.update(input)
      set((state) => ({
        isMutating: false,
        selectedPromptId: prompt.id,
        detailsByPromptId: Object.fromEntries(
          Object.entries(state.detailsByPromptId).filter(
            ([id]) => id !== prompt.id,
          ),
        ),
      }))
      await usePromptLibraryStore
        .getState()
        .loadCatalog(input.projectId, { forceReload: true })
      return prompt
    } catch (error) {
      set({
        isMutating: false,
        mutationError: errorMessage(error, 'Failed to update prompt'),
      })
      return null
    }
  },

  deletePrompt: async (input) => {
    set({ isMutating: true, mutationError: null })
    try {
      await promptLibraryApi.delete(input)
      set((state) => {
        const nextDetails = { ...state.detailsByPromptId }
        const nextErrors = { ...state.detailsErrorByPromptId }
        delete nextDetails[input.promptId]
        delete nextErrors[input.promptId]
        return {
          isMutating: false,
          selectedPromptId:
            state.selectedPromptId === input.promptId
              ? null
              : state.selectedPromptId,
          detailsByPromptId: nextDetails,
          detailsErrorByPromptId: nextErrors,
        }
      })
      await usePromptLibraryStore
        .getState()
        .loadCatalog(input.projectId, { forceReload: true })
      return true
    } catch (error) {
      set({
        isMutating: false,
        mutationError: errorMessage(error, 'Failed to delete prompt'),
      })
      return false
    }
  },

  reset: () => set(initialState),
}))
