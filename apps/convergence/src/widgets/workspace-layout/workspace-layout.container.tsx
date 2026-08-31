import { useCallback, useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { useSessionStore } from '@/entities/session'
import { useTerminalStore } from '@/entities/terminal'
import { SessionView } from '@/widgets/session-view'
import { TerminalDock } from '@/widgets/terminal-dock'
import { ConversationDockPlaceholder } from './conversation-dock-placeholder.presentational'
import { WorkspaceLayoutView } from './workspace-layout.presentational'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export const WorkspaceLayoutContainer: FC = () => {
  const primarySurface = useSessionStore((s) => {
    if (!s.activeSessionId) return 'conversation' as const
    const session = s.sessions.find((entry) => entry.id === s.activeSessionId)
    return session?.primarySurface ?? 'conversation'
  })
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const dockPlacement = useTerminalStore((s) =>
    activeSessionId
      ? (s.dockPlacementBySessionId[activeSessionId] ?? 'bottom')
      : 'bottom',
  )

  // The conversation dock is an opt-in companion to terminal-primary
  // sessions. Default hidden per spec; Cmd+J reveals/collapses it.
  const [conversationDockVisible, setConversationDockVisible] = useState(false)

  const toggleConversationDock = useCallback(() => {
    setConversationDockVisible((current) => !current)
  }, [])

  useEffect(() => {
    if (primarySurface !== 'terminal') return
    const handler = (event: KeyboardEvent) => {
      const isToggle =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'j'
      if (!isToggle) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      toggleConversationDock()
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
    }
  }, [primarySurface, toggleConversationDock])

  let mainSlot: ReactNode
  let dockSlot: ReactNode | null

  if (primarySurface === 'terminal') {
    mainSlot = <TerminalDock mode="main" />
    dockSlot = <ConversationDockPlaceholder />
  } else {
    mainSlot = <SessionView />
    dockSlot = <TerminalDock />
  }

  // Placement only applies to the secondary terminal dock in conversation-
  // primary sessions. Terminal-primary sessions render the conversation
  // placeholder dock at the bottom regardless.
  const effectivePlacement =
    primarySurface === 'terminal' ? 'bottom' : dockPlacement

  return (
    <WorkspaceLayoutView
      mainSlot={mainSlot}
      dockSlot={dockSlot}
      dockVisible={
        primarySurface === 'terminal' ? conversationDockVisible : true
      }
      dockPlacement={effectivePlacement}
    />
  )
}
