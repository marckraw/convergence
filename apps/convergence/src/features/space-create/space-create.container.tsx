import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { toast } from 'sonner'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore, type Space } from '@/entities/space'
import { SpaceCreateDialog } from './space-create.presentational'
import { useFormSubmitShortcut } from '@/shared/lib/use-form-submit-shortcut.pure'

interface SpaceCreateDialogContainerProps {
  onCreated?: (space: Space) => void
}

export const SpaceCreateDialogContainer: FC<
  SpaceCreateDialogContainerProps
> = ({ onCreated }) => {
  const open = useDialogStore((state) => state.openDialog === 'space-create')
  const openDialog = useDialogStore((state) => state.open)
  const closeDialog = useDialogStore((state) => state.close)
  const createSpace = useSpaceStore((state) => state.createSpace)

  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setBrief('')
    setError(null)
  }, [open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) openDialog('space-create')
      else closeDialog()
    },
    [closeDialog, openDialog],
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
        setError(storeError ?? 'Failed to create Space')
        return
      }

      toast.success(`Space ${created.title} created`)
      onCreated?.(created)
      closeDialog()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Failed to create Space',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [brief, closeDialog, createSpace, onCreated, title])

  // Enable cmd+Enter to submit the form
  useFormSubmitShortcut(open, handleSubmit)

  return (
    <SpaceCreateDialog
      open={open}
      onOpenChange={handleOpenChange}
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
