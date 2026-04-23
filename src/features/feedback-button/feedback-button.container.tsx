import { useState } from 'react'
import { toast } from 'sonner'
import { feedbackApi, type FeedbackKind } from '@/entities/feedback'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { FeedbackButton } from './feedback-button.presentational'

export function FeedbackButtonContainer() {
  const activeProject = useProjectStore((state) => state.activeProject)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('ui')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setError(null)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      await feedbackApi.submit({
        kind,
        message,
        contact: contact.trim() || null,
        context: {
          activeProjectId: activeProject?.id ?? null,
          activeProjectName: activeProject?.name ?? null,
          activeSessionId,
          appUrl: window.location.href,
        },
      })

      toast.success('Feedback received')
      setOpen(false)
      setKind('ui')
      setMessage('')
      setContact('')
    } catch (err) {
      const nextError =
        err instanceof Error ? err.message : 'Failed to send feedback.'
      setError(nextError)
      toast.error(nextError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FeedbackButton
      open={open}
      kind={kind}
      message={message}
      contact={contact}
      error={error}
      submitting={submitting}
      onOpenChange={handleOpenChange}
      onKindChange={setKind}
      onMessageChange={setMessage}
      onContactChange={setContact}
      onSubmit={handleSubmit}
    />
  )
}
