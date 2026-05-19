import { describe, expect, it } from 'vitest'
import { getNullDevicePath } from './null-device.pure'

describe('getNullDevicePath', () => {
  it('uses the Windows null device on Windows', () => {
    expect(getNullDevicePath('win32')).toBe('NUL')
  })

  it('uses /dev/null outside Windows', () => {
    expect(getNullDevicePath('darwin')).toBe('/dev/null')
    expect(getNullDevicePath('linux')).toBe('/dev/null')
  })
})
