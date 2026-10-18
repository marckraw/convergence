import { describe, expect, it } from 'vitest'
import {
  MAX_TOOL_IMAGE_BYTES,
  MAX_TOOL_IMAGES_PER_RESULT,
} from '../../attachments/attachments.constants'
import {
  hasClaudeToolImages,
  readClaudeToolResultImages,
} from './claude-tool-images.pure'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function image(mediaType: string, data: string, sourceType = 'base64') {
  return {
    type: 'image',
    source: { type: sourceType, media_type: mediaType, data },
  }
}

describe('readClaudeToolResultImages', () => {
  it('decodes base64 images and names them by order and media type', () => {
    const read = readClaudeToolResultImages([
      { type: 'text', text: 'Screenshot taken' },
      image('image/png', base64(PNG_BYTES)),
      image('image/jpeg', base64(new Uint8Array([1, 2, 3]))),
      image('image/gif', base64(new Uint8Array([4]))),
      image('image/webp', base64(new Uint8Array([5, 6]))),
    ])

    expect(read.omissions).toEqual({})
    expect(read.images).toEqual([
      { name: 'tool-image-1.png', mimeType: 'image/png', bytes: PNG_BYTES },
      {
        name: 'tool-image-2.jpg',
        mimeType: 'image/jpeg',
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        name: 'tool-image-3.gif',
        mimeType: 'image/gif',
        bytes: new Uint8Array([4]),
      },
      {
        name: 'tool-image-4.webp',
        mimeType: 'image/webp',
        bytes: new Uint8Array([5, 6]),
      },
    ])
    // Plain bytes, not a view into Node's shared Buffer pool.
    expect(read.images[0].bytes.constructor).toBe(Uint8Array)
    expect(read.images[0].bytes.buffer.byteLength).toBe(PNG_BYTES.byteLength)
  })

  it('reads nothing from text-only, string or missing content', () => {
    for (const content of [
      'plain output',
      [{ type: 'text', text: 'ok' }],
      undefined,
      null,
      [null, 7, 'image'],
    ]) {
      const read = readClaudeToolResultImages(content)
      expect(read).toEqual({ images: [], omissions: {} })
      expect(hasClaudeToolImages(read)).toBe(false)
    }
  })

  it('counts an unsupported media type or a non-base64 source', () => {
    const read = readClaudeToolResultImages([
      image('image/svg+xml', base64(PNG_BYTES)),
      image('application/pdf', base64(PNG_BYTES)),
      { type: 'image', source: { type: 'url', url: 'https://x.test/a.png' } },
      { type: 'image' },
      image('image/png', base64(PNG_BYTES)),
    ])

    expect(read.omissions).toEqual({ 'unsupported-mime-type': 4 })
    expect(read.images).toHaveLength(1)
    expect(hasClaudeToolImages(read)).toBe(true)
  })

  it('counts invalid or empty base64 as an invalid image', () => {
    const read = readClaudeToolResultImages([
      image('image/png', 'not base64!'),
      image('image/png', 'abc'),
      image('image/png', ''),
      { type: 'image', source: { type: 'base64', media_type: 'image/png' } },
    ])

    expect(read).toEqual({ images: [], omissions: { 'invalid-image': 4 } })
    expect(hasClaudeToolImages(read)).toBe(true)
  })

  it('keeps an image at the size limit and counts one past it', () => {
    const atLimit = base64(new Uint8Array(MAX_TOOL_IMAGE_BYTES))
    const pastLimit = base64(new Uint8Array(MAX_TOOL_IMAGE_BYTES + 1))
    const read = readClaudeToolResultImages([
      image('image/png', atLimit),
      image('image/png', pastLimit),
    ])

    expect(read.omissions).toEqual({ 'image-too-large': 1 })
    expect(read.images).toHaveLength(1)
    expect(read.images[0].bytes.byteLength).toBe(MAX_TOOL_IMAGE_BYTES)
  })

  it('leaves an oversized image undecoded, even when it is not base64', () => {
    const tooLarge = '!'.repeat(Math.ceil((MAX_TOOL_IMAGE_BYTES * 4) / 3) + 8)
    const read = readClaudeToolResultImages([
      image('image/png', tooLarge),
      image('image/png', base64(PNG_BYTES)),
    ])

    expect(read.omissions).toEqual({ 'image-too-large': 1 })
    expect(read.images).toHaveLength(1)
  })

  it('counts the images past the per-result limit as the turn limit', () => {
    const extra = 3
    const read = readClaudeToolResultImages([
      image('image/png', 'bad!'),
      ...Array.from({ length: MAX_TOOL_IMAGES_PER_RESULT + extra }, (_, i) =>
        image('image/png', base64(new Uint8Array([i + 1]))),
      ),
    ])

    expect(read.images).toHaveLength(MAX_TOOL_IMAGES_PER_RESULT)
    expect(read.images.at(-1)?.name).toBe(
      `tool-image-${MAX_TOOL_IMAGES_PER_RESULT}.png`,
    )
    expect(read.images.at(-1)?.bytes).toEqual(
      new Uint8Array([MAX_TOOL_IMAGES_PER_RESULT]),
    )
    // An invalid image does not take one of the kept places.
    expect(read.omissions).toEqual({ 'invalid-image': 1, 'turn-limit': extra })
  })

  it('normalizes the media type it is given', () => {
    const read = readClaudeToolResultImages([
      image(' IMAGE/PNG ', base64(PNG_BYTES)),
    ])

    expect(read.images[0]).toMatchObject({
      name: 'tool-image-1.png',
      mimeType: 'image/png',
    })
  })
})
