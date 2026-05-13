import type {
  CreatePromptLibraryInput,
  DeletePromptLibraryInput,
  PromptLibraryCatalog,
  PromptLibraryDetails,
  PromptLibraryDetailsRequest,
  PromptLibraryEntry,
  PromptLibraryOptions,
  UpdatePromptLibraryInput,
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

  create: (input: CreatePromptLibraryInput): Promise<PromptLibraryEntry> =>
    window.electronAPI.prompts.create(input),

  update: (input: UpdatePromptLibraryInput): Promise<PromptLibraryEntry> =>
    window.electronAPI.prompts.update(input),

  delete: (input: DeletePromptLibraryInput): Promise<void> =>
    window.electronAPI.prompts.delete(input),
}
