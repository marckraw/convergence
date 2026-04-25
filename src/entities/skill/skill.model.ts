import { create } from 'zustand'
import { skillApi } from './skill.api'
import type {
  ProjectSkillCatalog,
  SkillCatalogEntry,
  SkillCatalogOptions,
  SkillDetails,
} from './skill.types'

interface SkillState {
  catalog: ProjectSkillCatalog | null
  isCatalogLoading: boolean
  catalogError: string | null
  selectedSkillId: string | null
  detailsBySkillId: Record<string, SkillDetails>
  detailsErrorBySkillId: Record<string, string>
  loadingDetailsSkillId: string | null
}

interface SkillActions {
  loadCatalog: (
    projectId: string,
    options?: SkillCatalogOptions,
  ) => Promise<ProjectSkillCatalog | null>
  selectSkill: (skillId: string | null) => void
  loadDetails: (
    projectId: string,
    skill: SkillCatalogEntry,
  ) => Promise<SkillDetails | null>
  reset: () => void
}

export type SkillStore = SkillState & SkillActions

const initialState: SkillState = {
  catalog: null,
  isCatalogLoading: false,
  catalogError: null,
  selectedSkillId: null,
  detailsBySkillId: {},
  detailsErrorBySkillId: {},
  loadingDetailsSkillId: null,
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useSkillStore = create<SkillStore>((set) => ({
  ...initialState,

  loadCatalog: async (projectId, options) => {
    set({ isCatalogLoading: true, catalogError: null })
    try {
      const catalog = await skillApi.listByProjectId(projectId, options)
      set((state) => {
        const hasSelectedSkill =
          state.selectedSkillId !== null &&
          catalog.providers.some((provider) =>
            provider.skills.some((skill) => skill.id === state.selectedSkillId),
          )

        return {
          catalog,
          isCatalogLoading: false,
          selectedSkillId: hasSelectedSkill ? state.selectedSkillId : null,
          detailsBySkillId: options?.forceReload ? {} : state.detailsBySkillId,
          detailsErrorBySkillId: options?.forceReload
            ? {}
            : state.detailsErrorBySkillId,
        }
      })
      return catalog
    } catch (error) {
      set({
        isCatalogLoading: false,
        catalogError: errorMessage(error, 'Failed to load skills'),
      })
      return null
    }
  },

  selectSkill: (skillId) => set({ selectedSkillId: skillId }),

  loadDetails: async (projectId, skill) => {
    if (!skill.path) {
      set((state) => ({
        detailsErrorBySkillId: {
          ...state.detailsErrorBySkillId,
          [skill.id]: 'This skill did not report a SKILL.md path.',
        },
      }))
      return null
    }

    set((state) => ({
      loadingDetailsSkillId: skill.id,
      detailsErrorBySkillId: {
        ...state.detailsErrorBySkillId,
        [skill.id]: '',
      },
    }))

    try {
      const details = await skillApi.readDetails({
        projectId,
        providerId: skill.providerId,
        skillId: skill.id,
        path: skill.path,
      })
      set((state) => ({
        detailsBySkillId: {
          ...state.detailsBySkillId,
          [skill.id]: details,
        },
        loadingDetailsSkillId:
          state.loadingDetailsSkillId === skill.id
            ? null
            : state.loadingDetailsSkillId,
      }))
      return details
    } catch (error) {
      set((state) => ({
        detailsErrorBySkillId: {
          ...state.detailsErrorBySkillId,
          [skill.id]: errorMessage(error, 'Failed to load skill details'),
        },
        loadingDetailsSkillId:
          state.loadingDetailsSkillId === skill.id
            ? null
            : state.loadingDetailsSkillId,
      }))
      return null
    }
  },

  reset: () => set(initialState),
}))
