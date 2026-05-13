import type {
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryDetailsRequest,
  PromptLibraryOptions,
} from './prompt-library.types'

export const promptLibraryApi = {
  listByProjectId: (
    projectId: string,
    options?: PromptLibraryOptions,
  ): Promise<PromptLibraryCatalog> =>
    window.electronAPI.prompts.listByProjectId(projectId, options),

  listGlobal: (options?: PromptLibraryOptions): Promise<PromptLibraryCatalog> =>
    window.electronAPI.prompts.listGlobal(options),

  readDetails: (
    input: PromptLibraryDetailsRequest,
  ): Promise<PromptLibraryDetails> =>
    window.electronAPI.prompts.readDetails(input),
}
