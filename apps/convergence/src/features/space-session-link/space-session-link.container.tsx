import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore, type SpaceAttemptRole } from '@/entities/space'
import { useSessionStore } from '@/entities/session'
import { SpaceSessionLinkDialog } from './space-session-link.presentational'

export const SpaceSessionLinkDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'space-session-link')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
  const openDialog = useDialogStore((s) => s.open)
  const sessionId = payload && 'sessionId' in payload ? payload.sessionId : null
  const sessions = useSessionStore((s) => s.sessions)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const spaces = useSpaceStore((s) => s.spaces)
  const attemptsBySessionId = useSpaceStore((s) => s.attemptsBySessionId)
  const loading = useSpaceStore((s) => s.loading)
  const error = useSpaceStore((s) => s.error)
  const loadSpaces = useSpaceStore((s) => s.loadSpaces)
  const loadAttempts = useSpaceStore((s) => s.loadAttempts)
  const loadAttemptsForSession = useSpaceStore((s) => s.loadAttemptsForSession)
  const linkAttempt = useSpaceStore((s) => s.linkAttempt)
  const unlinkAttempt = useSpaceStore((s) => s.unlinkAttempt)
  const clearError = useSpaceStore((s) => s.clearError)
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [selectedRole, setSelectedRole] =
    useState<SpaceAttemptRole>('implementation')
  const [isLinking, setIsLinking] = useState(false)
  const [isDetaching, setIsDetaching] = useState(false)

  const session = useMemo(
    () =>
      sessionId
        ? (sessions.find((entry) => entry.id === sessionId) ??
          globalSessions.find((entry) => entry.id === sessionId) ??
          null)
        : null,
    [globalSessions, sessionId, sessions],
  )

  const attemptsForSession = useMemo(
    () => (sessionId ? (attemptsBySessionId[sessionId] ?? []) : []),
    [attemptsBySessionId, sessionId],
  )

  const linkedSpaces = useMemo(
    () =>
      attemptsForSession.map((attempt) => ({
        attempt,
        space: spaces.find((entry) => entry.id === attempt.spaceId) ?? null,
      })),
    [attemptsForSession, spaces],
  )

  useEffect(() => {
    if (!open) return
    clearError()
    void loadSpaces()
    if (sessionId) {
      void loadAttemptsForSession(sessionId)
    }
  }, [clearError, loadAttemptsForSession, loadSpaces, open, sessionId])

  useEffect(() => {
    if (!open) return
    setSelectedSpaceId('')
    setSelectedRole('implementation')
  }, [open])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeDialog()
    },
    [closeDialog],
  )

  /**
   * The New Space dialog is the one way to create a Space (ruling 4): it
   * starts from this session's name, makes the session the new Space's seed
   * attempt, and hands back here.
   */
  const handleCreateFromSession = useCallback(() => {
    if (!session) return
    openDialog('space-create', {
      newSpace: {
        title: session.name,
        seedSessionId: session.id,
        returnTo: 'space-session-link',
      },
    })
  }, [openDialog, session])

  const handleAttachToSpace = useCallback(async () => {
    if (!session || !selectedSpaceId) return
    setIsLinking(true)
    const attempt = await linkAttempt({
      spaceId: selectedSpaceId,
      sessionId: session.id,
      role: selectedRole,
    })
    if (attempt) {
      await loadAttempts(selectedSpaceId)
      await loadAttemptsForSession(session.id)
      setSelectedSpaceId('')
    }
    setIsLinking(false)
  }, [
    linkAttempt,
    loadAttempts,
    loadAttemptsForSession,
    selectedSpaceId,
    selectedRole,
    session,
  ])

  const handleDetachAttempt = useCallback(
    async (attemptId: string, spaceId: string) => {
      if (!session) return
      setIsDetaching(true)
      await unlinkAttempt(attemptId, spaceId)
      await loadAttemptsForSession(session.id)
      setIsDetaching(false)
    },
    [loadAttemptsForSession, session, unlinkAttempt],
  )

  return (
    <SpaceSessionLinkDialog
      open={open}
      sessionName={session?.name ?? 'Unknown session'}
      spaces={spaces}
      linkedSpaces={linkedSpaces}
      selectedSpaceId={selectedSpaceId}
      selectedRole={selectedRole}
      isLoading={loading}
      isLinking={isLinking}
      isDetaching={isDetaching}
      error={error}
      onOpenChange={handleOpenChange}
      onSelectedSpaceChange={setSelectedSpaceId}
      onSelectedRoleChange={setSelectedRole}
      onCreateFromSession={handleCreateFromSession}
      onAttachToSpace={handleAttachToSpace}
      onDetachAttempt={handleDetachAttempt}
    />
  )
}
