import { useState, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { ChatSurface } from '@/widgets/chat-surface'
import { GlobalStatusBar } from '@/widgets/global-status-bar'
import { MissionControl } from '@/widgets/mission-control'
import { WorkspaceLayout } from '@/widgets/workspace-layout'
import { NotificationsOnboardingContainer } from '@/features/notifications-onboarding'
import { isWaveColumnHidden, WavePanel } from '@/features/waves'
import { useAppSurfaceStore } from '@/entities/app-surface'
import type { SessionSummary } from '@/entities/session'
import { cn } from '@/shared/lib/cn.pure'
import { DevBuildRibbon } from './dev-build-ribbon.presentational'
import { RouteFallbackView } from './route-fallback.presentational'
import type { MainViewRouteFallback } from './routes/main-view-route-resolution.pure'

interface AppShellProps {
  activeSessionId: string | null
  activeGlobalSessionId: string | null
  onSelectSession: (id: string) => void
  onSelectGlobalSession: (id: string | null) => void
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
  onShowMissionControl?: () => void
  missionControlActive?: boolean
  onSelectProjectRoot?: (projectId: string) => void | Promise<void>
  onNewGlobalChat?: () => void
  routeDrivenNavigation?: boolean
  routeFallback?: MainViewRouteFallback | null
  onRouteFallbackAction?: () => void
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
  selectedChatSpaceId,
  draftChatSpaceId,
  onSelectChatSession,
  onSelectChatSpace,
  onBeginChatSpaceAttempt,
  onCancelChatSpaceAttempt,
  onSelectAnySession,
  onShowCode,
  onShowChat,
  onShowMissionControl,
  missionControlActive = false,
  onSelectProjectRoot,
  onNewGlobalChat,
  routeDrivenNavigation = false,
  routeFallback,
  onRouteFallbackAction,
  loading,
  hasProject,
  showDevelopmentRibbon,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false)
  // Which view Mission Control last showed; the wave column steps aside for
  // its Waves tab (MAR-3097 lap 2, B).
  const [missionControlMode, setMissionControlMode] = useState<string | null>(
    null,
  )
  /**
   * Loom has the content area (MAR-3189 R5).
   *
   * Two pieces of state, and both are the panel's own facts held HERE because
   * only the layout can act on them: whether the stack is expanded, and the
   * element it is drawn into. Nothing about the sidebar or the selected
   * session is touched by either -- folding puts the main panel's previous
   * content back exactly as it was, because it was never taken away, only
   * not rendered.
   */
  const [loomExpanded, setLoomExpanded] = useState(false)
  const [mainPanelElement, setMainPanelElement] =
    useState<HTMLDivElement | null>(null)
  const [fallbackSelectedChatSpaceId, setFallbackSelectedChatSpaceId] =
    useState<string | null>(null)
  const [fallbackDraftChatSpaceId, setFallbackDraftChatSpaceId] = useState<
    string | null
  >(null)
  const activeSurface = useAppSurfaceStore((state) => state.activeSurface)
  const setActiveSurface = useAppSurfaceStore((state) => state.setActiveSurface)
  const dragging = useRef(false)
  const setCompatibilitySurface = useCallback(
    (surface: 'code' | 'chat') => {
      if (!routeDrivenNavigation) {
        setActiveSurface(surface)
      }
    },
    [routeDrivenNavigation, setActiveSurface],
  )
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
      setCompatibilitySurface('code')
      setFallbackSelectedChatSpaceId(null)
      setFallbackDraftChatSpaceId(null)
      onSelectSession(id)
    },
    [onSelectSession, setCompatibilitySurface],
  )

  const handleSelectGlobalSession = useCallback(
    (id: string) => {
      setCompatibilitySurface('chat')
      onSelectChatSession(id)
      setFallbackSelectedChatSpaceId(null)
      setFallbackDraftChatSpaceId(null)
    },
    [onSelectChatSession, setCompatibilitySurface],
  )

  const handleNewGlobalSession = useCallback(() => {
    setCompatibilitySurface('chat')
    if (onNewGlobalChat) {
      onNewGlobalChat()
    } else {
      onSelectGlobalSession(null)
    }
    setFallbackSelectedChatSpaceId(null)
    setFallbackDraftChatSpaceId(null)
  }, [onNewGlobalChat, onSelectGlobalSession, setCompatibilitySurface])

  const handleSelectChatSpace = useCallback(
    (id: string) => {
      setCompatibilitySurface('chat')
      onSelectGlobalSession(null)
      if (onSelectChatSpace) {
        onSelectChatSpace(id)
      } else {
        setFallbackSelectedChatSpaceId(id)
        setFallbackDraftChatSpaceId(null)
      }
    },
    [onSelectChatSpace, onSelectGlobalSession, setCompatibilitySurface],
  )

  const handleBeginChatSpaceAttempt = useCallback(
    (id: string) => {
      setCompatibilitySurface('chat')
      onSelectGlobalSession(null)
      if (onBeginChatSpaceAttempt) {
        onBeginChatSpaceAttempt(id)
      } else {
        setFallbackSelectedChatSpaceId(id)
        setFallbackDraftChatSpaceId(id)
      }
    },
    [onBeginChatSpaceAttempt, onSelectGlobalSession, setCompatibilitySurface],
  )

  const handleSelectSurface = useCallback(
    (surface: 'code' | 'chat') => {
      setCompatibilitySurface(surface)
      if (surface === 'code') {
        void onShowCode?.()
        return
      }
      onShowChat?.()
    },
    [onShowChat, onShowCode, setCompatibilitySurface],
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
              onSelectProjectRoot={onSelectProjectRoot}
              onSelectAnySession={onSelectAnySession}
              onShowMissionControl={onShowMissionControl}
              missionControlActive={missionControlActive}
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

        {/* Loom (MAR-3097, MAR-3189): the ledger beside the conversation, its
            four sheets compact in this slot or expanded into the content area.
            Absent when no crew reads a tracker, and while Mission Control
            shows its own Waves tab. */}
        <WavePanel
          onOpenSession={onSelectAnySession}
          hidden={isWaveColumnHidden({
            missionControlActive,
            missionControlMode,
          })}
          reservedWidth={sidebarCollapsed ? COLLAPSED_SIDEBAR : sidebarWidth}
          onExpandedChange={setLoomExpanded}
          expandedContainer={mainPanelElement}
        />

        <div
          ref={setMainPanelElement}
          className="app-main-panel flex min-w-0 flex-1 flex-col"
        >
          {/* `contents` and not a flex box of its own (MAR-3189 R5): this
              wrapper exists ONLY so expanding Loom can hide the whole content
              area in one place, and `display: contents` keeps every surface
              inside it a direct flex child of the main panel, laid out
              exactly as before. Hidden, not unmounted -- folding has to give
              back the conversation a person left, scroll, drafts and all,
              and an unmount gives back a fresh one that merely looks the
              same. */}
          <div className={loomExpanded ? 'hidden' : 'contents'}>
            {routeFallback ? (
              <RouteFallbackView
                fallback={routeFallback}
                onAction={onRouteFallbackAction ?? (() => undefined)}
              />
            ) : missionControlActive ? (
              <MissionControl
                onOpenSession={onSelectAnySession}
                onModeChange={setMissionControlMode}
              />
            ) : activeSurface === 'chat' ? (
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
      </div>

      <GlobalStatusBar onSelectProject={onSelectProjectRoot} />
    </div>
  )
}
