import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'
import { ComposerSelect } from './composer-select.presentational'
import type { ExecutionBarView } from './execution-bar.pure'
import { WorkAddressSlot } from './work-address-slot.presentational'
import type { WorkAddressSlotView } from './work-address-slot.pure'
import {
  stripClass,
  stripFactClass,
  stripLabelClass,
  stripSelectClass,
  stripWarningClass,
  stripWarningIconClass,
} from './execution-bar.styles'

interface ExecutionBarProps {
  view: ExecutionBarView
  /** Where on that machine the session works. Renders nothing on Local. */
  workAddress: WorkAddressSlotView
  disabled: boolean
  onChange: (hostId: string) => void
  onWorkAddressChange: (choiceId: string) => void
  /** What he typed into the branch field, verbatim (MAR-2694). */
  onWorkAddressBranchChange: (branch: string) => void
}

/**
 * The layer beneath the composer that names the machine (MAR-2642).
 *
 * A chooser while a session is being born, a statement of fact once it is
 * live — the daemon owns a running session and the machine cannot change under
 * it, so offering a choice there would be a control that lies about what it
 * does.
 *
 * Rendered as a *sibling* of the composer card, never a child of it: the depth
 * is structural, not decorative. A recessed plate, inset so the card's corners
 * overhang it and tucked up behind it so only its lower band shows. Nest this
 * back inside the card and it collapses into a divided row again — the canary
 * in `composer.container.test.tsx` goes red when it does.
 *
 * The strip is a wrapping flex with a gap. It held exactly one element until
 * the Project picker MAR-2619 reserved a place for arrived beside it
 * (MAR-2689); the second slot renders nothing on Local, so the strip is still
 * one element there and nothing stands empty.
 */
export const ExecutionBar: FC<ExecutionBarProps> = ({
  view,
  workAddress,
  disabled,
  onChange,
  onWorkAddressChange,
  onWorkAddressBranchChange,
}) => {
  if (view.mode === 'hidden') return null

  return (
    <div className={stripClass} data-testid="execution-bar">
      <span className={stripLabelClass}>Runs on</span>
      {view.mode === 'choosing' ? (
        <ComposerSelect
          selectedId={view.hostId}
          value={
            view.choices.find((choice) => choice.id === view.hostId)?.label ??
            'Local'
          }
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
      ) : (
        <>
          <span className={stripFactClass}>{view.label}</span>
          {view.warning ? (
            <span className={stripWarningClass}>
              <AlertTriangle className={stripWarningIconClass} />
              {view.warning}
            </span>
          ) : null}
        </>
      )}
      <WorkAddressSlot
        view={workAddress}
        disabled={disabled}
        onChange={onWorkAddressChange}
        onBranchChange={onWorkAddressBranchChange}
      />
    </div>
  )
}
