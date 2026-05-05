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
  context_kind: string
  project_id: string | null
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

export interface SessionQueuedInputRow {
  id: string
  session_id: string
  delivery_mode: string
  state: string
  text: string
  attachment_ids_json: string
  skill_selections_json: string
  provider_request_id: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceRow {
  id: string
  project_id: string
  branch_name: string
  path: string
  type: string
  archived_at: string | null
  worktree_removed_at: string | null
  created_at: string
}

export interface WorkspacePullRequestRow {
  id: string
  project_id: string
  workspace_id: string
  provider: string
  lookup_status: string
  state: string
  repository_owner: string | null
  repository_name: string | null
  number: number | null
  title: string | null
  url: string | null
  is_draft: number
  head_branch: string | null
  base_branch: string | null
  merged_at: string | null
  last_checked_at: string
  error: string | null
  created_at: string
  updated_at: string
}

export interface ReviewNoteRow {
  id: string
  session_id: string
  workspace_id: string | null
  file_path: string
  mode: string
  old_start_line: number | null
  old_end_line: number | null
  new_start_line: number | null
  new_end_line: number | null
  hunk_header: string | null
  selected_diff: string
  body: string
  state: string
  sent_at: string | null
  created_at: string
  updated_at: string
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

export interface InitiativeRow {
  id: string
  title: string
  status: string
  attention: string
  current_understanding: string
  created_at: string
  updated_at: string
}

export interface InitiativeAttemptRow {
  id: string
  initiative_id: string
  session_id: string
  role: string
  is_primary: number
  created_at: string
}

export interface InitiativeOutputRow {
  id: string
  initiative_id: string
  kind: string
  label: string
  value: string
  source_session_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface ProjectContextItemRow {
  id: string
  project_id: string
  label: string | null
  body: string
  reinject_mode: string
  created_at: string
  updated_at: string
}

export interface SessionContextAttachmentRow {
  session_id: string
  context_item_id: string
  sort_order: number
}

export interface AnalyticsProfileSnapshotRow {
  id: string
  range_preset: string
  range_start_date: string | null
  range_end_date: string
  provider_id: string | null
  model: string | null
  profile_json: string
  created_at: string
}
