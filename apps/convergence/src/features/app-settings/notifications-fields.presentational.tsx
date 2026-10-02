import type { FC } from 'react'
import type { NotificationPrefs } from '@/entities/app-settings'
import {
  Button,
  Card,
  ChoiceField,
  SectionLabel,
  Switch,
} from '@convergence/ui'

interface NotificationsFieldsProps {
  prefs: NotificationPrefs
  platform: string | null
  /** Locks the test buttons while something else saves. */
  isSaving?: boolean
  onChange: (next: NotificationPrefs) => void
  onTestFire: (severity: 'info' | 'critical') => void
}

type ChannelKey = 'toasts' | 'sounds' | 'system' | 'dockBadge' | 'dockBounce'
type EventKey = keyof NotificationPrefs['events']

/** Where a notification can appear; the Dock's two only on a Mac. */
const CHANNELS: ReadonlyArray<{
  key: ChannelKey
  id: string
  label: string
  macOnly?: boolean
}> = [
  { key: 'toasts', id: 'notif-toasts', label: 'Toasts' },
  { key: 'sounds', id: 'notif-sounds', label: 'Sounds' },
  { key: 'system', id: 'notif-system', label: 'System notifications' },
  {
    key: 'dockBadge',
    id: 'notif-dock-badge',
    label: 'Dock badge',
    macOnly: true,
  },
  {
    key: 'dockBounce',
    id: 'notif-dock-bounce',
    label: 'Dock bounce',
    macOnly: true,
  },
]

/** Which agent states notify. */
const EVENTS: ReadonlyArray<{ key: EventKey; id: string; label: string }> = [
  { key: 'finished', id: 'notif-event-finished', label: 'Finished' },
  { key: 'needsInput', id: 'notif-event-needs-input', label: 'Needs input' },
  {
    key: 'needsApproval',
    id: 'notif-event-needs-approval',
    label: 'Needs approval',
  },
  { key: 'errored', id: 'notif-event-errored', label: 'Errored' },
  {
    key: 'terminalIdle',
    id: 'notif-event-terminal-idle',
    label: 'Terminal idle',
  },
]

/** A group of switches in a card: its eyebrow and line, then a row each. */
const groupHeader = 'border-b border-line-soft px-4 py-3'
const groupRows = 'divide-y divide-line-soft px-4 py-2'
const groupRow = 'py-3 first:pt-0 last:pb-0'

export const NotificationsFields: FC<NotificationsFieldsProps> = ({
  prefs,
  platform,
  isSaving = false,
  onChange,
  onTestFire,
}) => {
  const isMac = platform === 'darwin'
  const masterDisabled = !prefs.enabled

  const setChannel = <K extends keyof NotificationPrefs>(
    key: K,
    value: NotificationPrefs[K],
  ) => {
    onChange({ ...prefs, [key]: value })
  }

  const setEvent = (key: EventKey, value: boolean) => {
    onChange({ ...prefs, events: { ...prefs.events, [key]: value } })
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <ChoiceField
          label="Enable notifications"
          hint="Master switch. Turn this off to mute every channel."
        >
          <Switch
            id="notif-enabled"
            checked={prefs.enabled}
            onCheckedChange={(next) => setChannel('enabled', next)}
          />
        </ChoiceField>
      </Card>

      <Card render={<section />} padding="none">
        <div className={groupHeader}>
          <SectionLabel>Channels</SectionLabel>
          <p className="mt-1 text-xs text-ink-muted">
            Choose where notifications appear when an agent needs attention.
          </p>
        </div>
        <div className={groupRows}>
          {CHANNELS.filter((channel) => isMac || !channel.macOnly).map(
            (channel) => (
              <div key={channel.key} className={groupRow}>
                <ChoiceField label={channel.label} disabled={masterDisabled}>
                  <Switch
                    id={channel.id}
                    checked={prefs[channel.key]}
                    onCheckedChange={(next) => setChannel(channel.key, next)}
                  />
                </ChoiceField>
              </div>
            ),
          )}
        </div>
      </Card>

      <Card render={<section />} padding="none">
        <div className={groupHeader}>
          <SectionLabel>Events</SectionLabel>
          <p className="mt-1 text-xs text-ink-muted">
            Fine-tune which agent states should trigger a notification.
          </p>
        </div>
        <div className={groupRows}>
          {EVENTS.map((event) => (
            <div key={event.key} className={groupRow}>
              <ChoiceField label={event.label} disabled={masterDisabled}>
                <Switch
                  id={event.id}
                  checked={prefs.events[event.key]}
                  onCheckedChange={(next) => setEvent(event.key, next)}
                />
              </ChoiceField>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <ChoiceField
          label="Suppress when window is focused"
          hint="Hide toasts and silence sounds when Convergence is the active window."
          disabled={masterDisabled}
        >
          <Switch
            id="notif-suppress-focused"
            checked={prefs.suppressWhenFocused}
            onCheckedChange={(next) => setChannel('suppressWhenFocused', next)}
          />
        </ChoiceField>
      </Card>

      <Card surface="dashed" className="space-y-2">
        <p className="text-xs font-medium">Try a test notification</p>
        <p className="text-xs text-ink-muted">
          Useful for triggering the macOS permission prompt the first time.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onTestFire('info')}
            disabled={isSaving}
          >
            Soft
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onTestFire('critical')}
            disabled={isSaving}
          >
            Alert
          </Button>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-ink-muted">
        Claude Code reports fewer states than Codex — you&rsquo;ll receive
        &ldquo;Finished&rdquo; and &ldquo;Errored&rdquo; notifications for
        Claude Code agents but not &ldquo;Needs input&rdquo;.
      </p>
    </div>
  )
}
