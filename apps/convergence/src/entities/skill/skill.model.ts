import { create } from 'zustand'
import { skillApi } from './skill.api'
import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogEntry,
  SkillCatalogOptions,
  SkillDetails,
  SkillProviderDescriptor,
} from './skill.types'

interface SkillState {
  catalog: ProjectSkillCatalog | null
  isCatalogLoading: boolean
  /** Providers still being scanned — drives the "loading more" indicator. */
  loadingProviders: SkillProviderDescriptor[]
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
  loadGlobalCatalog: (
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
  loadingProviders: [],
  catalogError: null,
  selectedSkillId: null,
  detailsBySkillId: {},
  detailsErrorBySkillId: {},
  loadingDetailsSkillId: null,
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  ...initialState,

  loadCatalog: async (projectId, options) => {
    set({ isCatalogLoading: true, catalogError: null })

    // Phase 1: cheap provider list so the dialog shell renders immediately.
    let listing
    try {
      listing = await skillApi.listProviderIds(projectId)
    } catch (error) {
      set({
        isCatalogLoading: false,
        loadingProviders: [],
        catalogError: errorMessage(error, 'Failed to load skills'),
      })
      return null
    }

    const orderIndex = new Map(
      listing.providers.map((descriptor, index) => [
        descriptor.providerId,
        index,
      ]),
    )

    // Seed an empty catalog and mark every provider as loading.
    set((state) => ({
      catalog: {
        projectId: listing.projectId,
        projectName: listing.projectName,
        providers: [],
        refreshedAt: '',
      },
      loadingProviders: listing.providers,
      selectedSkillId: options?.forceReload ? null : state.selectedSkillId,
      detailsBySkillId: options?.forceReload ? {} : state.detailsBySkillId,
      detailsErrorBySkillId: options?.forceReload
        ? {}
        : state.detailsErrorBySkillId,
    }))

    // Phase 2: scan each provider independently and merge as they resolve, so
    // fast (filesystem) providers appear without waiting on slow ones (Codex).
    await Promise.all(
      listing.providers.map(async (descriptor) => {
        let resolved: ProviderSkillCatalog | null = null
        try {
          resolved = await skillApi.listProvider(
            projectId,
            descriptor.providerId,
            options,
          )
        } catch {
          resolved = null
        }

        set((state) => {
          const remaining = state.loadingProviders.filter(
            (provider) => provider.providerId !== descriptor.providerId,
          )
          if (!state.catalog) {
            return { loadingProviders: remaining }
          }
          const others = state.catalog.providers.filter(
            (provider) => provider.providerId !== descriptor.providerId,
          )
          // Mirror listByProjectId: only show providers with skills or an error.
          const nextProviders =
            resolved && (resolved.skills.length > 0 || resolved.error)
              ? [...others, resolved]
              : others
          nextProviders.sort(
            (a, b) =>
              (orderIndex.get(a.providerId) ?? 0) -
              (orderIndex.get(b.providerId) ?? 0),
          )
          return {
            catalog: { ...state.catalog, providers: nextProviders },
            loadingProviders: remaining,
          }
        })
      }),
    )

    set({ isCatalogLoading: false, loadingProviders: [] })
    return get().catalog
  },

  loadGlobalCatalog: async (options) => {
    set({ isCatalogLoading: true, catalogError: null })
    try {
      const catalog = await skillApi.listGlobal(options)
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
        catalogError: errorMessage(error, 'Failed to load global skills'),
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
