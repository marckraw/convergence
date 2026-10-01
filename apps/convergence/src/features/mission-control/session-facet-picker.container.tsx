import { useMemo } from 'react'
import type { FC } from 'react'
import { Button, cn, Combobox } from '@convergence/ui'
import {
  filterFacetOptions,
  formatFacetSummary,
} from './session-card-facets.pure'
import type { SessionCardFacetOption } from './session-card-facets.pure'
import { FILTER_CHIP_OFF, FILTER_CHIP_ON } from './session-filter.styles'

interface SessionFacetPickerProps {
  label: string
  allLabel: string
  noun: string
  searchPlaceholder: string
  options: readonly SessionCardFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
  onClear: () => void
}

/**
 * A multi-select picker for one filter dimension. Selecting nothing means
 * everything, so the trigger reads "All projects" until Marcin narrows it.
 *
 * Search and scroll are not decoration: the project list is as long as the
 * number of repositories he works in, and a menu that runs off the screen is
 * not a control. Picking keeps the list open, so several projects can be
 * chosen in one pass (Combobox `multiple`).
 */
export const SessionFacetPicker: FC<SessionFacetPickerProps> = ({
  label,
  allLabel,
  noun,
  searchPlaceholder,
  options,
  selected,
  onToggle,
  onClear,
}) => {
  const summary = formatFacetSummary(selected, options, allLabel, noun)
  const byId = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  )

  return (
    <Combobox
      multiple
      selectedIds={selected}
      value={summary}
      ariaLabel={label}
      items={options.map((option) => ({
        id: option.id,
        label: option.label,
        trailing: option.count,
      }))}
      // The facets' own rule: every word of the search, anywhere in the name.
      filter={(item, query) => {
        const option = byId.get(item.id)
        return (
          option !== undefined && filterFacetOptions([option], query).length > 0
        )
      }}
      onChange={(ids) => {
        const toggled =
          ids.find((id) => !selected.includes(id)) ??
          selected.find((id) => !ids.includes(id))
        if (toggled !== undefined) onToggle(toggled)
      }}
      disabled={options.length === 0}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={(query) => `Nothing matches “${query}”`}
      variant="ghost"
      size="sm"
      className={cn(
        'max-w-56 rounded-full border px-2.5 text-2xs font-normal',
        selected.length > 0 ? FILTER_CHIP_ON : FILTER_CHIP_OFF,
      )}
      contentClassName="w-64"
      footer={
        selected.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onClear()}
            size="sm"
            className="w-full justify-start font-normal"
          >
            {allLabel}
          </Button>
        ) : undefined
      }
    />
  )
}
