// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isEditableTarget } from './editable-target.pure'

describe('isEditableTarget', () => {
  it.each(['input', 'textarea', 'select'])('recognizes %s', (tag) => {
    expect(isEditableTarget(document.createElement(tag))).toBe(true)
  })
  it('recognizes a contenteditable div', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    // jsdom does not implement the browser-computed isContentEditable property.
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isEditableTarget(div)).toBe(true)
  })
  it('rejects a button and null', () => {
    const button = document.createElement('button')
    Object.defineProperty(button, 'isContentEditable', { value: false })
    expect(isEditableTarget(button)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
