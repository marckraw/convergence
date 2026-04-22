import type { FC } from 'react'
import type { NotificationPrefs } from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { SwitchRow } from '@/shared/ui/switch'

interface NotificationsFieldsProps {
  prefs: NotificationPrefs
  platform: string | null
  isSaving: boolean
  onChange: (next: NotificationPrefs) => void
  onTestFire: (severity: 'info' | 'critical') => void
}

const TOAST_LABEL = 'Toasts'
const SOUND_LABEL = 'Sounds'
const SYSTEM_LABEL = 'System notifications'
const DOCK_BADGE_LABEL = 'Dock badge'
const DOCK_BOUNCE_LABEL = 'Dock bounce'

export const NotificationsFields: FC<NotificationsFieldsProps> = ({
  prefs,
  platform,
  isSaving,
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

  const setEvent = (key: keyof NotificationPrefs['events'], value: boolean) => {
    onChange({ ...prefs, events: { ...prefs.events, [key]: value } })
  }

  const sectionRowClass =
    'border-border/60 py-3 first:pt-0 last:border-b-0 last:pb-0'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card/45 p-4">
        <SwitchRow
          id="notif-enabled"
          label="Enable notifications"
          description="Master switch. Turn this off to mute every channel."
          checked={prefs.enabled}
          onChange={(next) => setChannel('enabled', next)}
        />
      </div>

      <section className="rounded-xl border border-border/70 bg-card/45">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose where notifications appear when an agent needs attention.
          </p>
        </div>
        <div className="space-y-0 px-4 py-2">
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-toasts"
              label={TOAST_LABEL}
              checked={prefs.toasts}
              disabled={masterDisabled}
              onChange={(next) => setChannel('toasts', next)}
            />
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-sounds"
              label={SOUND_LABEL}
              checked={prefs.sounds}
              disabled={masterDisabled}
              onChange={(next) => setChannel('sounds', next)}
            />
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-system"
              label={SYSTEM_LABEL}
              checked={prefs.system}
              disabled={masterDisabled}
              onChange={(next) => setChannel('system', next)}
            />
          </div>
          {isMac && (
            <div className={`border-b ${sectionRowClass}`}>
              <SwitchRow
                id="notif-dock-badge"
                label={DOCK_BADGE_LABEL}
                checked={prefs.dockBadge}
                disabled={masterDisabled}
                onChange={(next) => setChannel('dockBadge', next)}
              />
            </div>
          )}
          {isMac && (
            <div className={sectionRowClass}>
              <SwitchRow
                id="notif-dock-bounce"
                label={DOCK_BOUNCE_LABEL}
                checked={prefs.dockBounce}
                disabled={masterDisabled}
                onChange={(next) => setChannel('dockBounce', next)}
              />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card/45">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Events
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fine-tune which agent states should trigger a notification.
          </p>
        </div>
        <div className="space-y-0 px-4 py-2">
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-event-finished"
              label="Finished"
              checked={prefs.events.finished}
              disabled={masterDisabled}
              onChange={(next) => setEvent('finished', next)}
            />
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-event-needs-input"
              label="Needs input"
              checked={prefs.events.needsInput}
              disabled={masterDisabled}
              onChange={(next) => setEvent('needsInput', next)}
            />
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <SwitchRow
              id="notif-event-needs-approval"
              label="Needs approval"
              checked={prefs.events.needsApproval}
              disabled={masterDisabled}
              onChange={(next) => setEvent('needsApproval', next)}
            />
          </div>
          <div className={sectionRowClass}>
            <SwitchRow
              id="notif-event-errored"
              label="Errored"
              checked={prefs.events.errored}
              disabled={masterDisabled}
              onChange={(next) => setEvent('errored', next)}
            />
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-border/70 bg-card/45 p-4">
        <SwitchRow
          id="notif-suppress-focused"
          label="Suppress when window is focused"
          description="Hide toasts and silence sounds when Convergence is the active window."
          checked={prefs.suppressWhenFocused}
          disabled={masterDisabled}
          onChange={(next) => setChannel('suppressWhenFocused', next)}
        />
      </div>

      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-medium">Try a test notification</p>
        <p className="text-xs text-muted-foreground">
          Useful for triggering the macOS permission prompt the first time.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTestFire('info')}
            disabled={isSaving}
          >
            Soft
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onTestFire('critical')}
            disabled={isSaving}
          >
            Alert
          </Button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Claude Code reports fewer states than Codex — you&rsquo;ll receive
        &ldquo;Finished&rdquo; and &ldquo;Errored&rdquo; notifications for
        Claude Code agents but not &ldquo;Needs input&rdquo;.
      </p>
    </div>
  )
}
