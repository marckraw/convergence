import { describe, expect, it } from 'vitest'
import {
  chatGptAppState,
  selectChatGptApps,
} from './provider-account-chatgpt-apps.pure'

const info = {
  id: 'figma',
  name: 'Figma',
  installUrl: 'https://chatgpt.com/apps/figma',
  isEnabled: true,
  isAccessible: true,
}

describe('MAR-3458 R2 availability, never sign-in health', () => {
  for (const isEnabled of [false, true])
    for (const enabled of [false, true])
      for (const callable of [false, true])
        for (const isAccessible of [false, true])
          for (const present of [false, true]) {
            it(`isEnabled=${isEnabled} enabled=${enabled} callable=${callable} accessible=${isAccessible} installed=${present}`, () => {
              const installed = present
                ? { id: 'figma', runtimeName: 'Figma', enabled, callable }
                : undefined
              const expected =
                !isEnabled || (present && !enabled)
                  ? 'off'
                  : present && callable
                    ? 'available'
                    : 'unavailable'
              expect(
                chatGptAppState(
                  { ...info, isEnabled, isAccessible },
                  installed,
                ),
              ).toBe(expected)
            })
          }
  it('does not infer availability without runtime evidence', () => {
    expect(chatGptAppState(undefined, undefined)).toBe('unavailable')
  })
})

it('R1 includes the installed/accessibility union, deduplicated and sorted, not the directory', () => {
  expect(
    selectChatGptApps(
      [
        info,
        {
          ...info,
          id: 'directory',
          name: 'Directory only',
          isAccessible: false,
        },
        { ...info, id: 'accessible', name: 'Accessible only' },
      ],
      [
        { id: 'figma', runtimeName: 'Figma', enabled: true, callable: true },
        {
          id: 'installed',
          runtimeName: 'Installed only',
          enabled: false,
          callable: false,
        },
      ],
    ),
  ).toEqual([
    { id: 'accessible', name: 'Accessible only', state: 'unavailable' },
    { id: 'figma', name: 'Figma', state: 'available' },
    { id: 'installed', name: 'Installed only', state: 'off' },
  ])
})
