export { matchPaletteShortcut } from './command-palette-trigger.pure'
export type { KeyEventLike, Platform } from './command-palette-trigger.pure'
export {
  buildPaletteIndex,
  PALETTE_DIALOGS,
} from './command-palette-index.pure'
export type { BuildPaletteIndexInput } from './command-palette-index.pure'
export {
  buildCuratedSections,
  rankForQuery,
  PALETTE_FUSE_KEYS,
  PALETTE_FUSE_OPTIONS,
} from './command-palette-ranking.pure'
export type { PaletteFuse } from './command-palette-ranking.pure'
export type {
  PaletteItem,
  PaletteSearchFields,
  ProjectPaletteItem,
  WorkspacePaletteItem,
  SessionPaletteItem,
  DialogPaletteItem,
  NewSessionPaletteItem,
  NewWorkspacePaletteItem,
  CuratedSection,
  CuratedSections,
  CuratedSectionId,
  RankedItem,
} from './command-center.types'
export { switchToSession, activateProject, openDialog } from './intents'
