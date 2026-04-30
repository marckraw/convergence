import type { AttentionState } from '@/entities/session'
import type { DialogKind, DialogPayload } from '@/entities/dialog'

export interface PaletteSearchFields {
  sessionName?: string
  projectName?: string
  branchName?: string
  providerId?: string
  attentionAlias?: string
  title?: string
  aliases?: string
}

export type ProjectPaletteItem = {
  kind: 'project'
  id: string
  projectId: string
  projectName: string
  repositoryPath: string
  search: PaletteSearchFields
}

export type WorkspacePaletteItem = {
  kind: 'workspace'
  id: string
  workspaceId: string
  projectId: string
  projectName: string
  branchName: string
  path: string
  search: PaletteSearchFields
}

export type SessionPaletteItem = {
  kind: 'session'
  id: string
  sessionId: string
  projectId: string
  workspaceId: string | null
  sessionName: string
  projectName: string
  branchName: string | null
  providerId: string
  attention: AttentionState
  updatedAt: string
  search: PaletteSearchFields
}

export type DialogPaletteItem = {
  kind: 'dialog'
  id: string
  dialogKind: DialogKind
  dialogPayload?: DialogPayload
  title: string
  description: string
  search: PaletteSearchFields
}

export type NewSessionPaletteItem = {
  kind: 'new-session'
  id: string
  workspaceId: string
  projectId: string
  branchName: string
  projectName: string
  title: string
  search: PaletteSearchFields
}

export type NewTerminalSessionPaletteItem = {
  kind: 'new-terminal-session'
  id: string
  workspaceId: string | null
  projectId: string
  branchName: string | null
  projectName: string
  title: string
  search: PaletteSearchFields
}

export type NewWorkspacePaletteItem = {
  kind: 'new-workspace'
  id: string
  projectId: string
  projectName: string
  title: string
  search: PaletteSearchFields
}

export type ForkSessionPaletteItem = {
  kind: 'fork-session'
  id: string
  sessionId: string
  sessionName: string
  projectName: string
  title: string
  search: PaletteSearchFields
}

export type SwapPrimarySurfacePaletteItem = {
  kind: 'swap-primary-surface'
  id: string
  sessionId: string
  sessionName: string
  projectName: string
  target: 'conversation' | 'terminal'
  title: string
  search: PaletteSearchFields
}

export type CheckUpdatesPaletteItem = {
  kind: 'check-updates'
  id: string
  title: string
  description: string
  search: PaletteSearchFields
}

export type PaletteItem =
  | ProjectPaletteItem
  | WorkspacePaletteItem
  | SessionPaletteItem
  | DialogPaletteItem
  | NewSessionPaletteItem
  | NewTerminalSessionPaletteItem
  | NewWorkspacePaletteItem
  | ForkSessionPaletteItem
  | SwapPrimarySurfacePaletteItem
  | CheckUpdatesPaletteItem

export type CuratedSectionId =
  | 'waiting-on-you'
  | 'needs-review'
  | 'session-actions'
  | 'recent-sessions'
  | 'projects'
  | 'workspaces'
  | 'dialogs'

export interface CuratedSection {
  id: CuratedSectionId
  title: string
  items: PaletteItem[]
}

export type CuratedSections = CuratedSection[]

export interface RankedItem {
  item: PaletteItem
  score: number
}
