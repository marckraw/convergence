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
  context_window: string | null
  activity: string | null
  archived_at: string | null
  last_sequence: number
  conversation_version: number
  name_auto_generated: number
  parent_session_id: string | null
  fork_strategy: string | null
  primary_surface: string
  created_at: string
  updated_at: string
}

export interface ConversationItemRow {
  id: string
  session_id: string
  sequence: number
  turn_id: string | null
  kind: string
  state: string
  payload_json: string
  provider_item_id: string | null
  provider_event_type: string | null
  provider_id: string
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

export interface SessionTurnRow {
  id: string
  session_id: string
  sequence: number
  started_at: string
  ended_at: string | null
  status: string
  summary: string | null
}

export interface SessionTurnFileChangeRow {
  id: string
  session_id: string
  turn_id: string
  file_path: string
  old_path: string | null
  status: string
  additions: number
  deletions: number
  diff: string
  created_at: string
}
