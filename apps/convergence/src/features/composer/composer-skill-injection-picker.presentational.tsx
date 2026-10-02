import type { FC } from 'react'
import { Library } from 'lucide-react'
import {
  composerSkillListState,
  hasSkillSelection,
  SkillListStatus,
  SkillRow,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import { Listbox, ListboxOption } from '@convergence/ui'
import { InlinePicker } from './inline-picker.presentational'
import { inlinePickerRow } from './inline-picker.styles'

interface ComposerSkillInjectionPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: SkillCatalogEntry[]
  /** What follows `::skill::`: with none, an empty list is the agent having none. */
  query?: string
  selectedSkills: SkillSelection[]
  highlightedIndex: number
  activeProviderLabel: string | null
  isLoading: boolean
  error: string | null
  /** Null on this Mac. A sentence when the list was read for another machine. */
  notice: string | null
  onSelect: (skill: SkillCatalogEntry) => void
  onHover: (index: number) => void
}

/**
 * The provider's skills under `::skill::`: a Listbox the message field
 * drives (MAR-3616 DS3e). The field keeps the focus; its arrows move the
 * active row and Enter picks it. A disabled skill is listed, announced as
 * unavailable, and cannot be picked. The heading, the notice, the loading,
 * failed and empty lines and the hidden Close sit beside the list, never in
 * it.
 */
export const ComposerSkillInjectionPicker: FC<
  ComposerSkillInjectionPickerProps
> = ({
  open,
  listId,
  items,
  query = '',
  selectedSkills,
  highlightedIndex,
  activeProviderLabel,
  isLoading,
  error,
  notice,
  onSelect,
  onHover,
}) => {
  if (!open) return null
  // One list's words and looks for loading, failed and empty (CONV-10).
  const listState = composerSkillListState({
    error,
    isLoading,
    count: items.length,
    query,
  })

  return (
    <InlinePicker
      testId="composer-skill-injection-picker"
      heading={{
        icon: <Library />,
        title: 'Skills',
        detail: activeProviderLabel ?? 'Active provider',
      }}
      tall
    >
      {notice ? (
        <p
          className="px-3 py-1.5 text-xs text-ink-muted"
          data-testid="remote-skills-notice"
        >
          {notice}
        </p>
      ) : null}
      {listState.kind === 'listed' ? (
        <Listbox
          id={listId}
          aria-label="Skills"
          active={highlightedIndex}
          multiline
        >
          {items.map((skill, index) => (
            <ListboxOption
              key={skill.id}
              index={index}
              disabled={!skill.enabled}
              onHover={() => onHover(index)}
              onPick={() => onSelect(skill)}
              data-testid={`composer-skill-injection-item-${skill.id}`}
              // One highlight, the active row's (CONV-6): an added skill
              // says so with its check, not a second tint.
              className={inlinePickerRow}
            >
              <SkillRow
                skill={skill}
                selected={hasSkillSelection(selectedSkills, skill.id)}
                form="compact"
              />
            </ListboxOption>
          ))}
        </Listbox>
      ) : (
        <SkillListStatus state={listState} />
      )}
    </InlinePicker>
  )
}
