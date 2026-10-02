import { useId, type FC } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  Listbox,
  ListboxGroup,
  ListboxOption,
  listboxOptionId,
  listboxStep,
  SearchField,
} from '@convergence/ui'
import type {
  CuratedSection,
  PaletteItem,
  RankedItem,
} from './command-center.types'

export type CommandCenterView =
  | { mode: 'sections'; sections: CuratedSection[] }
  | { mode: 'ranked'; items: RankedItem[] }

interface CommandCenterPaletteProps {
  open: boolean
  query: string
  view: CommandCenterView
  selectedValue?: string
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onSelectedValueChange?: (value: string) => void
  onSelect: (item: PaletteItem) => void
}

/** The rows in the order they are shown: the ranked list, or every section's in turn. */
function visibleRows(view: CommandCenterView): PaletteItem[] {
  if (view.mode === 'ranked') return view.items.map(({ item }) => item)
  return view.sections.flatMap((section) => section.items)
}

/**
 * ⌘K (MAR-3616 DS3e): a Dialog holding a SearchField and the Listbox it
 * drives. The field keeps the focus; the arrows (and Home, End, Control-N
 * and -P) move the active row, which the container keeps (`selectedValue`),
 * Enter picks it, and Escape closes the palette. With nothing typed the rows
 * sit under their sections' headings (ListboxGroup); with a query, one
 * ranked list. With nothing to show, an EmptyState says what to try.
 */
export const CommandCenterPalette: FC<CommandCenterPaletteProps> = ({
  open,
  query,
  view,
  selectedValue,
  onOpenChange,
  onQueryChange,
  onSelectedValueChange,
  onSelect,
}) => {
  const listId = useId()
  const rows = visibleRows(view)
  const selectedIndex = rows.findIndex((item) => item.id === selectedValue)
  const active = rows.length === 0 ? null : Math.max(selectedIndex, 0)
  const hasRows = rows.length > 0

  const renderRow = (item: PaletteItem, index: number) => {
    const { primary, secondary } = describeItem(item)
    const kindLabel = describeKind(item.kind)
    const accessibleLabel = secondary
      ? `${kindLabel}: ${primary} — ${secondary}`
      : `${kindLabel}: ${primary}`
    return (
      <ListboxOption
        key={item.id}
        index={index}
        aria-label={accessibleLabel}
        onPick={() => onSelect(item)}
        onHover={() => onSelectedValueChange?.(item.id)}
        className="justify-between gap-3 px-3 py-2"
      >
        <span className="truncate">{primary}</span>
        {secondary ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </ListboxOption>
    )
  }

  const renderRows = () => {
    if (view.mode === 'ranked') return rows.map(renderRow)
    let index = 0
    return view.sections
      .filter((section) => section.items.length > 0)
      .map((section) => (
        <ListboxGroup key={section.id} label={section.title} className="mb-1">
          {section.items.map((item) => renderRow(item, index++))}
        </ListboxGroup>
      ))
  }

  return (
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      <DialogContent>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to projects, workspaces, sessions, or dialogs.
        </DialogDescription>
        <div className="border-b border-line-soft px-4 py-3">
          <SearchField
            role="combobox"
            aria-label="Command palette"
            aria-autocomplete="list"
            aria-expanded={hasRows}
            aria-controls={hasRows ? listId : undefined}
            aria-activedescendant={
              active === null ? undefined : listboxOptionId(listId, active)
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              // cmdk's steps: they stop at the ends rather than wrapping.
              const next = listboxStep(active, rows.length, event, {
                loop: false,
              })
              if (next !== undefined) {
                onSelectedValueChange?.(rows[next].id)
              } else if (event.key === 'Enter' && active !== null) {
                onSelect(rows[active])
              } else {
                return
              }
              event.preventDefault()
            }}
            placeholder="Search projects, workspaces, sessions, dialogs…"
          />
        </div>
        {hasRows ? (
          <Listbox
            // A new query starts the list from its top.
            key={`${view.mode}:${query}`}
            id={listId}
            aria-label="Results"
            active={active}
            className="max-h-136 min-h-0 overflow-y-auto px-2 py-2"
          >
            {renderRows()}
          </Listbox>
        ) : (
          <EmptyState
            variant="plain"
            detail={
              view.mode === 'ranked'
                ? 'No results. Try a session name, branch, or project.'
                : 'No recents yet. Start a session to see it here.'
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function describeItem(item: PaletteItem): {
  primary: string
  secondary: string | null
} {
  switch (item.kind) {
    case 'project':
      return { primary: item.projectName, secondary: item.repositoryPath }
    case 'workspace':
      return {
        primary: `${item.projectName} / ${item.branchName}`,
        secondary: item.path,
      }
    case 'session':
      return {
        primary: item.sessionName,
        secondary: item.branchName
          ? `${item.projectName} · ${item.branchName}`
          : item.projectName,
      }
    case 'dialog':
      return { primary: item.title, secondary: item.description }
    case 'new-session':
      return { primary: item.title, secondary: item.projectName }
    case 'new-terminal-session':
      return { primary: item.title, secondary: item.projectName }
    case 'new-workspace':
      return { primary: item.title, secondary: item.projectName }
    case 'fork-session':
      return { primary: item.title, secondary: item.projectName || null }
    case 'swap-primary-surface':
      return { primary: item.title, secondary: item.projectName || null }
    case 'check-updates':
      return { primary: item.title, secondary: item.description }
  }
}

function describeKind(kind: PaletteItem['kind']): string {
  switch (kind) {
    case 'project':
      return 'Project'
    case 'workspace':
      return 'Workspace'
    case 'session':
      return 'Session'
    case 'dialog':
      return 'Dialog'
    case 'new-session':
      return 'New session'
    case 'new-terminal-session':
      return 'New terminal'
    case 'new-workspace':
      return 'New workspace'
    case 'fork-session':
      return 'Fork session'
    case 'swap-primary-surface':
      return 'Swap primary surface'
    case 'check-updates':
      return 'Updates'
  }
}
