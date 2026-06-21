import type {
  ProjectSkillCatalog,
  SkillCatalogOptions,
  SkillDetails,
  SkillDetailsRequest,
} from './skill.types'

export const skillApi = {
  listByProjectId: (
    projectId: string,
    options?: SkillCatalogOptions,
  ): Promise<ProjectSkillCatalog> =>
    window.electronAPI.skills.listByProjectId(projectId, options),

  listGlobal: (options?: SkillCatalogOptions): Promise<ProjectSkillCatalog> =>
    window.electronAPI.skills.listGlobal(options),

  readDetails: (input: SkillDetailsRequest): Promise<SkillDetails> =>
    window.electronAPI.skills.readDetails(input),

  reveal: (input: SkillDetailsRequest): Promise<void> =>
    window.electronAPI.skills.reveal(input),

  openPath: (input: SkillDetailsRequest): Promise<void> =>
    window.electronAPI.skills.openPath(input),
}
