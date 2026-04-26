import { beforeEach, describe, expect, it, vi } from 'vitest'

const ingestFiles = vi.fn()
const ingestFromPaths = vi.fn()
const deleteAttachment = vi.fn()

vi.mock('./attachment.api', () => ({
  attachmentApi: {
    ingestFiles: (...args: unknown[]) => ingestFiles(...args),
    ingestFromPaths: (...args: unknown[]) => ingestFromPaths(...args),
    delete: (...args: unknown[]) => deleteAttachment(...args),
  },
}))

import { useAttachmentStore } from './attachment.model'
import type { Attachment } from './attachment.types'

function makeAttachment(id: string, filename = 'x.png'): Attachment {
  return {
    id,
    sessionId: 's1',
    kind: 'image',
    mimeType: 'image/png',
    filename,
    sizeBytes: 4,
    storagePath: `/tmp/${id}.png`,
    thumbnailPath: null,
    textPreview: null,
    createdAt: new Date().toISOString(),
  }
}

describe('useAttachmentStore', () => {
  beforeEach(() => {
    ingestFiles.mockReset()
    ingestFromPaths.mockReset()
    deleteAttachment.mockReset()
    useAttachmentStore.setState({ drafts: {}, resolved: {} })
  })

  it('stores ingested attachments in the draft for the session', async () => {
    const att = makeAttachment('a1')
    ingestFiles.mockResolvedValue({ attachments: [att], rejections: [] })

    await useAttachmentStore
      .getState()
      .ingestFiles('s1', [
        { name: 'x.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
      ])

    const draft = useAttachmentStore.getState().getDraft('s1')
    expect(draft.items).toEqual([att])
    expect(draft.rejections).toEqual([])
    expect(draft.ingestInFlight).toBe(false)
  })

  it('appends subsequent ingest results to existing draft', async () => {
    ingestFiles
      .mockResolvedValueOnce({
        attachments: [makeAttachment('a1')],
        rejections: [],
      })
      .mockResolvedValueOnce({
        attachments: [makeAttachment('a2')],
        rejections: [{ filename: 'bad.bin', reason: 'Unsupported' }],
      })

    await useAttachmentStore.getState().ingestFiles('s1', [])
    await useAttachmentStore.getState().ingestFiles('s1', [])

    const draft = useAttachmentStore.getState().getDraft('s1')
    expect(draft.items.map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(draft.rejections).toEqual([
      { filename: 'bad.bin', reason: 'Unsupported' },
    ])
  })

  it('keeps drafts isolated per session', async () => {
    ingestFiles.mockResolvedValue({
      attachments: [makeAttachment('a1')],
      rejections: [],
    })

    await useAttachmentStore.getState().ingestFiles('s1', [])
    await useAttachmentStore.getState().ingestFiles('s2', [])

    expect(useAttachmentStore.getState().getDraft('s1').items).toHaveLength(1)
    expect(useAttachmentStore.getState().getDraft('s2').items).toHaveLength(1)
  })

  it('removes a draft attachment by id and calls backend delete', async () => {
    ingestFiles.mockResolvedValue({
      attachments: [makeAttachment('a1'), makeAttachment('a2')],
      rejections: [],
    })
    deleteAttachment.mockResolvedValue(undefined)

    await useAttachmentStore.getState().ingestFiles('s1', [])
    await useAttachmentStore.getState().removeDraft('s1', 'a1')

    expect(
      useAttachmentStore
        .getState()
        .getDraft('s1')
        .items.map((a) => a.id),
    ).toEqual(['a2'])
    expect(deleteAttachment).toHaveBeenCalledWith('a1')
  })

  it('clears a session draft entirely', async () => {
    ingestFiles.mockResolvedValue({
      attachments: [makeAttachment('a1')],
      rejections: [{ filename: 'x', reason: 'y' }],
    })

    await useAttachmentStore.getState().ingestFiles('s1', [])
    useAttachmentStore.getState().clearDraft('s1')

    const draft = useAttachmentStore.getState().getDraft('s1')
    expect(draft.items).toEqual([])
    expect(draft.rejections).toEqual([])
  })

  it('captures thrown ingest errors as rejections without crashing', async () => {
    ingestFiles.mockRejectedValue(new Error('nope'))
    await useAttachmentStore.getState().ingestFiles('s1', [])
    const draft = useAttachmentStore.getState().getDraft('s1')
    expect(draft.rejections[0]).toMatchObject({ reason: 'nope' })
    expect(draft.ingestInFlight).toBe(false)
  })

  it('clearRejections empties rejections list but keeps items', async () => {
    ingestFiles.mockResolvedValue({
      attachments: [makeAttachment('a1')],
      rejections: [{ filename: 'r', reason: 'x' }],
    })

    await useAttachmentStore.getState().ingestFiles('s1', [])
    useAttachmentStore.getState().clearRejections('s1')

    const draft = useAttachmentStore.getState().getDraft('s1')
    expect(draft.items).toHaveLength(1)
    expect(draft.rejections).toEqual([])
  })

  it('hydrateForSession populates the resolved map for that session', () => {
    const a = makeAttachment('a1')
    const b = makeAttachment('b1', 'b.png')
    useAttachmentStore.getState().hydrateForSession('s1', [a, b])

    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'a1'),
    ).toEqual(a)
    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'b1'),
    ).toEqual(b)
    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'unknown'),
    ).toBeUndefined()
  })

  it('ingestFiles also writes each new attachment into resolved', async () => {
    const att = makeAttachment('a1')
    ingestFiles.mockResolvedValue({ attachments: [att], rejections: [] })

    await useAttachmentStore.getState().ingestFiles('s1', [])

    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'a1'),
    ).toEqual(att)
  })

  it('clearDraft does not evict resolved entries', async () => {
    const att = makeAttachment('a1')
    ingestFiles.mockResolvedValue({ attachments: [att], rejections: [] })

    await useAttachmentStore.getState().ingestFiles('s1', [])
    useAttachmentStore.getState().clearDraft('s1')

    expect(useAttachmentStore.getState().getDraft('s1').items).toEqual([])
    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'a1'),
    ).toEqual(att)
  })

  it('hydrateForSession replaces (not merges) the resolved map for that session', () => {
    const oldA = makeAttachment('a1', 'old.png')
    const newA = makeAttachment('a1', 'new.png')
    const c = makeAttachment('c1', 'c.png')

    useAttachmentStore.getState().hydrateForSession('s1', [oldA, c])
    useAttachmentStore.getState().hydrateForSession('s1', [newA])

    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'a1')?.filename,
    ).toBe('new.png')
    expect(
      useAttachmentStore.getState().getResolvedAttachment('s1', 'c1'),
    ).toBeUndefined()
  })
})
