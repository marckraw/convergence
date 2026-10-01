import type { ChangeEvent, FC } from 'react'
import {
  formatLocalModelTunnelConnectionLabel,
  formatLocalModelTunnelEndpoint,
  formatLocalModelTunnelStatusDetail,
  selectLocalModelTunnelProfileWarnings,
  type LocalModelTunnelConnectionKind,
  type LocalModelTunnelProfileInput,
  type LocalModelTunnelProfileWithStatus,
  type LocalModelTunnelRouteCandidate,
} from '@/entities/local-model-tunnel'
import {
  Button,
  IconButton,
  ChoiceField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@convergence/ui'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
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
  const connectionKind = draft.connectionKind ?? item.profile.connectionKind
  const isSshTunnel = connectionKind === 'ssh-tunnel'
  const warnings = selectLocalModelTunnelProfileWarnings(draft)
  const patchDraft = (patch: LocalModelTunnelProfileInput) =>
    onDraftChange(syncRouteCandidateDraft({ ...draft, ...patch }, patch))
  const updateConnectionKind = (next: string) => {
    patchDraft({
      connectionKind: next as LocalModelTunnelConnectionKind,
      autoStart: next === 'ssh-tunnel' ? draft.autoStart : false,
      allowExternal: next === 'ssh-tunnel' ? draft.allowExternal : false,
    })
  }
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
  const updateRouteString =
    (routeId: string, key: keyof LocalModelTunnelRouteCandidate) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      patchDraft({
        routeCandidates: updateRouteCandidate(draft, routeId, {
          [key]: event.target.value,
        }),
      })
    }
  const updateRoutePort =
    (routeId: string, key: keyof LocalModelTunnelRouteCandidate) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value)
      const port = Number.isFinite(value)
        ? Math.min(65535, Math.max(1, Math.floor(value)))
        : 1
      patchDraft({
        routeCandidates: updateRouteCandidate(draft, routeId, {
          [key]: port,
        }),
      })
    }
  const updateRouteTimeout =
    (routeId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value.trim()
      const timeout = value ? Number(value) : null
      patchDraft({
        routeCandidates: updateRouteCandidate(draft, routeId, {
          connectTimeoutSeconds:
            typeof timeout === 'number' && Number.isFinite(timeout)
              ? Math.min(120, Math.max(1, Math.floor(timeout)))
              : null,
        }),
      })
    }
  const addRouteCandidate = () => {
    patchDraft({
      routeCandidates: [
        ...(draft.routeCandidates ?? []),
        createRouteCandidateDraft(draft),
      ],
    })
  }
  const removeRouteCandidate = (routeId: string) => {
    patchDraft({
      routeCandidates: (draft.routeCandidates ?? []).filter(
        (route) => route.id !== routeId,
      ),
    })
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
        <p className="text-xs text-muted-foreground/85">
          {formatLocalModelTunnelConnectionLabel(item)} ·{' '}
          {formatLocalModelTunnelStatusDetail(item)}
        </p>
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Profile')}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Display name
            </span>
            <Input
              size="lg"
              value={draft.name ?? ''}
              onChange={updateString('name')}
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Runtime
            </span>
            <Select value={connectionKind} onValueChange={updateConnectionKind}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local-runtime">This Mac</SelectItem>
                <SelectItem value="ssh-tunnel">SSH tunnel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {isSshTunnel ? (
          <>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                SSH target
              </span>
              <Input
                size="lg"
                value={draft.sshTarget ?? ''}
                onChange={updateString('sshTarget')}
              />
            </label>
            <ChoiceField label="Start when Convergence opens">
              <Switch
                id="local-model-tunnel-autostart"
                checked={!!draft.autoStart}
                onCheckedChange={(next) => patchDraft({ autoStart: next })}
              />
            </ChoiceField>
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        {renderSectionLabel(isSshTunnel ? 'Forwarding' : 'Endpoint')}
        <ChoiceField
          label="Use custom local bind IP"
          hint="Leave off to bind to 127.0.0.1."
        >
          <Switch
            id="local-model-tunnel-custom-bind"
            checked={!!draft.useCustomLocalBindHost}
            onCheckedChange={(next) =>
              patchDraft({ useCustomLocalBindHost: next })
            }
          />
        </ChoiceField>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Local bind IP
            </span>
            <Input
              size="lg"
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
              size="lg"
              type="number"
              min={1}
              max={65535}
              value={draft.localPort ?? 11434}
              onChange={updatePort('localPort')}
            />
          </label>
          {isSshTunnel ? (
            <>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Remote IP or hostname
                </span>
                <Input
                  size="lg"
                  value={draft.remoteHost ?? ''}
                  onChange={updateString('remoteHost')}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Remote port
                </span>
                <Input
                  size="lg"
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.remotePort ?? 11434}
                  onChange={updatePort('remotePort')}
                />
              </label>
            </>
          ) : null}
        </div>
        {isSshTunnel ? (
          <ChoiceField
            label="Accept externally managed endpoint"
            hint="Use only when another SSH tunnel owns the local port."
          >
            <Switch
              id="local-model-tunnel-external"
              checked={!!draft.allowExternal}
              onCheckedChange={(next) => patchDraft({ allowExternal: next })}
            />
          </ChoiceField>
        ) : null}
        {isSshTunnel ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                Route candidates
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={addRouteCandidate}
              >
                <Plus className="h-3.5 w-3.5" />
                Add route
              </Button>
            </div>
            <div className="grid gap-2">
              {(draft.routeCandidates ?? []).map((route) => (
                <div
                  key={route.id}
                  className="space-y-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {route.label}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {formatRouteCandidate(route)}
                      </p>
                    </div>
                    <IconButton
                      label={`Remove route ${route.label}`}
                      type="button"
                      variant="danger-quiet"
                      onClick={() => removeRouteCandidate(route.id)}
                      size="sm"
                      className="shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Route label
                      </span>
                      <Input
                        size="lg"
                        value={route.label}
                        onChange={updateRouteString(route.id, 'label')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        SSH target
                      </span>
                      <Input
                        size="lg"
                        value={route.sshTarget}
                        onChange={updateRouteString(route.id, 'sshTarget')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Local port
                      </span>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={65535}
                        value={route.localPort}
                        onChange={updateRoutePort(route.id, 'localPort')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Remote host
                      </span>
                      <Input
                        size="lg"
                        value={route.remoteHost}
                        onChange={updateRouteString(route.id, 'remoteHost')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Remote port
                      </span>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={65535}
                        value={route.remotePort}
                        onChange={updateRoutePort(route.id, 'remotePort')}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        Connect timeout seconds
                      </span>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={120}
                        value={route.connectTimeoutSeconds ?? ''}
                        onChange={updateRouteTimeout(route.id)}
                      />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Health URL
                      </span>
                      <Input
                        size="lg"
                        value={route.healthCheckUrl}
                        onChange={updateRouteString(route.id, 'healthCheckUrl')}
                      />
                    </label>
                  </div>
                </div>
              ))}
              {draft.routeCandidates?.length ? null : (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                  Add route candidates to try multiple SSH targets in order.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Health')}
        <ChoiceField label="Check a health URL after connecting">
          <Switch
            id="local-model-tunnel-health"
            checked={!!draft.healthCheckEnabled}
            onCheckedChange={(next) => patchDraft({ healthCheckEnabled: next })}
          />
        </ChoiceField>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Health URL
          </span>
          <Input
            size="lg"
            value={draft.healthCheckUrl ?? ''}
            disabled={!draft.healthCheckEnabled}
            onChange={updateString('healthCheckUrl')}
          />
        </label>
      </section>

      {warnings.length > 0 ? (
        <section className="space-y-2">
          {warnings.map((warning) => (
            <p
              key={warning.code}
              className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{warning.message}</span>
            </p>
          ))}
        </section>
      ) : null}

      {isSshTunnel ? (
        <section className="space-y-3">
          {renderSectionLabel('Command preview')}
          <code className="block overflow-x-auto rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-foreground/85">
            {item.status.commandPreview}
          </code>
        </section>
      ) : null}

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
      {item.status.diagnostics.length > 0 ? (
        <section className="space-y-2">
          {renderSectionLabel('Diagnostics')}
          <dl className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            {item.status.diagnostics.map((diagnostic) => (
              <div key={`${diagnostic.label}:${diagnostic.value}`}>
                <dt className="font-medium text-foreground">
                  {diagnostic.label}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">
                  {diagnostic.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TunnelActionButtons
            state={item.status.state}
            connectionKind={item.profile.connectionKind}
            managed={item.status.managed}
            isMutating={isMutating}
            onStart={onStart}
            onStop={onStop}
            onRestart={onRestart}
            onManage={() => undefined}
          />
          <Button
            type="button"
            onClick={onSave}
            disabled={isMutating}
            size="lg"
          >
            Save profile
          </Button>
        </div>
        <Button
          type="button"
          variant="danger-quiet"
          onClick={onDelete}
          disabled={isMutating}
          size="lg"
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

function formatRouteCandidate(route: LocalModelTunnelRouteCandidate): string {
  const localBindHost = route.useCustomLocalBindHost
    ? route.localBindHost
    : '127.0.0.1'
  const timeout =
    route.connectTimeoutSeconds === null
      ? ''
      : ` · ${route.connectTimeoutSeconds}s connect timeout`
  return `${route.sshTarget}: ${localBindHost}:${route.localPort} -> ${route.remoteHost}:${route.remotePort}${timeout}`
}

function syncRouteCandidateDraft(
  draft: LocalModelTunnelProfileInput,
  patch: LocalModelTunnelProfileInput,
): LocalModelTunnelProfileInput {
  if (!draft.routeCandidates?.length) return draft
  const routeCandidates = draft.routeCandidates.map((route) => ({
    ...route,
    useCustomLocalBindHost:
      patch.useCustomLocalBindHost ?? route.useCustomLocalBindHost,
    localBindHost: patch.localBindHost ?? route.localBindHost,
    localPort: patch.localPort ?? route.localPort,
    remoteHost: patch.remoteHost ?? route.remoteHost,
    remotePort: patch.remotePort ?? route.remotePort,
    healthCheckUrl: patch.healthCheckUrl ?? route.healthCheckUrl,
  }))
  return { ...draft, routeCandidates }
}

function createRouteCandidateDraft(
  draft: LocalModelTunnelProfileInput,
): LocalModelTunnelRouteCandidate {
  const routes = draft.routeCandidates ?? []
  const index = routes.length + 1
  return {
    id: nextRouteId(routes, index),
    label: `Route ${index}`,
    sshTarget: draft.sshTarget || 'my-gpu-host',
    useCustomLocalBindHost: !!draft.useCustomLocalBindHost,
    localBindHost: draft.localBindHost || '127.0.0.1',
    localPort: draft.localPort ?? 11435,
    remoteHost: draft.remoteHost || '127.0.0.1',
    remotePort: draft.remotePort ?? 11434,
    healthCheckUrl: draft.healthCheckUrl || '',
    connectTimeoutSeconds: 5,
  }
}

function nextRouteId(
  routes: LocalModelTunnelRouteCandidate[],
  startIndex: number,
): string {
  const ids = new Set(routes.map((route) => route.id))
  let index = startIndex
  while (ids.has(`route-${index}`)) index += 1
  return `route-${index}`
}

function updateRouteCandidate(
  draft: LocalModelTunnelProfileInput,
  routeId: string,
  patch: Partial<LocalModelTunnelRouteCandidate>,
): LocalModelTunnelRouteCandidate[] {
  return (draft.routeCandidates ?? []).map((route) =>
    route.id === routeId ? { ...route, ...patch } : route,
  )
}
