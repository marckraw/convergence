import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  notificationsApi,
  useNotificationsStore,
  type NotificationDispatchPayload,
  type NotificationEventKind,
  type NotificationSeverity,
} from '@/entities/notifications'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { useAppSurfaceStore } from '@/entities/app-surface'
import chimeSoftUrl from '@/shared/assets/sounds/chime-soft.wav'
import chimeAlertUrl from '@/shared/assets/sounds/chime-alert.wav'

function severityFor(kind: NotificationEventKind): NotificationSeverity {
  return kind === 'agent.finished' ? 'info' : 'critical'
}

// Cross-project focus: a system notification or toast click can target a
// session that lives in a different project than the one currently
// active. Hop projects first (mirroring command-center's switchToSession)
// so the sidebar / main panel reflect the right project before the
// session activates.
export async function focusSessionAcrossProjects(
  sessionId: string,
): Promise<void> {
  const sessionState = useSessionStore.getState()
  const target = sessionState.globalSessions.find((s) => s.id === sessionId)
  if (!target) return
  if (target.contextKind === 'global') {
    useAppSurfaceStore.getState().setActiveSurface('chat')
    useSessionStore.getState().setActiveGlobalSession(sessionId)
    return
  }
  useAppSurfaceStore.getState().setActiveSurface('code')
  const projectId = target.projectId
  if (!projectId) return

  const projectState = useProjectStore.getState()
  const activeProject = projectState.activeProject
  if (activeProject?.id !== projectId) {
    const targetProject = projectState.projects.find((p) => p.id === projectId)
    sessionState.prepareForProject(projectId)
    await projectState.setActiveProject(projectId)
    const workspaceState = useWorkspaceStore.getState()
    const refreshedSessionState = useSessionStore.getState()
    if (targetProject) {
      await Promise.all([
        workspaceState.loadWorkspaces(targetProject.id),
        workspaceState.loadCurrentBranch(targetProject.repositoryPath),
        refreshedSessionState.loadSessions(targetProject.id),
      ])
    } else {
      await refreshedSessionState.loadSessions(projectId)
    }
  }

  useSessionStore.getState().setActiveSession(sessionId)
}

export function NotificationsToastHostContainer() {
  const pulseSession = useNotificationsStore((s) => s.pulseSession)
  const incrementUnread = useNotificationsStore((s) => s.incrementUnread)
  const clearUnread = useNotificationsStore((s) => s.clearUnread)
  const softRef = useRef<HTMLAudioElement>(null)
  const alertRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const unsubscribe = notificationsApi.onShowToast(
      (payload: NotificationDispatchPayload) => {
        if (payload.channel === 'inline-pulse') {
          pulseSession(payload.event.sessionId)
          return
        }
        if (payload.channel !== 'toast') return

        const severity = severityFor(payload.event.kind)
        const showFn = severity === 'critical' ? toast.error : toast
        showFn(payload.formatted.title, {
          description: payload.formatted.body,
          onDismiss: () => clearUnread(),
          onAutoClose: () => clearUnread(),
          action: {
            label: 'Open',
            onClick: () => {
              void focusSessionAcrossProjects(payload.event.sessionId)
              clearUnread()
            },
          },
        })
        incrementUnread()
      },
    )
    return unsubscribe
  }, [clearUnread, incrementUnread, pulseSession])

  useEffect(() => {
    const unsubscribe = notificationsApi.onPlaySound(
      (payload: NotificationDispatchPayload) => {
        const audio =
          payload.channel === 'sound-alert' ? alertRef.current : softRef.current
        if (!audio) return
        try {
          audio.currentTime = 0
          void audio.play()
        } catch {
          // Audio playback can fail on suspended audio context; the
          // dock badge / toast still cover the notification surface.
        }
      },
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = notificationsApi.onClearUnread(() => {
      clearUnread()
    })
    return unsubscribe
  }, [clearUnread])

  useEffect(() => {
    const unsubscribe = notificationsApi.onFocusSession((sessionId) => {
      void focusSessionAcrossProjects(sessionId)
    })
    return unsubscribe
  }, [])

  return (
    <>
      <audio ref={softRef} src={chimeSoftUrl} preload="auto" />
      <audio ref={alertRef} src={chimeAlertUrl} preload="auto" />
    </>
  )
}
