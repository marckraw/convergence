// canary: renderer-fsd-public-api-imports
// Reaches into shared/ui past its index.ts through the @/ alias: Markdown's container by its file
// name, where @/shared/ui is the way in (DS-31, MAR-3608).
import { Markdown } from '@/shared/ui/markdown.container'

export const releaseNotesBody = Markdown
