import { useState } from 'react'
import { toast } from 'sonner'
import { feedbackApi, type FeedbackPriority } from '@/entities/feedback'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { FeedbackButton } from './feedback-button.presentational'

export function FeedbackButtonContainer() {
  const activeProject = useProjectStore((state) => state.activeProject)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const [open, setOpen] = useState(false)
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
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
        title,
        description,
        priority,
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
      setPriority('medium')
      setTitle('')
      setDescription('')
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
      priority={priority}
      title={title}
      description={description}
      contact={contact}
      error={error}
      submitting={submitting}
      onOpenChange={handleOpenChange}
      onPriorityChange={setPriority}
      onTitleChange={setTitle}
      onDescriptionChange={setDescription}
      onContactChange={setContact}
      onSubmit={handleSubmit}
    />
  )
}
