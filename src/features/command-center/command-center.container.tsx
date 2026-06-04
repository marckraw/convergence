import { useCallback, useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import type { CodeReviewMode, CodeReviewView } from '@/entities/code-review'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useCommandCenterStore } from './command-center.model'
import { buildPaletteIndex } from './command-palette-index.pure'
import {
  buildCuratedSections,
  rankForQuery,
  PALETTE_FUSE_OPTIONS,
} from './command-palette-ranking.pure'
import {
  detectShortcutPlatform,
  matchKeyboardShortcut,
} from './command-palette-trigger.pure'
import {
  activateProject,
  beginSessionDraft,
  beginTerminalSessionDraft,
  beginWorkspaceDraft,
  checkForUpdates,
  forkCurrentSession,
  openCodeReview,
  openDialog,
  swapPrimarySurface,
  switchToSession,
} from './intents'
import {
  CommandCenterPalette,
  type CommandCenterView,
} from './command-center.presentational'
import type { PaletteItem } from './command-center.types'

interface CodeReviewRouteSearch {
  targetId?: string | null
  mode?: CodeReviewMode
  view?: CodeReviewView
  file?: string | null
}

interface CommandCenterContainerProps {
  onSelectCodeSession?: (sessionId: string) => void
  onSelectChatSession?: (sessionId: string) => void
  onBeginCodeSessionDraft?: (workspaceId: string) => void
  onSelectProject?: (projectId: string) => void | Promise<void>
  onOpenCodeReview?: (search?: CodeReviewRouteSearch) => void
}

export function CommandCenterContainer({
  onSelectCodeSession,
  onSelectChatSession,
  onBeginCodeSessionDraft,
  onSelectProject,
  onOpenCodeReview,
}: CommandCenterContainerProps = {}) {
  const isOpen = useCommandCenterStore((s) => s.isOpen)
  const query = useCommandCenterStore((s) => s.query)
  const open = useCommandCenterStore((s) => s.open)
  const close = useCommandCenterStore((s) => s.close)
  const toggle = useCommandCenterStore((s) => s.toggle)
  const setQuery = useCommandCenterStore((s) => s.setQuery)

  const projects = useProjectStore((s) => s.projects)
  const globalWorkspaces = useWorkspaceStore((s) => s.globalWorkspaces)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const globalChatSessions = useSessionStore((s) => s.globalChatSessions)
  const recentSessionIds = useSessionStore((s) => s.recentSessionIds)
  const dismissals = useSessionStore((s) => s.needsYouDismissals)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const commandCenterShortcut = useAppSettingsStore(
    (s) => s.settings.commandCenterShortcut,
  )

  useEffect(() => {
    const platform =
      typeof navigator === 'undefined'
        ? detectShortcutPlatform()
        : detectShortcutPlatform(navigator.platform)
    const handler = (event: KeyboardEvent) => {
      if (!matchKeyboardShortcut(event, platform, commandCenterShortcut)) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [toggle, commandCenterShortcut])

  const items = useMemo(() => {
    if (!isOpen) return []
    return buildPaletteIndex({
      projects,
      workspaces: globalWorkspaces,
      sessions: [...globalSessions, ...globalChatSessions],
      recentSessionIds,
      dismissals,
      activeSessionId,
    })
  }, [
    isOpen,
    projects,
    globalWorkspaces,
    globalSessions,
    globalChatSessions,
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

  const firstItemId = useMemo(() => firstVisibleItemId(view), [view])
  const [selectedValue, setSelectedValue] = useState('')

  useEffect(() => {
    setSelectedValue(firstItemId)
  }, [firstItemId])

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
          if (item.contextKind === 'global' && onSelectChatSession) {
            onSelectChatSession(item.sessionId)
          } else if (onSelectCodeSession) {
            onSelectCodeSession(item.sessionId)
          } else {
            void switchToSession(item.sessionId)
          }
          return
        case 'project':
          if (onSelectProject) {
            void onSelectProject(item.projectId)
          } else {
            void activateProject(item.projectId)
          }
          return
        case 'workspace':
          if (onSelectProject) {
            void onSelectProject(item.projectId)
          } else {
            void activateProject(item.projectId)
          }
          return
        case 'dialog':
          openDialog(item.dialogKind, item.dialogPayload)
          return
        case 'new-session':
          if (onBeginCodeSessionDraft) {
            onBeginCodeSessionDraft(item.workspaceId)
          } else {
            void beginSessionDraft(item.workspaceId)
          }
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
        case 'open-code-review':
          if (onOpenCodeReview) {
            onOpenCodeReview({
              mode: 'working-tree',
              targetId: null,
              file: null,
            })
          } else {
            openCodeReview()
          }
          return
      }
    },
    [
      close,
      onBeginCodeSessionDraft,
      onOpenCodeReview,
      onSelectProject,
      onSelectChatSession,
      onSelectCodeSession,
    ],
  )

  return (
    <CommandCenterPalette
      open={isOpen}
      query={query}
      view={view}
      selectedValue={selectedValue}
      onOpenChange={onOpenChange}
      onQueryChange={setQuery}
      onSelectedValueChange={setSelectedValue}
      onSelect={onSelect}
    />
  )
}

function firstVisibleItemId(view: CommandCenterView): string {
  if (view.mode === 'ranked') {
    return view.items[0]?.item.id ?? ''
  }
  for (const section of view.sections) {
    if (section.items.length > 0) return section.items[0].id
  }
  return ''
}
