import type { FC } from 'react'
import { AlertTriangle, Check, Library } from 'lucide-react'
import {
  hasSkillSelection,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import { Badge, Listbox, ListboxOption } from '@convergence/ui'
import { InlinePicker, InlinePickerState } from './inline-picker.presentational'
import {
  inlinePickerRow,
  inlinePickerRowDetail,
  inlinePickerRowLine,
} from './inline-picker.styles'

interface ComposerSkillInjectionPickerProps {
  open: boolean
  /** The list's id: the message field names it (aria-controls) and its active row. */
  listId: string
  items: SkillCatalogEntry[]
  selectedSkills: SkillSelection[]
  highlightedIndex: number
  activeProviderLabel: string | null
  isLoading: boolean
  error: string | null
  /** Null on this Mac. A sentence when the list was read for another machine. */
  notice: string | null
  onSelect: (skill: SkillCatalogEntry) => void
  onHover: (index: number) => void
  onDismiss: () => void
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
  selectedSkills,
  highlightedIndex,
  activeProviderLabel,
  isLoading,
  error,
  notice,
  onSelect,
  onHover,
  onDismiss,
}) => {
  if (!open) return null

  return (
    <InlinePicker
      testId="composer-skill-injection-picker"
      heading={{
        icon: <Library />,
        title: 'Skills',
        detail: activeProviderLabel ?? 'Active provider',
      }}
      closeLabel="Close skill injection picker"
      onDismiss={onDismiss}
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
      {error ? (
        <InlinePickerState
          state="failed"
          title="Couldn't load skills"
          detail={error}
        />
      ) : isLoading ? (
        <InlinePickerState state="loading" title="Loading skills…" />
      ) : items.length === 0 ? (
        <InlinePickerState state="empty" title="No matching skills" />
      ) : (
        <Listbox
          id={listId}
          aria-label="Skills"
          active={highlightedIndex}
          multiline
        >
          {items.map((skill, index) => {
            const selected = hasSkillSelection(selectedSkills, skill.id)
            const warningCount = skill.warnings.length
            return (
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
                <span className={inlinePickerRowLine}>
                  <span className="truncate font-medium">
                    {skill.displayName}
                  </span>
                  {selected ? (
                    <>
                      <Check aria-hidden className="size-3.5 shrink-0" />
                      <span className="sr-only">(added)</span>
                    </>
                  ) : null}
                  {warningCount > 0 ? (
                    <AlertTriangle
                      aria-hidden
                      className="size-3.5 shrink-0 text-warning-ink"
                    />
                  ) : null}
                  {!skill.enabled ? (
                    <Badge className="ml-auto uppercase">Disabled</Badge>
                  ) : null}
                </span>
                <span className={inlinePickerRowDetail}>
                  {skill.shortDescription ||
                    skill.description ||
                    'No description.'}
                </span>
              </ListboxOption>
            )
          })}
        </Listbox>
      )}
    </InlinePicker>
  )
}
