import type { ChangeEvent, FC } from 'react'
import {
  formatLocalModelTunnelEndpoint,
  type LocalModelTunnelProfileInput,
  type LocalModelTunnelProfileWithStatus,
} from '@/entities/local-model-tunnel'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SwitchRow } from '@/shared/ui/switch'
import { Trash2 } from 'lucide-react'
import { StatusDot } from './status-dot.presentational'
import { TunnelActionButtons } from './tunnel-action-buttons.presentational'

interface TunnelProfileEditorProps {
  item: LocalModelTunnelProfileWithStatus
  draft: LocalModelTunnelProfileInput
  error: string | null
  isMutating: boolean
  onDraftChange: (draft: LocalModelTunnelProfileInput) => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onSave: () => void
  onDelete: () => void
}

export const TunnelProfileEditor: FC<TunnelProfileEditorProps> = ({
  item,
  draft,
  error,
  isMutating,
  onDraftChange,
  onStart,
  onStop,
  onRestart,
  onSave,
  onDelete,
}) => {
  const patchDraft = (patch: LocalModelTunnelProfileInput) =>
    onDraftChange({ ...draft, ...patch })
  const updateString =
    (key: keyof LocalModelTunnelProfileInput) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      patchDraft({ [key]: event.target.value })
    }
  const updatePort =
    (key: keyof LocalModelTunnelProfileInput) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      const port = Number.isFinite(value)
        ? Math.min(65535, Math.max(1, Math.floor(value)))
        : 1
      patchDraft({ [key]: port })
    }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <StatusDot state={item.status.state} />
          <span>{item.profile.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {item.status.state}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatLocalModelTunnelEndpoint(item)}
        </p>
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Profile')}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Display name
            </span>
            <Input value={draft.name ?? ''} onChange={updateString('name')} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              SSH target
            </span>
            <Input
              value={draft.sshTarget ?? ''}
              onChange={updateString('sshTarget')}
            />
          </label>
        </div>
        <SwitchRow
          id="local-model-tunnel-autostart"
          label="Start when Convergence opens"
          checked={!!draft.autoStart}
          onChange={(next) => patchDraft({ autoStart: next })}
        />
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Forwarding')}
        <SwitchRow
          id="local-model-tunnel-custom-bind"
          label="Use custom local bind IP"
          description="Leave off to bind to 127.0.0.1."
          checked={!!draft.useCustomLocalBindHost}
          onChange={(next) => patchDraft({ useCustomLocalBindHost: next })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Local bind IP
            </span>
            <Input
              value={draft.localBindHost ?? '127.0.0.1'}
              disabled={!draft.useCustomLocalBindHost}
              onChange={updateString('localBindHost')}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Local port
            </span>
            <Input
              type="number"
              min={1}
              max={65535}
              value={draft.localPort ?? 11434}
              onChange={updatePort('localPort')}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Remote IP or hostname
            </span>
            <Input
              value={draft.remoteHost ?? ''}
              onChange={updateString('remoteHost')}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Remote port
            </span>
            <Input
              type="number"
              min={1}
              max={65535}
              value={draft.remotePort ?? 11434}
              onChange={updatePort('remotePort')}
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Health')}
        <SwitchRow
          id="local-model-tunnel-health"
          label="Check a health URL after connecting"
          checked={!!draft.healthCheckEnabled}
          onChange={(next) => patchDraft({ healthCheckEnabled: next })}
        />
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Health URL
          </span>
          <Input
            value={draft.healthCheckUrl ?? ''}
            disabled={!draft.healthCheckEnabled}
            onChange={updateString('healthCheckUrl')}
          />
        </label>
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Command preview')}
        <code className="block overflow-x-auto rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground/85">
          {item.status.commandPreview}
        </code>
      </section>

      {item.status.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {item.status.error}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TunnelActionButtons
            state={item.status.state}
            managed={item.status.managed}
            isMutating={isMutating}
            onStart={onStart}
            onStop={onStop}
            onRestart={onRestart}
            onManage={() => undefined}
          />
          <Button type="button" onClick={onSave} disabled={isMutating}>
            Save profile
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={isMutating}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  )
}

function renderSectionLabel(label: string) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
  )
}
