export interface ProjectRow {
  id: string
  name: string
  repository_path: string
  settings: string
  created_at: string
  updated_at: string
}

export interface AppStateRow {
  key: string
  value: string
}

export interface WorkspaceRow {
  id: string
  project_id: string
  branch_name: string
  path: string
  type: string
  created_at: string
}
