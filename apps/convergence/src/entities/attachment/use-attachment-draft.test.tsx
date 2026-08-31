import { act, renderHook, waitFor } from '@testing-library/react'
import type { DragEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAttachmentStore, type AttachmentStore } from './attachment.model'
import type { Attachment } from './attachment.types'
import { useAttachmentDraft } from './use-attachment-draft'

const KEY = 'fork:parent-1'

const sampleAttachment: Attachment = {
  id: 'att-1',
  sessionId: KEY,
  kind: 'image',
  mimeType: 'image/png',
  filename: 'shot.png',
  sizeBytes: 3,
  storagePath: '/tmp/shot.png',
  thumbnailPath: null,
  textPreview: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function primeStore(overrides: Partial<AttachmentStore> = {}) {
  useAttachmentStore.setState({
    drafts: {},
    resolved: {},
    ingestFiles: vi.fn().mockResolvedValue(undefined),
    ingestFromOpenDialog: vi.fn().mockResolvedValue(undefined),
    removeDraft: vi.fn().mockResolvedValue(undefined),
    clearDraft: vi.fn(),
    clearRejections: vi.fn(),
    ...overrides,
  } as unknown as AttachmentStore)
}

function dragEventWithFiles(files: File[]): DragEvent<HTMLElement> {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files, items: null },
  } as unknown as DragEvent<HTMLElement>
}

describe('useAttachmentDraft', () => {
  beforeEach(() => {
    primeStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mirrors the keyed draft state from the store', () => {
    primeStore({
      drafts: {
        [KEY]: {
          items: [sampleAttachment],
          rejections: [{ filename: 'big.bin', reason: 'too large' }],
          ingestInFlight: true,
        },
      },
    })

    const { result } = renderHook(() => useAttachmentDraft(KEY))

    expect(result.current.attachments).toEqual([sampleAttachment])
    expect(result.current.rejections).toHaveLength(1)
    expect(result.current.ingestInFlight).toBe(true)
  })

  it('opens the file dialog scoped to the draft key', async () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))

    await act(async () => {
      await result.current.openFileDialog()
    })

    expect(
      useAttachmentStore.getState().ingestFromOpenDialog,
    ).toHaveBeenCalledWith(KEY)
  })

  it('removes a single attachment scoped to the draft key', () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))

    act(() => {
      result.current.removeOne('att-1')
    })

    expect(useAttachmentStore.getState().removeDraft).toHaveBeenCalledWith(
      KEY,
      'att-1',
    )
  })

  it('clears the draft scoped to the draft key', () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))

    act(() => {
      result.current.clearDraft()
    })

    expect(useAttachmentStore.getState().clearDraft).toHaveBeenCalledWith(KEY)
  })

  it('tracks drag-highlight state across enter/leave', () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))
    const noFiles = dragEventWithFiles([])

    expect(result.current.isDragging).toBe(false)

    act(() => result.current.dragHandlers.onDragEnter(noFiles))
    expect(result.current.isDragging).toBe(true)

    act(() => result.current.dragHandlers.onDragLeave(noFiles))
    expect(result.current.isDragging).toBe(false)
    expect(noFiles.preventDefault).toHaveBeenCalled()
  })

  it('ingests dropped files scoped to the draft key and resets the highlight', async () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', {
      type: 'image/png',
    })

    await act(async () => {
      result.current.dragHandlers.onDrop(dragEventWithFiles([file]))
    })

    await waitFor(() => {
      expect(useAttachmentStore.getState().ingestFiles).toHaveBeenCalledTimes(1)
    })
    const [key, inputs] = (
      useAttachmentStore.getState().ingestFiles as ReturnType<typeof vi.fn>
    ).mock.calls[0]
    expect(key).toBe(KEY)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toMatchObject({ name: 'shot.png', mimeType: 'image/png' })
    expect(result.current.isDragging).toBe(false)
  })

  it('does not ingest on drop when there are no files', async () => {
    const { result } = renderHook(() => useAttachmentDraft(KEY))

    await act(async () => {
      result.current.dragHandlers.onDrop(dragEventWithFiles([]))
    })

    expect(useAttachmentStore.getState().ingestFiles).not.toHaveBeenCalled()
  })

  it('auto-clears rejections after the TTL window', () => {
    vi.useFakeTimers()
    primeStore({
      drafts: {
        [KEY]: {
          items: [],
          rejections: [{ filename: 'big.bin', reason: 'too large' }],
          ingestInFlight: false,
        },
      },
    })

    renderHook(() => useAttachmentDraft(KEY))

    expect(useAttachmentStore.getState().clearRejections).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    expect(useAttachmentStore.getState().clearRejections).toHaveBeenCalledWith(
      KEY,
    )
  })
})
