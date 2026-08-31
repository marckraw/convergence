import type { FC } from 'react'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'
import { Input } from '@/shared/ui/input'
import { ComposerSelect } from './composer-select.presentational'
import {
  stripFactClass,
  stripInputClass,
  stripLabelClass,
  stripNoticeClass,
  stripSelectClass,
} from './execution-bar.styles'
import type { WorkAddressSlotView } from './work-address-slot.pure'

interface WorkAddressSlotProps {
  view: WorkAddressSlotView
  disabled: boolean
  onChange: (choiceId: string) => void
  onBranchChange: (branch: string) => void
}

/** What the slot shows while nothing has been preselected and nothing picked. */
const UNCHOSEN_PLACE_LABEL = 'Choose a place'

/** What the branch field says when nothing has been written in it. */
const BRANCH_FIELD_PLACEHOLDER = 'branch'

/**
 * The strip's second slot: where the session works on the machine named beside
 * it (MAR-2689), and on which branch (MAR-2694).
 *
 * The element MAR-2619 ruling 6 reserved — *"the Project picker joins it
 * later"* — now standing in it. A chooser while a session is being born, a
 * statement of fact once it is live, and a sentence when the machine has not
 * answered yet: the same three readings the tier beside it has, because they
 * are two halves of one claim about where a turn is going.
 *
 * The branch is written, never chosen, so it is a text field and not a second
 * select: a dispatch may come from Linear, from Jira, or from nothing, and the
 * only source true in all three is what the human types. The field appears for
 * Repository mode alone — a residency runs on its checkout's own HEAD — and
 * whether it appears at all is decided upstream in `resolveWorkAddressSlot`,
 * so this component has no mode branch of its own to get wrong.
 *
 * It renders nothing at all on Local, decided upstream for the same reason, so
 * a Local composer is byte-identical by construction.
 */
export const WorkAddressSlot: FC<WorkAddressSlotProps> = ({
  view,
  disabled,
  onChange,
  onBranchChange,
}) => {
  if (view.mode === 'hidden') return null

  if (view.mode === 'asking' || view.mode === 'unavailable') {
    return (
      <span className={stripNoticeClass} data-testid="work-address-notice">
        {view.text}
      </span>
    )
  }

  if (view.mode === 'settled') {
    return (
      <>
        <span className={stripLabelClass}>Works in</span>
        <span className={stripFactClass} data-testid="work-address-fact">
          {view.label}
        </span>
        {/*
          The branch that was asked for and not granted, said beside the one
          that exists rather than instead of it (MAR-2694). Reconciling the two
          silently would make the strip claim a branch nobody cut.
        */}
        {view.requestedBranch ? (
          <span
            className={stripNoticeClass}
            data-testid="work-address-requested-branch"
          >
            {`requested ${view.requestedBranch}`}
          </span>
        ) : null}
      </>
    )
  }

  const selected = view.choices.find((choice) => choice.id === view.selectedId)
  return (
    <>
      <span className={stripLabelClass}>Works in</span>
      <ComposerSelect
        selectedId={view.selectedId ?? ''}
        value={selected?.label ?? UNCHOSEN_PLACE_LABEL}
        items={view.choices.map(
          (choice): SearchableSelectItem => ({
            id: choice.id,
            label: choice.label,
          }),
        )}
        onChange={onChange}
        disabled={disabled}
        className={stripSelectClass}
      />
      {view.branch ? (
        <>
          <Input
            type="text"
            value={view.branch.value}
            onChange={(event) => onBranchChange(event.target.value)}
            disabled={disabled}
            placeholder={BRANCH_FIELD_PLACEHOLDER}
            aria-label="Branch the daemon should work on"
            className={stripInputClass}
            data-testid="work-address-branch-input"
          />
          <span
            className={stripNoticeClass}
            data-testid="work-address-branch-statement"
          >
            {view.branch.statement}
          </span>
        </>
      ) : null}
      {view.notice ? (
        <span className={stripNoticeClass} data-testid="work-address-notice">
          {view.notice}
        </span>
      ) : null}
    </>
  )
}
