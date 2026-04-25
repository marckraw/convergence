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

  readDetails: (input: SkillDetailsRequest): Promise<SkillDetails> =>
    window.electronAPI.skills.readDetails(input),
}
