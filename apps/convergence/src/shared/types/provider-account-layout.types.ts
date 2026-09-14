export type ClaudeAccountLinkStatus =
  | 'linked'
  | 'wrong-target'
  | 'dangling'
  | 'real-directory'
  | 'real-file'
  | 'missing'
  | 'unreadable'

export interface ClaudeAccountLayoutEntry {
  name: string
  status: ClaudeAccountLinkStatus
  hasPrivateContent: boolean
}

export interface ClaudeAccountLayout {
  entries: ClaudeAccountLayoutEntry[]
  fullyShared: boolean
  privateEntries: string[]
  unreadableEntries: string[]
}
