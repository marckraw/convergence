import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { ConversationActionItem } from './conversation-action-item.presentational'
import {
  SKILLS_EMPTY_LABEL,
  SKILLS_LOADING_LABEL,
  skillsFailedLabel,
} from './conversation-actions-menu.pure'
import { conversationActionsStyles as styles } from './conversation-actions.styles'
import type { ConversationActionsViewProps } from './conversation-actions.types'

/** The Skills list (frames 03 and 08), with loading and failure told apart. */
export const ConversationActionsSkills: FC<ConversationActionsViewProps> = ({
  skills,
  searchRef,
  onQueryChange,
  onSkill,
  onOpenGroup,
}) => {
  const { state } = skills
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
            ref={searchRef}
            type="text"
            data-actions-item=""
            aria-label="Find a skill"
            placeholder="Find a skill…"
            className={styles.search}
            value={skills.query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <div className={styles.list}>
            {skills.rows.map((row) => (
              <ConversationActionItem
                key={row.id}
                row={row}
                onActivate={onSkill}
              />
            ))}
          </div>
          <p className={styles.hint}>Add a skill chip · nothing sends yet</p>
        </>
      ) : null}
      {state.kind === 'loading' ? (
        <p className={styles.status} role="status">
          {SKILLS_LOADING_LABEL}
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        <p className={styles.status} role="alert">
          {skillsFailedLabel(state.message)}
        </p>
      ) : null}
      {state.kind === 'empty' ? (
        <>
          <p className={styles.emptyTitle}>{SKILLS_EMPTY_LABEL}</p>
          <p className={styles.reason}>Routines are still available below.</p>
          <Button
            type="button"
            variant="ghost"
            role="menuitem"
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
