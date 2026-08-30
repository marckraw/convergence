import type { FC } from 'react'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'
import { ComposerSelect } from './composer-select.presentational'
import {
  stripFactClass,
  stripLabelClass,
  stripNoticeClass,
  stripSelectClass,
} from './execution-bar.styles'
import type { WorkAddressSlotView } from './work-address-slot.pure'

interface WorkAddressSlotProps {
  view: WorkAddressSlotView
  disabled: boolean
  onChange: (choiceId: string) => void
}

/** What the slot shows while nothing has been preselected and nothing picked. */
const UNCHOSEN_PLACE_LABEL = 'Choose a place'

/**
 * The strip's second slot: where the session works on the machine named beside
 * it (MAR-2689).
 *
 * The element MAR-2619 ruling 6 reserved — *"the Project picker joins it
 * later"* — now standing in it. A chooser while a session is being born, a
 * statement of fact once it is live, and a sentence when the machine has not
 * answered yet: the same three readings the tier beside it has, because they
 * are two halves of one claim about where a turn is going.
 *
 * It renders nothing at all on Local. That is decided upstream, in
 * `resolveWorkAddressSlot`, so this component has no local-versus-remote
 * branch to get wrong and a Local composer is byte-identical by construction.
 */
export const WorkAddressSlot: FC<WorkAddressSlotProps> = ({
  view,
  disabled,
  onChange,
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
      {view.notice ? (
        <span className={stripNoticeClass} data-testid="work-address-notice">
          {view.notice}
        </span>
      ) : null}
    </>
  )
}
