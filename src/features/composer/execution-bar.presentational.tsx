import type { FC } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'
import { ComposerSelect } from './composer-select.presentational'
import type { ExecutionBarView } from './execution-bar.pure'
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
  disabled: boolean
  onChange: (hostId: string) => void
}

/**
 * The tier beneath the composer's option row that names the machine
 * (MAR-2642).
 *
 * A chooser while a session is being born, a statement of fact once it is
 * live — the daemon owns a running session and the machine cannot change under
 * it, so offering a choice there would be a control that lies about what it
 * does.
 *
 * The row is a wrapping flex with a gap and exactly one element in it. The
 * Project picker joins it later; nothing stands empty waiting for it.
 */
export const ExecutionBar: FC<ExecutionBarProps> = ({
  view,
  disabled,
  onChange,
}) => {
  if (view.mode === 'hidden') return null

  return (
    <div className={stripClass}>
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
              description: choice.blockedReason ?? undefined,
              disabled: Boolean(choice.blockedReason),
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
    </div>
  )
}
