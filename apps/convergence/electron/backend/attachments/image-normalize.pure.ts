const EXIF_MAGIC = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
}

function hasExifMagic(bytes: Uint8Array, offset: number): boolean {
  if (bytes.length < offset + EXIF_MAGIC.length) return false
  for (let k = 0; k < EXIF_MAGIC.length; k += 1) {
    if (bytes[offset + k] !== EXIF_MAGIC[k]) return false
  }
  return true
}

export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) return bytes

  const chunks: Uint8Array[] = []
  chunks.push(bytes.subarray(0, 2))
  let i = 2

  while (i < bytes.length - 1) {
    while (i < bytes.length - 1 && bytes[i] === 0xff && bytes[i + 1] === 0xff) {
      i += 1
    }
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]

    if (marker === 0xd9) {
      chunks.push(bytes.subarray(i, i + 2))
      break
    }

    if (marker === 0xda) {
      if (i + 4 > bytes.length) break
      const sosLen = (bytes[i + 2] << 8) | bytes[i + 3]
      let j = i + 2 + sosLen
      while (j < bytes.length - 1) {
        if (
          bytes[j] === 0xff &&
          bytes[j + 1] !== 0x00 &&
          !(bytes[j + 1] >= 0xd0 && bytes[j + 1] <= 0xd7)
        ) {
          break
        }
        j += 1
      }
      chunks.push(bytes.subarray(i, j))
      i = j
      continue
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(bytes.subarray(i, i + 2))
      i += 2
      continue
    }

    if (i + 4 > bytes.length) break
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    const segEnd = i + 2 + length
    if (segEnd > bytes.length) break

    if (marker === 0xe1 && hasExifMagic(bytes, i + 4)) {
      i = segEnd
      continue
    }

    chunks.push(bytes.subarray(i, segEnd))
    i = segEnd
  }

  let totalLen = 0
  for (const c of chunks) totalLen += c.length
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export function normalizeImageBytes(
  bytes: Uint8Array,
  mimeType: string,
): Uint8Array {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return stripJpegExif(bytes)
  }
  return bytes
}
