import { PerfProfiler } from '@/shared/lib/perf-profiler'
import { useState, useCallback, useEffect } from 'react'
import type { FC, KeyboardEvent } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { ChatSurface } from '@/widgets/chat-surface'
import { GlobalStatusBar } from '@/widgets/global-status-bar'
import { MissionControl } from '@/widgets/mission-control'
import { WorkspaceLayout } from '@/widgets/workspace-layout'
import { NotificationsOnboardingContainer } from '@/features/notifications-onboarding'
import { WavePanel } from '@/features/waves'
import { useAppSurfaceStore } from '@/entities/app-surface'
import type { SessionSummary } from '@/entities/session'
import { cn, DragRegion, ResizeHandle } from '@convergence/ui'
import { DevBuildRibbon } from './dev-build-ribbon.presentational'
import { RouteFallbackView } from './route-fallback.presentational'
import { loadSidebarLayout, saveSidebarLayout } from './sidebar-layout.api'
import {
  COLLAPSED_SIDEBAR,
  DEFAULT_SIDEBAR,
  MAX_SIDEBAR,
  MIN_SIDEBAR,
} from './sidebar-layout.pure'
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
  // The sidebar comes back as it was left: its width and its fold (NAV-16).
  const [sidebarWidth, setSidebarWidth] = useState(
    () => loadSidebarLayout().width,
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => loadSidebarLayout().collapsed,
  )
  useEffect(() => {
    saveSidebarLayout({ width: sidebarWidth, collapsed: sidebarCollapsed })
  }, [sidebarWidth, sidebarCollapsed])
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false)
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
  const [mainPanelElement, setMainPanelElement] = useState<HTMLElement | null>(
    null,
  )
  const [fallbackSelectedChatSpaceId, setFallbackSelectedChatSpaceId] =
    useState<string | null>(null)
  const [fallbackDraftChatSpaceId, setFallbackDraftChatSpaceId] = useState<
    string | null
  >(null)
  const activeSurface = useAppSurfaceStore((state) => state.activeSurface)
  const setActiveSurface = useAppSurfaceStore((state) => state.setActiveSurface)
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

  /**
   * Escape puts a peeked sidebar away, so the keyboard that opened it can
   * close it (NAV-27). Only from inside the panel itself: a menu or dialog
   * it opened is portalled out of it and handles its own Escape.
   */
  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || !sidebarCollapsed || !sidebarPeekOpen)
        return
      if (!event.currentTarget.contains(event.target as Node)) return
      setSidebarPeekOpen(false)
    },
    [sidebarCollapsed, sidebarPeekOpen],
  )

  if (loading) {
    return (
      <div className="app-chrome flex h-screen flex-col text-ink">
        {/* The window moves from its top while the app loads (NAV-4). */}
        <DragRegion />
        {showDevelopmentRibbon ? <DevBuildRibbon /> : null}
        <p className="flex flex-1 items-center justify-center pb-12 text-ink-muted">
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div className="app-chrome flex h-screen flex-col overflow-hidden text-ink">
      {showDevelopmentRibbon ? <DevBuildRibbon /> : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="relative shrink-0"
          style={{
            width: sidebarCollapsed ? COLLAPSED_SIDEBAR : sidebarWidth,
          }}
        >
          {/* The shell's landmarks (NAV-26): the sidebar, the main panel, the status bar. */}
          <aside
            aria-label="Sidebar"
            className={cn(
              'app-sidebar-panel h-full border-r border-hairline',
              sidebarCollapsed && sidebarPeekOpen
                ? 'absolute top-0 left-0 z-30 shadow-overlay'
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
            onKeyDown={handleSidebarKeyDown}
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
          </aside>
        </div>

        {sidebarCollapsed ? null : (
          // The keyboard resizes it too, and says its width (NAV-16).
          <ResizeHandle
            label="Resize the sidebar"
            value={sidebarWidth}
            min={MIN_SIDEBAR}
            max={MAX_SIDEBAR}
            onChange={setSidebarWidth}
            onReset={() => setSidebarWidth(DEFAULT_SIDEBAR)}
            className="app-resize-handle"
          />
        )}

        {/* Loom (MAR-3097, MAR-3189): the ledger beside the conversation, its
            four sheets compact in this slot or expanded into the content area.
            Absent when no crew reads a tracker. */}
        <PerfProfiler id="wave-panel">
          <WavePanel
            onOpenSession={onSelectAnySession}
            reservedWidth={sidebarCollapsed ? COLLAPSED_SIDEBAR : sidebarWidth}
            onExpandedChange={setLoomExpanded}
            expandedContainer={mainPanelElement}
          />
        </PerfProfiler>

        <main
          ref={setMainPanelElement}
          className="app-main-panel relative flex min-w-0 flex-1 flex-col"
        >
          {/* `contents` always (MAR-3189 R5, lap 2 D): this wrapper exists
              ONLY to mark the content area inert in one place, and
              `display: contents` keeps every surface inside it a direct flex
              child of the main panel, laid out exactly as before.

              Expanded Loom COVERS this, it does not remove its box. Neither
              unmounted nor `display: none`: the transcript is a virtualizer
              measured by a ResizeObserver, and a surface with no box measures
              every row at zero -- folding would give back a conversation
              scrolled somewhere a person never left it. Covered, the layout
              underneath never changes, so there is nothing to restore.

              `inert` takes the whole subtree out of the tab order, off the
              pointer and away from a screen reader while it is behind the
              cover -- what `hidden` did for free, and the only part of it
              worth keeping. */}
          <div
            data-app-content
            className="contents"
            inert={loomExpanded}
            aria-hidden={loomExpanded || undefined}
          >
            {routeFallback ? (
              <RouteFallbackView
                fallback={routeFallback}
                onAction={onRouteFallbackAction ?? (() => undefined)}
              />
            ) : missionControlActive ? (
              <MissionControl onOpenSession={onSelectAnySession} />
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
              <div className="flex h-full flex-col">
                {/* No header here, and the window still moves from its top (NAV-4). */}
                <DragRegion />
                <div className="flex flex-1 flex-col items-center justify-center pb-12">
                  <h1 className="text-2xl font-bold tracking-tight">
                    Welcome to Convergence
                  </h1>
                  <p className="mt-2 text-sm text-ink-muted">
                    Open a project to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <GlobalStatusBar onSelectProject={onSelectProjectRoot} />
    </div>
  )
}
