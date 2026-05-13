export type PromptLibraryScope = 'project' | 'global'

export type PromptLibraryFileKind = 'markdown' | 'text'

export interface PromptLibraryEntry {
  id: string
  title: string
  description: string
  shortDescription: string | null
  path: string
  relativePath: string
  scope: PromptLibraryScope
  sourceLabel: string
  kind: PromptLibraryFileKind
  tags: string[]
  sizeBytes: number
}

export interface PromptLibraryCatalog {
  projectId: string
  projectName: string
  prompts: PromptLibraryEntry[]
  roots: Array<{
    scope: PromptLibraryScope
    path: string
    exists: boolean
  }>
  refreshedAt: string
}

export interface PromptLibraryOptions {
  forceReload?: boolean
}

export interface PromptLibraryDetailsRequest {
  projectId: string
  promptId: string
  path: string
}

export interface PromptLibraryDetails {
  promptId: string
  path: string
  markdown: string
  promptText: string
  sizeBytes: number
}
