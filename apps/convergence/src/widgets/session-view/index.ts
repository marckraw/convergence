export { SessionView } from './session-view.container'
export { SessionConversationSurface } from './session-conversation-surface.container'
export { SessionWiresContainer } from './session-wires.container'
export { ConversationViewMenu } from './conversation-view-menu.container'
export { ChangedFilesTree } from './changed-files-tree.container'
export { DiffFileHeader } from './diff-file-header.presentational'
export { PierreDiffViewer } from './pierre-diff-viewer.container'
export type {
  DiffFileHeaderProps,
  DiffFileHeaderSubtitleVariant,
} from './diff-file-header.presentational'
export type { PierreDiffViewerProps } from './pierre-diff-viewer.presentational'

export { ParallelWork } from './parallel-work.container'
export { useParallelWork } from './use-parallel-work'
export {
  ConversationHeader,
  headerFocusTarget,
} from './conversation-header.container'
export { parallelWorkInRow } from './conversation-header.pure'
