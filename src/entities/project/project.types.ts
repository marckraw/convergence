export interface Project {
  id: string
  name: string
  repositoryPath: string
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
