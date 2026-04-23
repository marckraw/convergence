import type { FC } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog'
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
  onOpenChange: (open: boolean) => void
  onQueryChange: (query: string) => void
  onSelect: (item: PaletteItem) => void
}

export const CommandCenterPalette: FC<CommandCenterPaletteProps> = ({
  open,
  query,
  view,
  onOpenChange,
  onQueryChange,
  onSelect,
}) => {
  const renderRow = (item: PaletteItem) => {
    const { primary, secondary } = describeItem(item)
    const kindLabel = describeKind(item.kind)
    const accessibleLabel = secondary
      ? `${kindLabel}: ${primary} — ${secondary}`
      : `${kindLabel}: ${primary}`
    return (
      <CommandItem
        key={item.id}
        value={item.id}
        aria-label={accessibleLabel}
        onSelect={() => onSelect(item)}
        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-white/10"
      >
        <span className="truncate">{primary}</span>
        {secondary ? (
          <span className="truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </CommandItem>
    )
  }

  const renderBody = () => {
    if (view.mode === 'ranked') {
      if (view.items.length === 0) {
        return (
          <CommandEmpty>
            No results. Try a session name, branch, or project.
          </CommandEmpty>
        )
      }
      return <>{view.items.map(({ item }) => renderRow(item))}</>
    }

    const nonEmpty = view.sections.filter((section) => section.items.length > 0)
    if (nonEmpty.length === 0) {
      return (
        <CommandEmpty>
          No recents yet. Start a session to see it here.
        </CommandEmpty>
      )
    }
    return (
      <>
        {nonEmpty.map((section) => (
          <CommandGroup
            key={section.id}
            heading={section.title}
            className="mb-1"
          >
            {section.items.map(renderRow)}
          </CommandGroup>
        ))}
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to projects, workspaces, sessions, or dialogs.
        </DialogDescription>
        <Command
          shouldFilter={false}
          label="Command palette"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <CommandInput
              value={query}
              onValueChange={onQueryChange}
              placeholder="Search projects, workspaces, sessions, dialogs…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-[60vh] overflow-y-auto px-2 py-2">
            {renderBody()}
          </CommandList>
        </Command>
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
