// canary: renderer-fsd-public-api-imports
// Reaches into shared/ui past its index.ts by a relative path, the spelling an app with no @/
// alias would use: Markdown's container by its file name (DS-31, MAR-3608).
import { Markdown } from '../../shared/ui/markdown.container'

export const releasePanelBody = Markdown
