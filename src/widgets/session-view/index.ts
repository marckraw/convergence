export { SessionView } from './session-view.container'
export { SessionConversationSurface } from './session-conversation-surface.container'
export { ChangedFilesTree } from './changed-files-tree.container'
export { DiffFileHeader } from './diff-file-header.presentational'
export { PierreDiffViewer } from './pierre-diff-viewer.container'
export { ReviewNoteDiffAnnotation } from './review-note-diff-annotation.presentational'
export {
  parseUnifiedDiffForReviewAnchors,
  summarizeSelectedDiffLines,
} from './diff-lines.pure'
export {
  mapDiffLineIdsToPierreSelection,
  mapPierreSelectionToDiffLineIds,
} from './pierre-diff-selection.pure'
export type {
  DiffFileHeaderProps,
  DiffFileHeaderSubtitleVariant,
} from './diff-file-header.presentational'
export type { PierreDiffViewerProps } from './pierre-diff-viewer.presentational'
