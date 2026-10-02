import { useMemo, type FC, type ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@convergence/ui'
import { composerToolbarControl } from './composer.styles'

/** One of a few fixed choices in the composer's toolbar. */
export interface ComposerSelectItem {
  id: string
  /** Its words. */
  label: string
  /** How the choice reads, if more than its words: a provider's mark and ALPHA. */
  choice?: ReactNode
  /** The line under it: what it means, or why it can't be chosen. */
  description?: string
  /** Listed and not choosable: a provider this machine won't run. */
  disabled?: boolean
}

interface ComposerSelectProps {
  /** What it picks, as its name: "Provider", "Reasoning effort" (CONV N2). */
  label: string
  /** The chosen id; empty or null shows the placeholder. */
  selectedId: string | null
  items: readonly ComposerSelectItem[]
  /** Said while nothing is chosen: "Select provider". */
  placeholder: string
  /**
   * What the trigger says when the chosen id is not one of the items: a
   * stranded session's provider, "claude-code (unavailable)" (MAR-2550).
   */
  fallback?: string
  onChange: (id: string) => void
  disabled?: boolean
}

/**
 * One of a few fixed choices in the composer's toolbar, the provider and the
 * effort: a Select (R9, ruling 12), as the fork's are, in the toolbar's look
 * (a ghost trigger at the row's one size, `sm`, in muted ink). Each choice
 * keeps the line under it, and one this machine won't run is listed and
 * disabled with its reason, never dropped (MAR-2682). With nothing to choose
 * it is disabled.
 */
export const ComposerSelect: FC<ComposerSelectProps> = ({
  label,
  selectedId,
  items,
  placeholder,
  fallback,
  onChange,
  disabled = false,
}) => {
  const chosen = selectedId || null
  const chosenItem = items.find((item) => item.id === chosen)
  // The words the trigger may show for each value: each choice's, and the
  // fallback's for a chosen id no longer listed. Base UI copies `items` into
  // its store after every render, and a new array each keystroke would draw
  // the trigger twice (the composer's render budget, MAR-3325), so the array
  // is kept while the words are the same.
  const wordsKey = JSON.stringify([
    ...items.map((item) => ({ value: item.id, label: item.label })),
    ...(chosen !== null && fallback !== undefined && chosenItem === undefined
      ? [{ value: chosen, label: fallback }]
      : []),
  ])
  const words = useMemo(
    () => JSON.parse(wordsKey) as Array<{ value: string; label: string }>,
    [wordsKey],
  )
  return (
    <Select
      items={words}
      value={chosen}
      onValueChange={(id: string) => onChange(id)}
      disabled={disabled || items.length === 0}
    >
      <SelectTrigger
        variant="ghost"
        size="sm"
        aria-label={label}
        className={composerToolbarControl}
      >
        {/* The chosen choice as it reads (a provider's mark), else its words. */}
        <SelectValue placeholder={placeholder}>
          {chosenItem?.choice}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.id}
            value={item.id}
            description={item.description}
            disabled={item.disabled}
          >
            {item.choice ?? item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
