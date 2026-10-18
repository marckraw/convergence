import { describe, expect, it } from 'vitest'
import {
  EXECUTION_TOOL_ATTACHMENT_MAX_BYTES,
  EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT,
  type ExecutionToolAttachment,
} from '@mrck-labs/execution-host-protocol'
import { planToolImageDownloads } from './remote-tool-images.pure'

function reference(
  id: string,
  overrides: Partial<ExecutionToolAttachment> = {},
): ExecutionToolAttachment {
  return {
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: 1024,
    width: 32,
    height: 32,
    ...overrides,
  }
}

describe('planToolImageDownloads', () => {
  it('downloads each image to at most the size its reference gave', () => {
    const plan = planToolImageDownloads([
      reference('a'),
      reference('b', { sizeBytes: 7, mimeType: 'IMAGE/JPEG' }),
    ])
    expect(plan.downloads).toEqual([
      { attachment: reference('a'), maxBytes: 1024 },
      {
        attachment: reference('b', { sizeBytes: 7, mimeType: 'IMAGE/JPEG' }),
        maxBytes: 7,
      },
    ])
    expect(plan.omissions).toEqual({})
  })

  /** Mutation: drop the count bound and nine requests go out. */
  it('asks for no more than the protocol allows a result, and counts the rest', () => {
    const references = Array.from(
      { length: EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT + 2 },
      (_, index) => reference(`img-${index}`),
    )
    const plan = planToolImageDownloads(references)
    expect(plan.downloads).toHaveLength(EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT)
    expect(plan.omissions).toEqual({ 'turn-limit': 2 })
  })

  it('never asks for what it could not show', () => {
    const plan = planToolImageDownloads([
      reference('pdf', { mimeType: 'application/pdf' }),
      reference('huge', { sizeBytes: EXECUTION_TOOL_ATTACHMENT_MAX_BYTES + 1 }),
      reference('empty', { sizeBytes: 0 }),
      reference('fraction', { sizeBytes: 1.5 }),
      reference('ok', { sizeBytes: EXECUTION_TOOL_ATTACHMENT_MAX_BYTES }),
    ])
    expect(plan.downloads.map((download) => download.attachment.id)).toEqual([
      'ok',
    ])
    expect(plan.omissions).toEqual({
      'unsupported-mime-type': 1,
      'image-too-large': 1,
      'invalid-image': 2,
    })
  })

  it('counts a refused reference against nothing, so the next one still fits', () => {
    const references = [
      reference('pdf', { mimeType: 'application/pdf' }),
      ...Array.from({ length: EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT }, (_, i) =>
        reference(`img-${i}`),
      ),
    ]
    const plan = planToolImageDownloads(references)
    expect(plan.downloads).toHaveLength(EXECUTION_TOOL_ATTACHMENTS_MAX_COUNT)
    expect(plan.omissions).toEqual({ 'unsupported-mime-type': 1 })
  })
})
