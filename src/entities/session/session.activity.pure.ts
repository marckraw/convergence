import type { ActivitySignal } from './session.types'

export function formatActivityLabel(
  activity: ActivitySignal | undefined,
): string | null {
  if (!activity) return null
  if (activity === 'streaming') return 'streaming…'
  if (activity === 'thinking') return 'thinking…'
  if (activity === 'compacting') return 'compacting context…'
  if (activity === 'waiting-approval') return 'awaiting approval'
  if (activity.startsWith('tool:')) {
    const name = activity.slice('tool:'.length).trim()
    return name ? `tool: ${name}` : 'tool'
  }
  return null
}
