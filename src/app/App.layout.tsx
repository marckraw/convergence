import { useState, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { ChatSurface } from '@/widgets/chat-surface'
import { GlobalStatusBar } from '@/widgets/global-status-bar'
import { WorkspaceLayout } from '@/widgets/workspace-layout'
import { NotificationsOnboardingContainer } from '@/features/notifications-onboarding'
import { useAppSurfaceStore } from '@/entities/app-surface'
import type { CodeReviewMode } from '@/entities/code-review'
import type { SessionSummary } from '@/entities/session'
import { cn } from '@/shared/lib/cn.pure'
import { DevBuildRibbon } from './dev-build-ribbon.presentational'

interface AppShellProps {
  activeSessionId: string | null
  activeGlobalSessionId: string | null
  onSelectSession: (id: string) => void
  onSelectGlobalSession: (id: string | null) => void
  onOpenCodeReview?: (search?: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onCodeReviewSearchChange?: (search: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onCloseCodeReview: () => void
  codeReviewActive: boolean
  codeReviewTargetId: string | null
  codeReviewMode: CodeReviewMode
  codeReviewFilePath: string | null
  selectedChatSpaceId: string | null
  draftChatSpaceId: string | null
  onSelectChatSession: (id: string) => void
  onSelectChatSpace?: (
    id: string,
    options?: {
      draft?: boolean
    },
  ) => void
  onBeginChatSpaceAttempt?: (id: string) => void
  onCancelChatSpaceAttempt?: (id: string) => void
  onSelectAnySession?: (session: SessionSummary) => void
  onShowCode?: () => void | Promise<void>
  onShowChat?: () => void
  onSelectProjectRoot?: (projectId: string) => void | Promise<void>
  onNewGlobalChat?: () => void
  loading: boolean
  hasProject: boolean
  showDevelopmentRibbon: boolean
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
  onOpenCodeReview,
  onCodeReviewSearchChange,
  onCloseCodeReview,
  codeReviewActive,
  codeReviewTargetId,
  codeReviewMode,
  codeReviewFilePath,
  selectedChatSpaceId,
  draftChatSpaceId,
  onSelectChatSession,
  onSelectChatSpace,
  onBeginChatSpaceAttempt,
  onCancelChatSpaceAttempt,
  onSelectAnySession,
  onShowCode,
  onShowChat,
  onSelectProjectRoot,
  onNewGlobalChat,
  loading,
  hasProject,
  showDevelopmentRibbon,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false)
  const [fallbackSelectedChatSpaceId, setFallbackSelectedChatSpaceId] =
    useState<string | null>(null)
  const [fallbackDraftChatSpaceId, setFallbackDraftChatSpaceId] = useState<
    string | null
  >(null)
  const activeSurface = useAppSurfaceStore((state) => state.activeSurface)
  const setActiveSurface = useAppSurfaceStore((state) => state.setActiveSurface)
  const dragging = useRef(false)
  const effectiveSelectedChatSpaceId =
    onSelectChatSpace || selectedChatSpaceId
      ? selectedChatSpaceId
      : fallbackSelectedChatSpaceId
  const effectiveDraftChatSpaceId =
    onBeginChatSpaceAttempt || draftChatSpaceId
      ? draftChatSpaceId
      : fallbackDraftChatSpaceId

  const handleSelectCodeSession = useCallback(
    (id: string) => {
      setActiveSurface('code')
      onSelectSession(id)
    },
    [onSelectSession, setActiveSurface],
  )

  const handleSelectGlobalSession = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      onSelectChatSession(id)
      setFallbackSelectedChatSpaceId(null)
      setFallbackDraftChatSpaceId(null)
    },
    [onSelectChatSession, setActiveSurface],
  )

  const handleNewGlobalSession = useCallback(() => {
    setActiveSurface('chat')
    if (onNewGlobalChat) {
      onNewGlobalChat()
    } else {
      onSelectGlobalSession(null)
    }
    setFallbackSelectedChatSpaceId(null)
    setFallbackDraftChatSpaceId(null)
  }, [onNewGlobalChat, onSelectGlobalSession, setActiveSurface])

  const handleSelectChatSpace = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      onSelectGlobalSession(null)
      if (onSelectChatSpace) {
        onSelectChatSpace(id)
      } else {
        setFallbackSelectedChatSpaceId(id)
        setFallbackDraftChatSpaceId(null)
      }
    },
    [onSelectChatSpace, onSelectGlobalSession, setActiveSurface],
  )

  const handleBeginChatSpaceAttempt = useCallback(
    (id: string) => {
      setActiveSurface('chat')
      onSelectGlobalSession(null)
      if (onBeginChatSpaceAttempt) {
        onBeginChatSpaceAttempt(id)
      } else {
        setFallbackSelectedChatSpaceId(id)
        setFallbackDraftChatSpaceId(id)
      }
    },
    [onBeginChatSpaceAttempt, onSelectGlobalSession, setActiveSurface],
  )

  const handleSelectSurface = useCallback(
    (surface: 'code' | 'chat') => {
      setActiveSurface(surface)
      if (surface === 'code') {
        void onShowCode?.()
        return
      }
      onShowChat?.()
    },
    [onShowChat, onShowCode, setActiveSurface],
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
        {showDevelopmentRibbon ? <DevBuildRibbon /> : null}
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="app-chrome flex h-screen flex-col overflow-hidden text-foreground">
      {showDevelopmentRibbon ? <DevBuildRibbon /> : null}
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
              onSelectSurface={handleSelectSurface}
              onSelectSession={handleSelectCodeSession}
              activeSessionId={activeSessionId}
              onSelectGlobalSession={handleSelectGlobalSession}
              onNewGlobalSession={handleNewGlobalSession}
              selectedSpaceId={effectiveSelectedChatSpaceId}
              onSelectSpace={handleSelectChatSpace}
              activeGlobalSessionId={activeGlobalSessionId}
              onOpenCodeReview={onOpenCodeReview}
              onSelectProjectRoot={onSelectProjectRoot}
              onSelectAnySession={onSelectAnySession}
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
              selectedSpaceId={effectiveSelectedChatSpaceId}
              draftSpaceId={effectiveDraftChatSpaceId}
              onBeginSpaceAttempt={handleBeginChatSpaceAttempt}
              onCancelSpaceAttempt={
                effectiveSelectedChatSpaceId
                  ? () => {
                      if (onCancelChatSpaceAttempt) {
                        onCancelChatSpaceAttempt(effectiveSelectedChatSpaceId)
                      } else {
                        setFallbackDraftChatSpaceId(null)
                      }
                    }
                  : undefined
              }
              onSpaceDeleted={() => {
                if (onNewGlobalChat) {
                  onNewGlobalChat()
                } else {
                  setFallbackSelectedChatSpaceId(null)
                  setFallbackDraftChatSpaceId(null)
                }
              }}
              onOpenSession={onSelectAnySession}
            />
          ) : hasProject ? (
            <>
              <NotificationsOnboardingContainer />
              <div className="min-h-0 flex-1">
                <WorkspaceLayout
                  codeReviewActive={codeReviewActive}
                  codeReviewTargetId={codeReviewTargetId}
                  codeReviewMode={codeReviewMode}
                  codeReviewFilePath={codeReviewFilePath}
                  onOpenCodeReview={onOpenCodeReview}
                  onCodeReviewSearchChange={onCodeReviewSearchChange}
                  onCloseCodeReview={onCloseCodeReview}
                />
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
