import { useState, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { ChatSurface } from '@/widgets/chat-surface'
import { GlobalStatusBar } from '@/widgets/global-status-bar'
import { WorkspaceLayout } from '@/widgets/workspace-layout'
import { NotificationsOnboardingContainer } from '@/features/notifications-onboarding'
import { cn } from '@/shared/lib/cn.pure'
import type { AppSurface } from '@/shared/types/app-surface.types'

interface AppShellProps {
  activeSessionId: string | null
  activeGlobalSessionId: string | null
  onSelectSession: (id: string) => void
  onSelectGlobalSession: (id: string | null) => void
  loading: boolean
  hasProject: boolean
}

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 400
const DEFAULT_SIDEBAR = 260

export const AppShell: FC<AppShellProps> = ({
  activeSessionId,
  activeGlobalSessionId,
  onSelectSession,
  onSelectGlobalSession,
  loading,
  hasProject,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const [activeSurface, setActiveSurface] = useState<AppSurface>('code')
  const dragging = useRef(false)

  const handleSelectCodeSession = useCallback(
    (id: string) => {
      setActiveSurface('code')
      onSelectSession(id)
    },
    [onSelectSession],
  )

  const handleSelectGlobalSession = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      onSelectGlobalSession(id)
    },
    [onSelectGlobalSession],
  )

  const handleNewGlobalSession = useCallback(() => {
    setActiveSurface('chat')
    onSelectGlobalSession(null)
  }, [onSelectGlobalSession])

  const handleMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  if (loading) {
    return (
      <div className="app-chrome flex h-screen items-center justify-center text-foreground">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="app-chrome flex h-screen flex-col overflow-hidden text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="app-sidebar-panel shrink-0 border-r border-white/10"
          style={{ width: sidebarWidth }}
        >
          <Sidebar
            activeSurface={activeSurface}
            onSelectSurface={setActiveSurface}
            onSelectSession={handleSelectCodeSession}
            activeSessionId={activeSessionId}
            onSelectGlobalSession={handleSelectGlobalSession}
            onNewGlobalSession={handleNewGlobalSession}
            activeGlobalSessionId={activeGlobalSessionId}
          />
        </div>

        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR)}
          className={cn(
            'app-resize-handle relative z-10 -mx-1.5 w-px shrink-0 cursor-col-resize border-x-[6px] border-x-transparent bg-clip-content transition-colors hover:bg-white/10',
          )}
        />

        <div className="app-main-panel flex min-w-0 flex-1 flex-col">
          {activeSurface === 'chat' ? (
            <ChatSurface />
          ) : hasProject ? (
            <>
              <NotificationsOnboardingContainer />
              <div className="min-h-0 flex-1">
                <WorkspaceLayout />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center">
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome to Convergence
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a project to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      <GlobalStatusBar />
    </div>
  )
}
