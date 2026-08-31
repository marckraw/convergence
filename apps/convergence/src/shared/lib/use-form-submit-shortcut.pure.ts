import { useEffect } from 'react'

/**
 * Hook to enable cmd+Enter (or ctrl+Enter on non-mac) to submit a form.
 *
 * Usage: Call this hook in a component that contains a form with a submit button.
 * The hook will listen for cmd+Enter and trigger the first submit button in the form.
 *
 * @param enabled - Whether the shortcut should be active
 * @param onSubmit - Callback to invoke when shortcut is triggered
 */
export function useFormSubmitShortcut(
  enabled: boolean,
  onSubmit: () => void,
): void {
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
}
