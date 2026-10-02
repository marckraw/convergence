import { describe, expect, it } from 'vitest'
import {
  composerDrivenList,
  composerKeyedPicker,
  type ComposerPickers,
} from './composer-pickers.pure'

const closed = { open: false, count: 0, active: 0 }

/** Every picker closed, with `overrides` on top. */
function pickers(overrides: Partial<ComposerPickers> = {}): ComposerPickers {
  return {
    root: closed,
    mention: closed,
    skill: closed,
    prompt: closed,
    ...overrides,
  }
}

describe('composerDrivenList', () => {
  it('names nothing while every picker is closed', () => {
    expect(composerDrivenList(pickers())).toBeNull()
  })

  it('names the open picker and its active row', () => {
    expect(
      composerDrivenList(
        pickers({ mention: { open: true, count: 3, active: 2 } }),
      ),
    ).toEqual({ kind: 'mention', active: 2 })
  })

  it('names no list while it loads or failed to load', () => {
    expect(
      composerDrivenList(
        pickers({ skill: { open: true, count: 2, active: 0, waiting: true } }),
      ),
    ).toBeNull()
  })

  it('names no row that is not there: an empty list, or an active row past it', () => {
    expect(
      composerDrivenList(
        pickers({ root: { open: true, count: 0, active: 0 } }),
      ),
    ).toBeNull()
    expect(
      composerDrivenList(
        pickers({ prompt: { open: true, count: 2, active: 2 } }),
      ),
    ).toBeNull()
    expect(
      composerDrivenList(
        pickers({ prompt: { open: true, count: 2, active: -1 } }),
      ),
    ).toBeNull()
  })
})

describe('composerKeyedPicker', () => {
  it('leaves the keys to the field while every picker is closed', () => {
    expect(composerKeyedPicker(pickers())).toBeNull()
  })

  it('gives the keys to the open picker, with its rows and its active row', () => {
    expect(
      composerKeyedPicker(
        pickers({ root: { open: true, count: 4, active: 1 } }),
      ),
    ).toEqual({ kind: 'root', count: 4, active: 1 })
  })

  it('gives none to an empty root or mention picker, which is not drawn', () => {
    expect(
      composerKeyedPicker(
        pickers({ root: { open: true, count: 0, active: 0 } }),
      ),
    ).toBeNull()
    expect(
      composerKeyedPicker(
        pickers({ mention: { open: true, count: 0, active: 0 } }),
      ),
    ).toBeNull()
  })

  it('gives an empty, loading or failed skill or prompt picker its keys, so Escape closes it', () => {
    expect(
      composerKeyedPicker(
        pickers({ skill: { open: true, count: 0, active: 0, waiting: true } }),
      ),
    ).toEqual({ kind: 'skill', count: 0, active: 0 })
    expect(
      composerKeyedPicker(
        pickers({ prompt: { open: true, count: 0, active: 0 } }),
      ),
    ).toEqual({ kind: 'prompt', count: 0, active: 0 })
  })
})
