import { describe, expect, it, vi } from 'vitest'
import { answerLoomKey, type LoomKeyEvent } from './loom-keys.pure'

/** An element as `isLoomSearchShortcut` reads one: its tag, and nothing typed in it. */
const element = (tagName: string) => ({
  tagName,
  isContentEditable: false,
  getAttribute: () => null,
})

const keyDown = (
  key: string,
  extra: Partial<Omit<LoomKeyEvent, 'key'>> = {},
) => ({
  key,
  target: element('BUTTON'),
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
})

const doors = (escape: boolean) => ({
  onShortcut: vi.fn(),
  onEscape: escape ? vi.fn() : undefined,
})

describe('MC-35: Loom answers its keys one way in both shapes', () => {
  it('`/` outside a text input focuses search, and does not type itself', () => {
    const event = keyDown('/')
    const to = doors(true)
    answerLoomKey(event, to)
    // Mutation: drop the preventDefault -> the `/` lands in the field, red.
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(to.onShortcut).toHaveBeenCalledOnce()
    // The shortcut is the only answer, and it is not stopped: only an
    // Escape that Loom answers is.
    expect(to.onEscape).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it('`/` inside a text input, or with a modifier, is not Loom’s', () => {
    for (const event of [
      keyDown('/', { target: element('INPUT') }),
      keyDown('/', { metaKey: true }),
      keyDown('/', { ctrlKey: true }),
    ]) {
      const to = doors(true)
      answerLoomKey(event, to)
      expect(to.onShortcut).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
  })

  it('Escape, when the shape has a door for it, stops at Loom and goes through it', () => {
    const event = keyDown('Escape')
    const to = doors(true)
    answerLoomKey(event, to)
    // Mutation: let Escape bubble -> the views around Loom read it too, red.
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(to.onEscape).toHaveBeenCalledOnce()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(to.onShortcut).not.toHaveBeenCalled()
  })

  it('Escape with no door is left alone, to go on past Loom', () => {
    // Compact with nothing searched and no detail open: Escape is not Loom's.
    // Mutation: stop it whatever the doors say -> red.
    const event = keyDown('Escape')
    answerLoomKey(event, doors(false))
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('any other key is not Loom’s', () => {
    const event = keyDown('a')
    const to = doors(true)
    answerLoomKey(event, to)
    expect(to.onShortcut).not.toHaveBeenCalled()
    expect(to.onEscape).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
