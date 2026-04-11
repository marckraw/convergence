import { useEffect } from 'react'
import type { FC } from 'react'
import type { Project } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { SessionStart } from '@/features/session-start'
import { SessionListShell } from './session-list.presentational'

interface SessionListProps {
  project: Project
}

export const SessionList: FC<SessionListProps> = ({ project }) => {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const approveSession = useSessionStore((s) => s.approveSession)
  const denySession = useSessionStore((s) => s.denySession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate)

  useEffect(() => {
    loadSessions(project.id)
  }, [project.id, loadSessions])

  // Subscribe to real-time session updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.session.onSessionUpdate(
      (session) => {
        handleSessionUpdate(session)
      },
    )
    return unsubscribe
  }, [handleSessionUpdate])

  return (
    <SessionListShell
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={setActiveSession}
      onApprove={approveSession}
      onDeny={denySession}
      onStop={stopSession}
      onDelete={(id) => deleteSession(id, project.id)}
      startForm={<SessionStart projectId={project.id} workspaceId={null} />}
    />
  )
}
