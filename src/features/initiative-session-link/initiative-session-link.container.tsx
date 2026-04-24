import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useDialogStore } from '@/entities/dialog'
import {
  useInitiativeStore,
  type InitiativeAttemptRole,
} from '@/entities/initiative'
import { useSessionStore } from '@/entities/session'
import { InitiativeSessionLinkDialog } from './initiative-session-link.presentational'

export const InitiativeSessionLinkDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'initiative-session-link')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
  const sessionId = payload && 'sessionId' in payload ? payload.sessionId : null
  const sessions = useSessionStore((s) => s.sessions)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const initiatives = useInitiativeStore((s) => s.initiatives)
  const attemptsBySessionId = useInitiativeStore((s) => s.attemptsBySessionId)
  const loading = useInitiativeStore((s) => s.loading)
  const error = useInitiativeStore((s) => s.error)
  const loadInitiatives = useInitiativeStore((s) => s.loadInitiatives)
  const loadAttempts = useInitiativeStore((s) => s.loadAttempts)
  const loadAttemptsForSession = useInitiativeStore(
    (s) => s.loadAttemptsForSession,
  )
  const createInitiative = useInitiativeStore((s) => s.createInitiative)
  const linkAttempt = useInitiativeStore((s) => s.linkAttempt)
  const unlinkAttempt = useInitiativeStore((s) => s.unlinkAttempt)
  const clearError = useInitiativeStore((s) => s.clearError)
  const [createTitle, setCreateTitle] = useState('')
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('')
  const [selectedRole, setSelectedRole] =
    useState<InitiativeAttemptRole>('implementation')
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

  const linkedInitiatives = useMemo(
    () =>
      attemptsForSession.map((attempt) => ({
        attempt,
        initiative:
          initiatives.find((entry) => entry.id === attempt.initiativeId) ??
          null,
      })),
    [attemptsForSession, initiatives],
  )

  useEffect(() => {
    if (!open) return
    clearError()
    void loadInitiatives()
    if (sessionId) {
      void loadAttemptsForSession(sessionId)
    }
  }, [clearError, loadAttemptsForSession, loadInitiatives, open, sessionId])

  useEffect(() => {
    if (!open) return
    setCreateTitle(session?.name ?? '')
    setSelectedInitiativeId('')
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
    const initiative = await createInitiative({ title })
    if (initiative) {
      await linkAttempt({
        initiativeId: initiative.id,
        sessionId: session.id,
        role: 'seed',
        isPrimary: true,
      })
      await loadAttempts(initiative.id)
      await loadAttemptsForSession(session.id)
      setSelectedInitiativeId('')
    }
    setIsCreating(false)
  }, [
    createInitiative,
    createTitle,
    linkAttempt,
    loadAttempts,
    loadAttemptsForSession,
    session,
  ])

  const handleAttachToInitiative = useCallback(async () => {
    if (!session || !selectedInitiativeId) return
    setIsLinking(true)
    const attempt = await linkAttempt({
      initiativeId: selectedInitiativeId,
      sessionId: session.id,
      role: selectedRole,
    })
    if (attempt) {
      await loadAttempts(selectedInitiativeId)
      await loadAttemptsForSession(session.id)
      setSelectedInitiativeId('')
    }
    setIsLinking(false)
  }, [
    linkAttempt,
    loadAttempts,
    loadAttemptsForSession,
    selectedInitiativeId,
    selectedRole,
    session,
  ])

  const handleDetachAttempt = useCallback(
    async (attemptId: string, initiativeId: string) => {
      if (!session) return
      setIsDetaching(true)
      await unlinkAttempt(attemptId, initiativeId)
      await loadAttemptsForSession(session.id)
      setIsDetaching(false)
    },
    [loadAttemptsForSession, session, unlinkAttempt],
  )

  return (
    <InitiativeSessionLinkDialog
      open={open}
      sessionName={session?.name ?? 'Unknown session'}
      initiatives={initiatives}
      linkedInitiatives={linkedInitiatives}
      createTitle={createTitle}
      selectedInitiativeId={selectedInitiativeId}
      selectedRole={selectedRole}
      isLoading={loading}
      isCreating={isCreating}
      isLinking={isLinking}
      isDetaching={isDetaching}
      error={error}
      onOpenChange={handleOpenChange}
      onCreateTitleChange={setCreateTitle}
      onSelectedInitiativeChange={setSelectedInitiativeId}
      onSelectedRoleChange={setSelectedRole}
      onCreateFromSession={handleCreateFromSession}
      onAttachToInitiative={handleAttachToInitiative}
      onDetachAttempt={handleDetachAttempt}
    />
  )
}
