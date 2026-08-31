export type TerminalPaneStatus = 'starting' | 'running' | 'exited'

export type SplitDirection = 'horizontal' | 'vertical'

export type DockPlacement = 'bottom' | 'left' | 'right'

export interface TerminalTab {
  id: string
  cwd: string
  title: string
  pid: number | null
  shell: string | null
  status: TerminalPaneStatus
  exitCode: number | null
}

export interface LeafNode {
  kind: 'leaf'
  id: string
  tabs: TerminalTab[]
  activeTabId: string
}

export interface SplitNode {
  kind: 'split'
  id: string
  direction: SplitDirection
  children: PaneTree[]
  sizes: number[]
}

export type PaneTree = LeafNode | SplitNode

export interface CreateTerminalArgs {
  sessionId: string
  cwd: string
  cols: number
  rows: number
}

export interface TerminalIdleEvent {
  sessionId: string
  terminalId: string
  processName: string
  busySince: string
  idleAt: string
  sessionName: string
  projectName: string
}

export interface TerminalIdleNotice extends TerminalIdleEvent {
  id: string
  receivedAt: string
}
