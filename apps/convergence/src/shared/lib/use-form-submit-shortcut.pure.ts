import { useEffect } from 'react'
import {
  formatShortcutLabel,
  runningShortcutPlatform,
  SUBMIT_SHORTCUT,
} from './keyboard-shortcut.pure'

/**
 * The key a form submits with, in words ("⌘↵", "Ctrl+Enter"): what
 * `useFormSubmitShortcut` listens for, so a form shows the key it answers to.
 */
export const SUBMIT_SHORTCUT_LABEL = formatShortcutLabel(
  SUBMIT_SHORTCUT,
  runningShortcutPlatform(),
)

/**
 * Hook to enable cmd+Enter (or ctrl+Enter on non-mac) to submit a form.
 *
 * Usage: Call this hook in a component that contains a form with a submit button.
 * The hook will listen for cmd+Enter and trigger the first submit button in the form.
 * It returns the key in words, for the submit button's tooltip (DS-34): pass
 * it to FormDialog's `saveShortcut`, or to the button's Tooltip `shortcut`.
 *
 * @param enabled - Whether the shortcut should be active
 * @param onSubmit - Callback to invoke when shortcut is triggered
 */
export function useFormSubmitShortcut(
  enabled: boolean,
  onSubmit: () => void,
): string {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger for cmd+Enter (mac) or ctrl+Enter (other platforms)
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const isShortcutKey = isMac ? e.metaKey : e.ctrlKey

      if (isShortcutKey && e.key === 'Enter') {
        // Prevent default browser behavior (e.g., new line in textarea)
        e.preventDefault()
        e.stopPropagation()
        onSubmit()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, onSubmit])
  return SUBMIT_SHORTCUT_LABEL
}
