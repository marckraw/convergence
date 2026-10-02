import { useId, type FC } from 'react'
import {
  Button,
  Input,
  Listbox,
  ListboxOption,
  listboxOptionId,
  FormError,
} from '@convergence/ui'
import {
  SKILLS_EMPTY_LABEL,
  SKILLS_LOADING_LABEL,
  skillsFailedLabel,
} from './conversation-actions-menu.pure'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

/**
 * The Skills list (frames 03 and 08), with loading and failure told apart.
 *
 * The search drives the list (MAR-3616 DS3e): it keeps the focus, Up and
 * Down move the active row (aria-activedescendant) and Enter adds it; a click
 * adds a row too. A skill that is not offered is listed with its reason,
 * announced as unavailable, and adds nothing.
 */
export const ConversationActionsSkills: FC<ConversationActionsViewProps> = ({
  skills,
  activeSkill,
  searchRef,
  onQueryChange,
  onSkill,
  onSkillHover,
  onOpenGroup,
}) => {
  const listId = useId()
  const { state } = skills
  const hasRows = skills.rows.length > 0
  return (
    <>
      {skills.notice ? (
        <p className={styles.notice} data-testid="remote-skills-notice">
          {skills.notice}
        </p>
      ) : null}
      {state.kind === 'listed' ? (
        <>
          <Input
            size="md"
            ref={searchRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasRows}
            aria-controls={hasRows ? listId : undefined}
            aria-activedescendant={
              hasRows && activeSkill !== null
                ? listboxOptionId(listId, activeSkill)
                : undefined
            }
            data-actions-item=""
            aria-label="Find a skill"
            placeholder="Find a skill…"
            className={styles.search}
            value={skills.query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {hasRows ? (
            <Listbox
              id={listId}
              aria-label="Skills"
              active={activeSkill}
              multiline
              className={styles.list}
            >
              {skills.rows.map((row, index) => (
                <ListboxOption
                  key={row.id}
                  index={index}
                  aria-label={row.label}
                  disabled={!row.offered}
                  onPick={() => onSkill(row.id)}
                  onHover={() => onSkillHover(index)}
                  className={styles.option}
                >
                  <span>{row.label}</span>
                  {row.reason ? (
                    <span className={styles.optionReason}>{row.reason}</span>
                  ) : null}
                </ListboxOption>
              ))}
            </Listbox>
          ) : null}
          <p className={styles.hint}>Add a skill chip · nothing sends yet</p>
        </>
      ) : null}
      {state.kind === 'loading' ? (
        <p className={styles.status} role="status">
          {SKILLS_LOADING_LABEL}
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        // A failure reads as one (CONV-7): the danger ink, as in the Add popover.
        <FormError className="px-2 py-1.5">
          {skillsFailedLabel(state.message)}
        </FormError>
      ) : null}
      {state.kind === 'empty' ? (
        <>
          <p className={styles.emptyTitle}>{SKILLS_EMPTY_LABEL}</p>
          <p className={styles.reason}>Routines are still available below.</p>
          <Button
            size="lg"
            type="button"
            variant="ghost"
            data-actions-item=""
            className={styles.item}
            onClick={() => onOpenGroup('routines')}
          >
            Routines →
          </Button>
        </>
      ) : null}
      <p className={styles.hint}>Esc closes</p>
    </>
  )
}
