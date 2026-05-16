export { SessionView } from './session-view.container'
export { SessionConversationSurface } from './session-conversation-surface.container'
export { ChangedFilesTree } from './changed-files-tree.container'
export { PierreDiffViewer } from './pierre-diff-viewer.presentational'
export { ReviewNoteDiffAnnotation } from './review-note-diff-annotation.presentational'
export {
  parseUnifiedDiffForReviewAnchors,
  summarizeSelectedDiffLines,
} from './diff-lines.pure'
export {
  mapDiffLineIdsToPierreSelection,
  mapPierreSelectionToDiffLineIds,
} from './pierre-diff-selection.pure'
export type { PierreDiffViewerProps } from './pierre-diff-viewer.presentational'
