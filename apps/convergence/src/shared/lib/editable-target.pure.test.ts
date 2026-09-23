// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'
import { isEditableTarget, isListboxTarget } from './editable-target.pure'

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

  it('reads plain target shapes without changing Loom shortcut semantics', () => {
    expect(isEditableTarget({ tagName: 'input' })).toBe(true)
    expect(isEditableTarget({ isContentEditable: true })).toBe(true)
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget(new EventTarget())).toBe(false)
    expect(isEditableTarget(undefined)).toBe(false)
  })
})

describe('isListboxTarget', () => {
  it.each(['option', 'listbox'])(
    'recognizes role %s without making it editable',
    (role) => {
      const element = document.createElement('div')
      element.setAttribute('role', role)
      expect(isListboxTarget(element)).toBe(true)
      expect(isEditableTarget(element)).toBe(false)
    },
  )

  it('rejects other roles, missing roles and non-elements', () => {
    const element = document.createElement('div')
    element.setAttribute('role', 'button')
    expect(isListboxTarget(element)).toBe(false)
    expect(isListboxTarget(document.createElement('button'))).toBe(false)
    expect(isListboxTarget(new EventTarget())).toBe(false)
    expect(isListboxTarget(null)).toBe(false)
    expect(isListboxTarget(undefined)).toBe(false)
  })
})

describe('one editable-target predicate', () => {
  it(
    'keeps editable field markers in only the shared helper under src',
    { timeout: WALK_TEST_TIMEOUT_MS },
    () => {
      const sourceRoot = resolve(__dirname, '../..')
      for (const marker of ['isContentEditable', "'TEXTAREA'"]) {
        const matches = execFileSync(
          'git',
          [
            'grep',
            '--untracked',
            '-l',
            '-F',
            '-e',
            marker,
            '--',
            '.',
            ':(exclude)**/*.test.*',
            ':(exclude)**/*.spec.*',
          ],
          {
            cwd: sourceRoot,
            encoding: 'utf8',
            timeout: WALK_TEST_TIMEOUT_MS,
          },
        )
        expect(matches.trim().split('\n')).toEqual([
          'shared/lib/editable-target.pure.ts',
        ])
      }
    },
  )
})
