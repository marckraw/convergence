import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent } from 'react'
import { useAttachmentStore } from './attachment.model'
import type {
  Attachment,
  AttachmentIngestFileInput,
  AttachmentIngestRejection,
} from './attachment.types'

const REJECTION_TTL_MS = 6000

function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): File[] {
  if (!dataTransfer) return []
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files)
  }
  const items = dataTransfer.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

async function filesToIngestInputs(
  files: File[],
): Promise<AttachmentIngestFileInput[]> {
  const inputs: AttachmentIngestFileInput[] = []
  for (const file of files) {
    const buffer = await file.arrayBuffer()
    inputs.push({
      name: file.name || 'pasted-file',
      bytes: new Uint8Array(buffer),
      mimeType: file.type || undefined,
    })
  }
  return inputs
}

export interface AttachmentDragHandlers {
  onDragEnter: (e: DragEvent<HTMLElement>) => void
  onDragLeave: (e: DragEvent<HTMLElement>) => void
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
}

export interface AttachmentDraftController {
  attachments: Attachment[]
  rejections: AttachmentIngestRejection[]
  ingestInFlight: boolean
  isDragging: boolean
  dragHandlers: AttachmentDragHandlers
  onPaste: (e: ClipboardEvent<HTMLElement>) => void
  openFileDialog: () => Promise<void>
  ingestFiles: (files: File[]) => Promise<void>
  removeOne: (attachmentId: string) => void
  clearDraft: () => void
}

/**
 * Manages a single keyed attachment draft: the store-backed items/rejections,
 * paste/drop/file-dialog ingestion, and drag-highlight state. Drafts are keyed
 * by `draftKey` (an active session id, or a synthetic key like `fork:<id>` for
 * surfaces that compose a seed before a session exists).
 */
export function useAttachmentDraft(
  draftKey: string,
): AttachmentDraftController {
  const draft = useAttachmentStore((s) => s.drafts[draftKey])
  const ingestFilesAction = useAttachmentStore((s) => s.ingestFiles)
  const ingestFromOpenDialog = useAttachmentStore((s) => s.ingestFromOpenDialog)
  const removeDraftAction = useAttachmentStore((s) => s.removeDraft)
  const clearDraftAction = useAttachmentStore((s) => s.clearDraft)
  const clearRejectionsAction = useAttachmentStore((s) => s.clearRejections)

  const attachments = draft?.items ?? []
  const rejections = draft?.rejections ?? []
  const ingestInFlight = draft?.ingestInFlight ?? false

  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    if (rejections.length > 0) {
      const handle = window.setTimeout(() => {
        clearRejectionsAction(draftKey)
      }, REJECTION_TTL_MS)
      return () => window.clearTimeout(handle)
    }
    return undefined
  }, [rejections, draftKey, clearRejectionsAction])

  const ingestFiles = useCallback(
    async (files: File[]) => {
      const inputs = await filesToIngestInputs(files)
      if (inputs.length === 0) return
      await ingestFilesAction(draftKey, inputs)
    },
    [draftKey, ingestFilesAction],
  )

  const openFileDialog = useCallback(async () => {
    await ingestFromOpenDialog(draftKey)
  }, [draftKey, ingestFromOpenDialog])

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      const files = collectFilesFromDataTransfer(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      void ingestFiles(files)
    },
    [ingestFiles],
  )

  const onDragEnter = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }, [])

  const onDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepth.current = 0
      setIsDragging(false)
      const files = collectFilesFromDataTransfer(e.dataTransfer)
      if (files.length > 0) void ingestFiles(files)
    },
    [ingestFiles],
  )

  const dragHandlers = useMemo(
    () => ({ onDragEnter, onDragLeave, onDragOver, onDrop }),
    [onDragEnter, onDragLeave, onDragOver, onDrop],
  )

  const removeOne = useCallback(
    (attachmentId: string) => {
      void removeDraftAction(draftKey, attachmentId)
    },
    [draftKey, removeDraftAction],
  )

  const clearDraft = useCallback(() => {
    clearDraftAction(draftKey)
  }, [draftKey, clearDraftAction])

  return {
    attachments,
    rejections,
    ingestInFlight,
    isDragging,
    dragHandlers,
    onPaste,
    openFileDialog,
    ingestFiles,
    removeOne,
    clearDraft,
  }
}
