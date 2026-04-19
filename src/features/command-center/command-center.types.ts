import type { AttentionState } from '@/entities/session'
import type { DialogKind } from '@/entities/dialog'

export interface PaletteSearchFields {
  sessionName?: string
  projectName?: string
  branchName?: string
  providerId?: string
  attentionAlias?: string
  title?: string
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

export type NewWorkspacePaletteItem = {
  kind: 'new-workspace'
  id: string
  projectId: string
  projectName: string
  title: string
  search: PaletteSearchFields
}

export type PaletteItem =
  | ProjectPaletteItem
  | WorkspacePaletteItem
  | SessionPaletteItem
  | DialogPaletteItem
  | NewSessionPaletteItem
  | NewWorkspacePaletteItem

export type CuratedSectionId =
  | 'waiting-on-you'
  | 'needs-review'
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
