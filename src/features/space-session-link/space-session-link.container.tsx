import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore, type SpaceAttemptRole } from '@/entities/space'
import { useSessionStore } from '@/entities/session'
import { SpaceSessionLinkDialog } from './space-session-link.presentational'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'

export const SpaceSessionLinkDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'space-session-link')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
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
  const createSpace = useSpaceStore((s) => s.createSpace)
  const linkAttempt = useSpaceStore((s) => s.linkAttempt)
  const unlinkAttempt = useSpaceStore((s) => s.unlinkAttempt)
  const clearError = useSpaceStore((s) => s.clearError)
  const [createTitle, setCreateTitle] = useState('')
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [selectedRole, setSelectedRole] =
    useState<SpaceAttemptRole>('implementation')
  const [isCreating, setIsCreating] = useState(false)
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

  const attemptsForSession = sessionId
    ? (attemptsBySessionId[sessionId] ?? [])
    : []

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
    setCreateTitle(session?.name ?? '')
    setSelectedSpaceId('')
    setSelectedRole('implementation')
  }, [open, session?.name])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeDialog()
    },
    [closeDialog],
  )

  const handleCreateFromSession = useCallback(async () => {
    if (!session) return
    const title = createTitle.trim()
    if (!title) return
    setIsCreating(true)
    const space = await createSpace({ title })
    if (space) {
      await linkAttempt({
        spaceId: space.id,
        sessionId: session.id,
        role: 'seed',
        isPrimary: true,
      })
      await loadAttempts(space.id)
      await loadAttemptsForSession(session.id)
      setSelectedSpaceId('')
    }
    setIsCreating(false)
  }, [
    createSpace,
    createTitle,
    linkAttempt,
    loadAttempts,
    loadAttemptsForSession,
    session,
  ])

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

  // Enable cmd+Enter to submit the Create from Session form
  useFormSubmitShortcut(
    open && !!session && !!createTitle.trim(),
    handleCreateFromSession,
  )

  return (
    <SpaceSessionLinkDialog
      open={open}
      sessionName={session?.name ?? 'Unknown session'}
      spaces={spaces}
      linkedSpaces={linkedSpaces}
      createTitle={createTitle}
      selectedSpaceId={selectedSpaceId}
      selectedRole={selectedRole}
      isLoading={loading}
      isCreating={isCreating}
      isLinking={isLinking}
      isDetaching={isDetaching}
      error={error}
      onOpenChange={handleOpenChange}
      onCreateTitleChange={setCreateTitle}
      onSelectedSpaceChange={setSelectedSpaceId}
      onSelectedRoleChange={setSelectedRole}
      onCreateFromSession={handleCreateFromSession}
      onAttachToSpace={handleAttachToSpace}
      onDetachAttempt={handleDetachAttempt}
    />
  )
}
