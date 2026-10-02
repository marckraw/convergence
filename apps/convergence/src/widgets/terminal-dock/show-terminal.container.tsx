import type { FC } from 'react'
import { runningShortcutPlatform } from '@/shared/lib/keyboard-shortcut.pure'
import { useSessionStore } from '@/entities/session'
import {
  collectAllPtyIds,
  terminalShortcutLabels,
  useTerminalStore,
} from '@/entities/terminal'
import { ShowDockButton } from './show-dock-button.presentational'

/** The key ⌘` is on this platform, in words, for the tooltip (NAV-23). */
const TOGGLE_DOCK_SHORTCUT = terminalShortcutLabels(runningShortcutPlatform())[
  'toggle-dock'
]

/**
 * Show terminal, for the window's status bar: drawn only while the active
 * conversation has a terminal dock that is hidden and still holds its
 * terminals, and never when the terminal is the main view, where there is no
 * dock to hide and ⌘` does nothing. The shell hands it to the status bar only
 * while the workspace (and so the dock) is what the window shows.
 *
 * A press runs what ⌘` runs in a conversation's dock, `toggleDockVisible`
 * for the session: the dock comes back where it was, with every terminal as
 * it was left.
 */
export const ShowTerminalContainer: FC = () => {
  const sessionId = useSessionStore((s) => s.activeSessionId)
  // The dock's own reading of the session: the main view decides `mode`.
  const terminalIsMain = useSessionStore((s) => {
    const session = s.sessions.find((entry) => entry.id === s.activeSessionId)
    return session ? session.primarySurface === 'terminal' : null
  })
  const tree = useTerminalStore((s) =>
    sessionId ? (s.treesBySessionId[sessionId] ?? null) : null,
  )
  const dockVisible = useTerminalStore((s) =>
    sessionId ? (s.dockVisibleBySessionId[sessionId] ?? true) : true,
  )
  const toggleDockVisible = useTerminalStore((s) => s.toggleDockVisible)

  if (!sessionId || terminalIsMain !== false || !tree || dockVisible) {
    return null
  }
  return (
    <ShowDockButton
      terminals={collectAllPtyIds(tree).length}
      shortcut={TOGGLE_DOCK_SHORTCUT}
      onShow={() => toggleDockVisible(sessionId)}
    />
  )
}
