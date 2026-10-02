import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { useDialogStore, type NewSpacePrefill } from '@/entities/dialog'
import { useSpaceStore, type Space } from '@/entities/space'
import { SpaceCreateDialog } from './space-create.presentational'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'

interface SpaceCreateDialogContainerProps {
  /** A Space made from the sidebar, which then shows it. */
  onCreated?: (space: Space) => void
}

/**
 * The one way to create a Space (ruling 4, 2 Oct 2026; DLG-32). Every
 * "Create Space…" opens this dialog: the sidebar's, the Spaces board's and a
 * session's Session Space dialog's. One opened from another dialog starts
 * with what that one knew (`NewSpacePrefill`: a session's name, the session
 * as the Space's seed attempt) and goes back to it when it closes, with the
 * new Space chosen there.
 */
export const SpaceCreateDialogContainer: FC<
  SpaceCreateDialogContainerProps
> = ({ onCreated }) => {
  const open = useDialogStore((state) => state.openDialog === 'space-create')
  const openDialog = useDialogStore((state) => state.open)
  const closeDialog = useDialogStore((state) => state.close)
  const createSpace = useSpaceStore((state) => state.createSpace)
  const linkAttempt = useSpaceStore((state) => state.linkAttempt)
  const loadAttempts = useSpaceStore((state) => state.loadAttempts)
  const loadAttemptsForSession = useSpaceStore(
    (state) => state.loadAttemptsForSession,
  )

  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // What this opening was given, read once as it opens and kept while it is
  // open: the store's payload changes as soon as it hands back.
  const [prefill, setPrefill] = useState<NewSpacePrefill | null>(null)

  useEffect(() => {
    if (!open) {
      setPrefill(null)
      return
    }
    const { payload } = useDialogStore.getState()
    const given = payload && 'newSpace' in payload ? payload.newSpace : null
    setPrefill(given)
    setTitle(given?.title ?? '')
    setBrief('')
    setError(null)
  }, [open])

  /** Back to where it was opened from, or closed when that was the sidebar. */
  const leave = useCallback(
    (created: Space | null) => {
      const from = prefill
      if (from?.returnTo === 'space-workboard') {
        openDialog(
          'space-workboard',
          created ? { spaceId: created.id } : undefined,
        )
        return
      }
      if (from?.returnTo === 'space-session-link' && from.seedSessionId) {
        openDialog('space-session-link', { sessionId: from.seedSessionId })
        return
      }
      if (created) onCreated?.(created)
      closeDialog()
    },
    [closeDialog, onCreated, openDialog, prefill],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) openDialog('space-create')
      else leave(null)
    },
    [leave, openDialog],
  )

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim()
    const trimmedBrief = brief.trim()
    if (!trimmedTitle) return

    setIsSubmitting(true)
    setError(null)

    try {
      const created = await createSpace({
        title: trimmedTitle,
        brief: trimmedBrief,
      })
      const storeError = useSpaceStore.getState().error
      if (storeError || !created) {
        setError(storeError ?? 'Couldn’t create the Space.')
        return
      }

      toast.success(`Space ${created.title} created`)
      const seedSessionId = prefill?.seedSessionId
      leave(created)
      // The session joins its new Space as the seed, as "Create from
      // session" did. After the hand-back, so the Session Space dialog,
      // which clears the store's error as it opens, shows a link that failed.
      if (seedSessionId) {
        const attempt = await linkAttempt({
          spaceId: created.id,
          sessionId: seedSessionId,
          role: 'seed',
          isPrimary: true,
        })
        if (attempt) {
          await loadAttempts(created.id)
          await loadAttemptsForSession(seedSessionId)
        }
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Couldn’t create the Space.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    brief,
    createSpace,
    leave,
    linkAttempt,
    loadAttempts,
    loadAttemptsForSession,
    prefill,
    title,
  ])

  // Enable cmd+Enter to submit the form
  useFormSubmitShortcut(open, handleSubmit)

  return (
    <SpaceCreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      seeded={prefill?.seedSessionId !== undefined}
      title={title}
      brief={brief}
      isSubmitting={isSubmitting}
      error={error}
      onTitleChange={setTitle}
      onBriefChange={setBrief}
      onSubmit={() => void handleSubmit()}
    />
  )
}
