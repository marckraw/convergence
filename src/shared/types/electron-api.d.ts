interface ProjectData {
  id: string
  name: string
  repositoryPath: string
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

interface ElectronAPI {
  project: {
    create: (input: CreateProjectInput) => Promise<ProjectData>
    getAll: () => Promise<ProjectData[]>
    getById: (id: string) => Promise<ProjectData | null>
    delete: (id: string) => Promise<void>
    getActive: () => Promise<ProjectData | null>
    setActive: (id: string) => Promise<void>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
