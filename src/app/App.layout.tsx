import { useState, useCallback, useRef } from 'react'
import type { FC } from 'react'
import { Sidebar } from '@/widgets/sidebar'
import { SessionView } from '@/widgets/session-view'
import { cn } from '@/shared/lib/cn.pure'

interface AppShellProps {
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  loading: boolean
  hasProject: boolean
}

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 400
const DEFAULT_SIDEBAR = 260

export const AppShell: FC<AppShellProps> = ({
  activeSessionId,
  onSelectSession,
  loading,
  hasProject,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const dragging = useRef(false)

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
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div
        className="shrink-0 border-r bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <Sidebar
          onSelectSession={onSelectSession}
          activeSessionId={activeSessionId}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'w-px shrink-0 cursor-col-resize transition-colors hover:bg-foreground/20',
        )}
      />

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {hasProject ? (
          <SessionView />
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
  )
}
