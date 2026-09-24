import type { SkillSelection } from '@/entities/skill'

/**
 * Something a surface outside the composer asks the composer to do (MAR-3393).
 *
 * Two kinds, both of them things only the composer can do because it owns the
 * state: its skill chips are local `useState`, and its account picker's open
 * state lives inside it. Neither kind sends anything.
 */
export type ComposerIntent =
  | { id: number; kind: 'add-skill'; skill: SkillSelection }
  | { id: number; kind: 'open-account-picker' }

export type ComposerIntentDraft =
  | { kind: 'add-skill'; skill: SkillSelection }
  | { kind: 'open-account-picker' }
