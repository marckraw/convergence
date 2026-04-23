import { useCallback, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { useCommandCenterStore } from './command-center.model'
import { buildPaletteIndex } from './command-palette-index.pure'
import {
  buildCuratedSections,
  rankForQuery,
  PALETTE_FUSE_OPTIONS,
} from './command-palette-ranking.pure'
import { matchPaletteShortcut } from './command-palette-trigger.pure'
import {
  activateProject,
  beginSessionDraft,
  beginTerminalSessionDraft,
  beginWorkspaceDraft,
  checkForUpdates,
  forkCurrentSession,
  openDialog,
  swapPrimarySurface,
  switchToSession,
} from './intents'
import {
  CommandCenterPalette,
  type CommandCenterView,
} from './command-center.presentational'
import type { PaletteItem } from './command-center.types'

function detectPlatform(): 'mac' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  return navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'other'
}

export function CommandCenterContainer() {
  const isOpen = useCommandCenterStore((s) => s.isOpen)
  const query = useCommandCenterStore((s) => s.query)
  const open = useCommandCenterStore((s) => s.open)
  const close = useCommandCenterStore((s) => s.close)
  const toggle = useCommandCenterStore((s) => s.toggle)
  const setQuery = useCommandCenterStore((s) => s.setQuery)

  const projects = useProjectStore((s) => s.projects)
  const globalWorkspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const recentSessionIds = useSessionStore((s) => s.recentSessionIds)
  const dismissals = useSessionStore((s) => s.needsYouDismissals)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  useEffect(() => {
    const platform = detectPlatform()
    const handler = (event: KeyboardEvent) => {
      if (!matchPaletteShortcut(event, platform)) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [toggle])

  const items = useMemo(() => {
    if (!isOpen) return []
    return buildPaletteIndex({
      projects,
      workspaces: globalWorkspaces,
      sessions: globalSessions,
      recentSessionIds,
      dismissals,
      activeSessionId,
    })
  }, [
    isOpen,
    projects,
    globalWorkspaces,
    globalSessions,
    recentSessionIds,
    dismissals,
    activeSessionId,
  ])

  const fuse = useMemo(() => {
    if (!isOpen) return null
    return new Fuse(items, PALETTE_FUSE_OPTIONS)
  }, [isOpen, items])

  const view: CommandCenterView = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      return {
        mode: 'sections',
        sections: buildCuratedSections(items, dismissals, recentSessionIds),
      }
    }
    return {
      mode: 'ranked',
      items: fuse ? rankForQuery(items, trimmed, fuse) : [],
    }
  }, [query, items, dismissals, recentSessionIds, fuse])

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) open()
      else close()
    },
    [open, close],
  )

  const onSelect = useCallback(
    (item: PaletteItem) => {
      close()
      switch (item.kind) {
        case 'session':
          void switchToSession(item.sessionId)
          return
        case 'project':
          void activateProject(item.projectId)
          return
        case 'workspace':
          void activateProject(item.projectId)
          return
        case 'dialog':
          openDialog(item.dialogKind)
          return
        case 'new-session':
          void beginSessionDraft(item.workspaceId)
          return
        case 'new-terminal-session':
          void beginTerminalSessionDraft(item.workspaceId)
          return
        case 'new-workspace':
          void beginWorkspaceDraft(item.projectId)
          return
        case 'fork-session':
          forkCurrentSession(item.sessionId)
          return
        case 'swap-primary-surface':
          void swapPrimarySurface(item.sessionId, item.target)
          return
        case 'check-updates':
          void checkForUpdates()
          return
      }
    },
    [close],
  )

  return (
    <CommandCenterPalette
      open={isOpen}
      query={query}
      view={view}
      onOpenChange={onOpenChange}
      onQueryChange={setQuery}
      onSelect={onSelect}
    />
  )
}
