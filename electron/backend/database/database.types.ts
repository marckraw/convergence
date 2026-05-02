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

export interface WorkboardTrackerSourceRow {
  id: string
  type: string
  name: string
  enabled: number
  auth_json: string
  sync_json: string
  last_sync_at: string | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export interface WorkboardTrackerIssueRow {
  id: string
  source_id: string
  external_id: string
  external_key: string
  url: string
  title: string
  body: string
  labels_json: string
  status: string
  priority: string | null
  assignee: string | null
  updated_at_external: string | null
  raw_json: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface WorkboardProjectMappingRow {
  id: string
  source_id: string
  name: string
  enabled: number
  priority: number
  matcher_json: string
  project_id: string
  workflow_policy: string
  sandbox_mode: string
  branch_prefix: string
  stage_defaults_json: string
  created_at: string
  updated_at: string
}

export interface WorkboardRunRow {
  id: string
  project_id: string
  status: string
  workflow_policy: string
  sandbox_mode: string
  branch_strategy: string
  branch_name: string
  repo_path: string
  log_root: string
  current_stage_id: string | null
  progress_json: string
  error: string | null
  sandcastle_result_json: string
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkboardStageRow {
  id: string
  run_id: string
  role: string
  status: string
  provider_id: string
  model: string | null
  effort: string | null
  max_iterations: number
  iteration_count: number
  log_file_path: string
  commit_shas_json: string
  started_at: string | null
  ended_at: string | null
  error: string | null
  result_json: string
}

export interface WorkboardEventRow {
  id: string
  run_id: string
  stage_id: string | null
  sequence: number
  type: string
  message: string
  payload_json: string
  created_at: string
}

export interface WorkboardRunIssueRow {
  run_id: string
  tracker_issue_id: string
  sort_order: number
  lane_status: string
  branch_name: string | null
  summary: string
  created_at: string
  updated_at: string
}
