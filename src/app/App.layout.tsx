import { useState, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { ChatSurface } from '@/widgets/chat-surface'
import { GlobalStatusBar } from '@/widgets/global-status-bar'
import { WorkspaceLayout } from '@/widgets/workspace-layout'
import { NotificationsOnboardingContainer } from '@/features/notifications-onboarding'
import { useAppSurfaceStore } from '@/entities/app-surface'
import { cn } from '@/shared/lib/cn.pure'

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
const COLLAPSED_SIDEBAR = 56

export const AppShell: FC<AppShellProps> = ({
  activeSessionId,
  activeGlobalSessionId,
  onSelectSession,
  onSelectGlobalSession,
  loading,
  hasProject,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false)
  const [selectedChatSpaceId, setSelectedChatSpaceId] = useState<string | null>(
    null,
  )
  const [draftChatSpaceId, setDraftChatSpaceId] = useState<string | null>(null)
  const activeSurface = useAppSurfaceStore((state) => state.activeSurface)
  const setActiveSurface = useAppSurfaceStore((state) => state.setActiveSurface)
  const dragging = useRef(false)

  const handleSelectCodeSession = useCallback(
    (id: string) => {
      setActiveSurface('code')
      setSelectedChatSpaceId(null)
      setDraftChatSpaceId(null)
      onSelectSession(id)
    },
    [onSelectSession, setActiveSurface],
  )

  const handleSelectGlobalSession = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      setSelectedChatSpaceId(null)
      setDraftChatSpaceId(null)
      onSelectGlobalSession(id)
    },
    [onSelectGlobalSession, setActiveSurface],
  )

  const handleNewGlobalSession = useCallback(() => {
    setActiveSurface('chat')
    setSelectedChatSpaceId(null)
    setDraftChatSpaceId(null)
    onSelectGlobalSession(null)
  }, [onSelectGlobalSession, setActiveSurface])

  const handleSelectChatSpace = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      setSelectedChatSpaceId(id)
      setDraftChatSpaceId(null)
      onSelectGlobalSession(null)
    },
    [onSelectGlobalSession, setActiveSurface],
  )

  const handleBeginChatSpaceAttempt = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      setSelectedChatSpaceId(id)
      setDraftChatSpaceId(id)
      onSelectGlobalSession(null)
    },
    [onSelectGlobalSession, setActiveSurface],
  )

  const handleMouseDown = useCallback(() => {
    if (sidebarCollapsed) return

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
  }, [sidebarCollapsed])

  const handleCollapseSidebar = useCallback(() => {
    setSidebarCollapsed(true)
    setSidebarPeekOpen(false)
  }, [])

  const handleExpandSidebar = useCallback(() => {
    setSidebarCollapsed(false)
    setSidebarPeekOpen(false)
  }, [])

  const handlePinSidebarPeek = useCallback(() => {
    setSidebarCollapsed(false)
    setSidebarPeekOpen(false)
  }, [])

  const handlePeekSidebar = useCallback(() => {
    if (sidebarCollapsed) {
      setSidebarPeekOpen(true)
    }
  }, [sidebarCollapsed])

  const handleSidebarMouseLeave = useCallback(() => {
    if (sidebarCollapsed) {
      setSidebarPeekOpen(false)
    }
  }, [sidebarCollapsed])

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
          className="relative shrink-0"
          style={{
            width: sidebarCollapsed ? COLLAPSED_SIDEBAR : sidebarWidth,
          }}
        >
          <div
            className={cn(
              'app-sidebar-panel h-full border-r border-white/10 transition-[width] duration-150',
              sidebarCollapsed && sidebarPeekOpen
                ? 'absolute top-0 left-0 z-30 shadow-2xl'
                : 'relative',
            )}
            style={{
              width:
                sidebarCollapsed && sidebarPeekOpen
                  ? sidebarWidth
                  : sidebarCollapsed
                    ? COLLAPSED_SIDEBAR
                    : sidebarWidth,
            }}
            onMouseLeave={handleSidebarMouseLeave}
          >
            <Sidebar
              activeSurface={activeSurface}
              onSelectSurface={setActiveSurface}
              onSelectSession={handleSelectCodeSession}
              activeSessionId={activeSessionId}
              onSelectGlobalSession={handleSelectGlobalSession}
              onNewGlobalSession={handleNewGlobalSession}
              selectedSpaceId={selectedChatSpaceId}
              onSelectSpace={handleSelectChatSpace}
              activeGlobalSessionId={activeGlobalSessionId}
              collapsed={sidebarCollapsed && !sidebarPeekOpen}
              peek={sidebarCollapsed && sidebarPeekOpen}
              onCollapse={handleCollapseSidebar}
              onExpand={handleExpandSidebar}
              onPeek={handlePeekSidebar}
              onPinPeek={handlePinSidebarPeek}
            />
          </div>
        </div>

        {sidebarCollapsed ? null : (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR)}
            className={cn(
              'app-resize-handle relative z-10 -mx-1.5 w-px shrink-0 cursor-col-resize border-x-[6px] border-x-transparent bg-clip-content transition-colors hover:bg-white/10',
            )}
          />
        )}

        <div className="app-main-panel flex min-w-0 flex-1 flex-col">
          {activeSurface === 'chat' ? (
            <ChatSurface
              selectedSpaceId={selectedChatSpaceId}
              draftSpaceId={draftChatSpaceId}
              onBeginSpaceAttempt={handleBeginChatSpaceAttempt}
              onCancelSpaceAttempt={() => setDraftChatSpaceId(null)}
              onSpaceDeleted={() => {
                setSelectedChatSpaceId(null)
                setDraftChatSpaceId(null)
              }}
            />
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
