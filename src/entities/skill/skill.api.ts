import type {
  ProjectSkillCatalog,
  ProviderSkillCatalog,
  SkillCatalogOptions,
  SkillDetails,
  SkillDetailsRequest,
  SkillProviderId,
  SkillProviderListing,
} from './skill.types'

export const skillApi = {
  listByProjectId: (
    projectId: string,
    options?: SkillCatalogOptions,
  ): Promise<ProjectSkillCatalog> =>
    window.electronAPI.skills.listByProjectId(projectId, options),

  listGlobal: (options?: SkillCatalogOptions): Promise<ProjectSkillCatalog> =>
    window.electronAPI.skills.listGlobal(options),

  listProviderIds: (projectId: string): Promise<SkillProviderListing> =>
    window.electronAPI.skills.listProviderIds(projectId),

  listProvider: (
    projectId: string,
    providerId: SkillProviderId,
    options?: SkillCatalogOptions,
  ): Promise<ProviderSkillCatalog | null> =>
    window.electronAPI.skills.listProvider(projectId, providerId, options),

  readDetails: (input: SkillDetailsRequest): Promise<SkillDetails> =>
    window.electronAPI.skills.readDetails(input),

  reveal: (input: SkillDetailsRequest): Promise<void> =>
    window.electronAPI.skills.reveal(input),

  openPath: (input: SkillDetailsRequest): Promise<void> =>
    window.electronAPI.skills.openPath(input),
}
