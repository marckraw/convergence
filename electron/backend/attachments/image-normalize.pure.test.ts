import { describe, expect, it } from 'vitest'
import { normalizeImageBytes, stripJpegExif } from './image-normalize.pure'

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values)
}

const SOI = [0xff, 0xd8]
const EOI = [0xff, 0xd9]

function makeApp1Exif(bodyLen: number): number[] {
  const segmentLen = 2 + 6 + bodyLen
  return [
    0xff,
    0xe1,
    (segmentLen >> 8) & 0xff,
    segmentLen & 0xff,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    ...Array.from({ length: bodyLen }, () => 0x42),
  ]
}

function makeApp1Xmp(): number[] {
  const marker = 'http://ns.adobe.com/xap/1.0/\x00'
  const bodyBytes = Array.from(marker, (c) => c.charCodeAt(0))
  const segmentLen = 2 + bodyBytes.length
  return [0xff, 0xe1, (segmentLen >> 8) & 0xff, segmentLen & 0xff, ...bodyBytes]
}

function makeApp0Jfif(): number[] {
  const body = [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]
  const segmentLen = 2 + body.length
  return [0xff, 0xe0, (segmentLen >> 8) & 0xff, segmentLen & 0xff, ...body]
}

describe('stripJpegExif', () => {
  it('returns input unchanged for non-JPEG', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(stripJpegExif(png)).toEqual(png)
  })

  it('returns input unchanged for empty buffer', () => {
    const empty = new Uint8Array(0)
    expect(stripJpegExif(empty)).toEqual(empty)
  })

  it('strips an APP1-EXIF segment while preserving other segments', () => {
    const input = bytes([...SOI, ...makeApp1Exif(8), ...makeApp0Jfif(), ...EOI])
    const output = stripJpegExif(input)
    const expected = bytes([...SOI, ...makeApp0Jfif(), ...EOI])
    expect(Array.from(output)).toEqual(Array.from(expected))
  })

  it('preserves APP1 segments that are not EXIF (e.g. XMP)', () => {
    const input = bytes([...SOI, ...makeApp1Xmp(), ...makeApp0Jfif(), ...EOI])
    const output = stripJpegExif(input)
    expect(Array.from(output)).toEqual(Array.from(input))
  })

  it('strips EXIF even when multiple APP1 segments are present', () => {
    const input = bytes([
      ...SOI,
      ...makeApp1Exif(4),
      ...makeApp1Xmp(),
      ...makeApp1Exif(12),
      ...EOI,
    ])
    const output = stripJpegExif(input)
    const expected = bytes([...SOI, ...makeApp1Xmp(), ...EOI])
    expect(Array.from(output)).toEqual(Array.from(expected))
  })

  it('produces a smaller buffer when EXIF is present', () => {
    const input = bytes([...SOI, ...makeApp1Exif(32), ...EOI])
    const output = stripJpegExif(input)
    expect(output.length).toBeLessThan(input.length)
  })
})

describe('normalizeImageBytes', () => {
  it('strips EXIF for JPEG mime types', () => {
    const input = bytes([...SOI, ...makeApp1Exif(6), ...EOI])
    const output = normalizeImageBytes(input, 'image/jpeg')
    expect(output.length).toBeLessThan(input.length)
  })

  it('passes through PNG unchanged', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(normalizeImageBytes(png, 'image/png')).toEqual(png)
  })

  it('passes through WebP unchanged', () => {
    const webp = bytes([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    expect(normalizeImageBytes(webp, 'image/webp')).toEqual(webp)
  })
})
