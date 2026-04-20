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

export interface SessionRow {
  id: string
  project_id: string
  workspace_id: string | null
  provider_id: string
  model: string | null
  effort: string | null
  continuation_token: string | null
  name: string
  status: string
  attention: string
  working_directory: string
  transcript: string
  context_window: string | null
  activity: string | null
  archived_at: string | null
  name_auto_generated: number
  parent_session_id: string | null
  fork_strategy: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceRow {
  id: string
  project_id: string
  branch_name: string
  path: string
  type: string
  created_at: string
}
