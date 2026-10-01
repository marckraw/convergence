import type { FC } from 'react'
import type { NotificationPrefs } from '@/entities/app-settings'
import { Button, ChoiceField, Switch } from '@convergence/ui'

interface NotificationsFieldsProps {
  prefs: NotificationPrefs
  platform: string | null
  /** Locks the test buttons while something else saves. */
  isSaving?: boolean
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

  const setEvent = (key: keyof NotificationPrefs['events'], value: boolean) => {
    onChange({ ...prefs, events: { ...prefs.events, [key]: value } })
  }

  const sectionRowClass =
    'border-border/60 py-3 first:pt-0 last:border-b-0 last:pb-0'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-card/45 p-4">
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
            <ChoiceField label={TOAST_LABEL} disabled={masterDisabled}>
              <Switch
                id="notif-toasts"
                checked={prefs.toasts}
                onCheckedChange={(next) => setChannel('toasts', next)}
              />
            </ChoiceField>
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <ChoiceField label={SOUND_LABEL} disabled={masterDisabled}>
              <Switch
                id="notif-sounds"
                checked={prefs.sounds}
                onCheckedChange={(next) => setChannel('sounds', next)}
              />
            </ChoiceField>
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <ChoiceField label={SYSTEM_LABEL} disabled={masterDisabled}>
              <Switch
                id="notif-system"
                checked={prefs.system}
                onCheckedChange={(next) => setChannel('system', next)}
              />
            </ChoiceField>
          </div>
          {isMac && (
            <div className={`border-b ${sectionRowClass}`}>
              <ChoiceField label={DOCK_BADGE_LABEL} disabled={masterDisabled}>
                <Switch
                  id="notif-dock-badge"
                  checked={prefs.dockBadge}
                  onCheckedChange={(next) => setChannel('dockBadge', next)}
                />
              </ChoiceField>
            </div>
          )}
          {isMac && (
            <div className={sectionRowClass}>
              <ChoiceField label={DOCK_BOUNCE_LABEL} disabled={masterDisabled}>
                <Switch
                  id="notif-dock-bounce"
                  checked={prefs.dockBounce}
                  onCheckedChange={(next) => setChannel('dockBounce', next)}
                />
              </ChoiceField>
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
            <ChoiceField label="Finished" disabled={masterDisabled}>
              <Switch
                id="notif-event-finished"
                checked={prefs.events.finished}
                onCheckedChange={(next) => setEvent('finished', next)}
              />
            </ChoiceField>
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <ChoiceField label="Needs input" disabled={masterDisabled}>
              <Switch
                id="notif-event-needs-input"
                checked={prefs.events.needsInput}
                onCheckedChange={(next) => setEvent('needsInput', next)}
              />
            </ChoiceField>
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <ChoiceField label="Needs approval" disabled={masterDisabled}>
              <Switch
                id="notif-event-needs-approval"
                checked={prefs.events.needsApproval}
                onCheckedChange={(next) => setEvent('needsApproval', next)}
              />
            </ChoiceField>
          </div>
          <div className={`border-b ${sectionRowClass}`}>
            <ChoiceField label="Errored" disabled={masterDisabled}>
              <Switch
                id="notif-event-errored"
                checked={prefs.events.errored}
                onCheckedChange={(next) => setEvent('errored', next)}
              />
            </ChoiceField>
          </div>
          <div className={sectionRowClass}>
            <ChoiceField label="Terminal idle" disabled={masterDisabled}>
              <Switch
                id="notif-event-terminal-idle"
                checked={prefs.events.terminalIdle}
                onCheckedChange={(next) => setEvent('terminalIdle', next)}
              />
            </ChoiceField>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-border/70 bg-card/45 p-4">
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
      </div>

      <div className="space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-medium">Try a test notification</p>
        <p className="text-xs text-muted-foreground">
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
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Claude Code reports fewer states than Codex — you&rsquo;ll receive
        &ldquo;Finished&rdquo; and &ldquo;Errored&rdquo; notifications for
        Claude Code agents but not &ldquo;Needs input&rdquo;.
      </p>
    </div>
  )
}
