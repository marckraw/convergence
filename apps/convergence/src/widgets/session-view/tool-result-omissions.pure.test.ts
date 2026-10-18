import { describe, expect, it } from 'vitest'
import { describeOmittedImages } from './tool-result-omissions.pure'

describe('describeOmittedImages', () => {
  it('says nothing when no image was left out', () => {
    const none = { count: 0, label: null, reasons: [] }
    expect(describeOmittedImages(undefined)).toEqual(none)
    expect(describeOmittedImages({})).toEqual(none)
    expect(describeOmittedImages({ 'image-too-large': 0 })).toEqual(none)
  })

  it('counts one image in the singular, with its reason alone', () => {
    expect(describeOmittedImages({ 'image-too-large': 1 })).toEqual({
      count: 1,
      label: '1 image left out',
      reasons: ['too large'],
    })
  })

  it('counts several images for one reason in the plural, without repeating the count', () => {
    expect(describeOmittedImages({ 'download-failed': 3 })).toEqual({
      count: 3,
      label: '3 images left out',
      reasons: ['couldn’t be downloaded from the host'],
    })
  })

  it('gives each reason its count when there are several, in a fixed order', () => {
    expect(
      describeOmittedImages({
        'storage-failed': 1,
        'session-limit': 2,
        'image-too-large': 1,
        'unsupported-mime-type': 1,
        'invalid-image': 1,
        'turn-limit': 1,
        'download-failed': 1,
      }),
    ).toEqual({
      count: 8,
      label: '8 images left out',
      reasons: [
        '1 too large',
        '1 not a supported image type',
        '1 not a valid image',
        '1 over the per-turn limit',
        '2 over the session limit',
        '1 couldn’t be downloaded from the host',
        '1 couldn’t be stored',
      ],
    })
  })

  it('ignores counts that are not a positive number of images', () => {
    expect(
      describeOmittedImages({
        'image-too-large': -2,
        'turn-limit': Number.NaN,
        'session-limit': 2.7,
      }),
    ).toEqual({
      count: 2,
      label: '2 images left out',
      reasons: ['over the session limit'],
    })
  })
})
