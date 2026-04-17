import { describe, expect, it } from 'vitest'
import {
  isValidUtf8,
  mimeTypeForTextExtension,
  sniffMime,
} from './mime-sniff.pure'

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function textBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

describe('sniffMime', () => {
  it('detects PNG', () => {
    const png = bytes([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ])
    expect(sniffMime(png)).toEqual({ mimeType: 'image/png', kind: 'image' })
  })

  it('detects JPEG', () => {
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(sniffMime(jpeg)).toEqual({ mimeType: 'image/jpeg', kind: 'image' })
  })

  it('detects GIF87a', () => {
    const gif = bytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00])
    expect(sniffMime(gif)).toEqual({ mimeType: 'image/gif', kind: 'image' })
  })

  it('detects GIF89a', () => {
    const gif = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])
    expect(sniffMime(gif)).toEqual({ mimeType: 'image/gif', kind: 'image' })
  })

  it('detects WebP', () => {
    const webp = bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ])
    expect(sniffMime(webp)).toEqual({ mimeType: 'image/webp', kind: 'image' })
  })

  it('detects PDF', () => {
    const pdf = bytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    expect(sniffMime(pdf)).toEqual({
      mimeType: 'application/pdf',
      kind: 'pdf',
    })
  })

  it('treats valid UTF-8 as text/plain', () => {
    expect(sniffMime(textBytes('hello world'))).toEqual({
      mimeType: 'text/plain',
      kind: 'text',
    })
  })

  it('treats UTF-8 with BOM as text', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...textBytes('hi')])
    expect(sniffMime(withBom)).toEqual({
      mimeType: 'text/plain',
      kind: 'text',
    })
  })

  it('rejects invalid UTF-8 binary blobs', () => {
    const invalid = bytes([0xff, 0xfe, 0xfd, 0xfc, 0xfb])
    expect(sniffMime(invalid)).toBeNull()
  })

  it('does not misidentify PNG as text via magic-number match', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(sniffMime(png)?.kind).toBe('image')
  })

  it('does not classify RIFF without WEBP fourcc as an image', () => {
    const riffWav = bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ])
    expect(sniffMime(riffWav)?.kind).not.toBe('image')
  })

  it('rejects arbitrary binary not matching any signature and not valid UTF-8', () => {
    const garbage = bytes([0x00, 0xff, 0xfe, 0x80, 0x81, 0x82])
    expect(sniffMime(garbage)).toBeNull()
  })
})

describe('isValidUtf8', () => {
  it('accepts ascii', () => {
    expect(isValidUtf8(textBytes('abc'))).toBe(true)
  })

  it('accepts multibyte utf-8', () => {
    expect(isValidUtf8(textBytes('héllo 🌍'))).toBe(true)
  })

  it('rejects lone continuation bytes', () => {
    expect(isValidUtf8(new Uint8Array([0xc3, 0x28]))).toBe(false)
  })
})

describe('mimeTypeForTextExtension', () => {
  it('maps known extensions', () => {
    expect(mimeTypeForTextExtension('foo.ts')).toBe('text/x-typescript')
    expect(mimeTypeForTextExtension('README.md')).toBe('text/markdown')
    expect(mimeTypeForTextExtension('data.csv')).toBe('text/csv')
  })

  it('returns null for unknown extensions', () => {
    expect(mimeTypeForTextExtension('archive.zip')).toBeNull()
  })

  it('returns null for extensionless names', () => {
    expect(mimeTypeForTextExtension('Makefile')).toBeNull()
  })
})
