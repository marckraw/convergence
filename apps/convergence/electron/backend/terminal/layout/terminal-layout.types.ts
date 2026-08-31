export type PersistedSplitDirection = 'horizontal' | 'vertical'

export interface PersistedTerminalTab {
  id: string
  cwd: string
  title: string
}

export interface PersistedLeaf {
  kind: 'leaf'
  id: string
  tabs: PersistedTerminalTab[]
  activeTabId: string
}

export interface PersistedSplit {
  kind: 'split'
  id: string
  direction: PersistedSplitDirection
  children: PersistedPaneTree[]
  sizes: number[]
}

export type PersistedPaneTree = PersistedLeaf | PersistedSplit

export interface PersistedTerminalLayout {
  sessionId: string
  tree: PersistedPaneTree
  updatedAt: string
}

export interface TerminalLayoutValidationError {
  reason: string
  path: string
}
