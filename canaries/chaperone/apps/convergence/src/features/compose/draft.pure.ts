// canary: preset/pure-files-need-tests, pure-files-need-sibling-tests, preset/pure-no-side-effects, preset/pure-no-api-imports
// No sibling draft.pure.test.ts, and it logs and imports an .api module.
import { saveDraft } from './draft.api'

export function stampDraft(text: string) {
  console.log('stamping')
  saveDraft(text)
  return { text }
}
