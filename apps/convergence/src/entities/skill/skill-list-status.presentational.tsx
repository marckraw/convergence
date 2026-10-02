import type { FC } from 'react'
import { EmptyState } from '@convergence/ui'
import { SKILL_LIST_COPY, type SkillListState } from './skill-list.pure'

interface SkillListStatusProps {
  /** The list's state. A list that has rows draws them, and this draws nothing. */
  state: SkillListState
}

/**
 * Why a skill list has no rows (CONV-10): it is loading, it couldn't load, the
 * agent has none, or the search matches none. One look and one set of words
 * for the Add popover, the `::skill::` picker and the Actions list: the quiet
 * EmptyState a picker takes, a spinner while loading, and an alert with the
 * store's own reason when the scan failed.
 */
export const SkillListStatus: FC<SkillListStatusProps> = ({ state }) => {
  switch (state.kind) {
    case 'loading':
      return (
        <EmptyState
          state="loading"
          variant="plain"
          size="compact"
          title={SKILL_LIST_COPY.loading}
        />
      )
    case 'failed':
      return (
        <EmptyState
          state="failed"
          variant="plain"
          size="compact"
          title={SKILL_LIST_COPY.failed}
          detail={state.message}
        />
      )
    case 'empty':
      return (
        <EmptyState
          variant="plain"
          size="compact"
          title={SKILL_LIST_COPY.empty}
        />
      )
    case 'no-match':
      return (
        <EmptyState
          variant="plain"
          size="compact"
          title={SKILL_LIST_COPY.noMatch}
        />
      )
    case 'listed':
      return null
  }
}
