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
  Card,
  ChoiceField,
  EmptyState,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Notice,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  settingsHeading,
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
          <span className="text-xs font-normal text-ink-muted">
            {item.status.state}
          </span>
        </p>
        <p className="text-xs text-ink-muted">
          {formatLocalModelTunnelEndpoint(item)}
        </p>
        <p className="text-xs text-ink-muted">
          {formatLocalModelTunnelConnectionLabel(item)} ·{' '}
          {formatLocalModelTunnelStatusDetail(item)}
        </p>
      </section>

      <section className="space-y-3">
        {renderSectionLabel('Profile')}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Display name</FieldLabel>
            <Input
              size="lg"
              value={draft.name ?? ''}
              onChange={updateString('name')}
            />
          </Field>
          <Field>
            <FieldLabel nativeLabel={false} render={<div />}>
              Runtime
            </FieldLabel>
            <Select
              items={CONNECTION_KIND_ITEMS}
              value={connectionKind}
              onValueChange={(kind) => updateConnectionKind(kind)}
            >
              <SelectTrigger size="lg" className="w-full" aria-label="Runtime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local-runtime">This Mac</SelectItem>
                <SelectItem value="ssh-tunnel">SSH tunnel</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {isSshTunnel ? (
          <>
            <Field>
              <FieldLabel>SSH target</FieldLabel>
              <Input
                size="lg"
                value={draft.sshTarget ?? ''}
                onChange={updateString('sshTarget')}
              />
            </Field>
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
          <Field>
            <FieldLabel>Local bind IP</FieldLabel>
            <Input
              size="lg"
              value={draft.localBindHost ?? '127.0.0.1'}
              disabled={!draft.useCustomLocalBindHost}
              onChange={updateString('localBindHost')}
            />
          </Field>
          <Field>
            <FieldLabel>Local port</FieldLabel>
            <Input
              size="lg"
              type="number"
              min={1}
              max={65535}
              value={draft.localPort ?? 11434}
              onChange={updatePort('localPort')}
            />
          </Field>
          {isSshTunnel ? (
            <>
              <Field>
                <FieldLabel>Remote IP or hostname</FieldLabel>
                <Input
                  size="lg"
                  value={draft.remoteHost ?? ''}
                  onChange={updateString('remoteHost')}
                />
              </Field>
              <Field>
                <FieldLabel>Remote port</FieldLabel>
                <Input
                  size="lg"
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.remotePort ?? 11434}
                  onChange={updatePort('remotePort')}
                />
              </Field>
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
              <h4 className={settingsHeading}>Route candidates</h4>
              <Button
                type="button"
                variant="secondary"
                onClick={addRouteCandidate}
              >
                <Plus className="size-3.5" />
                Add route
              </Button>
            </div>
            <div className="grid gap-2">
              {(draft.routeCandidates ?? []).map((route) => (
                <Card key={route.id} className="space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{route.label}</p>
                      <p className="mt-1 text-ink-muted">
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
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel>Route label</FieldLabel>
                      <Input
                        size="lg"
                        value={route.label}
                        onChange={updateRouteString(route.id, 'label')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>SSH target</FieldLabel>
                      <Input
                        size="lg"
                        value={route.sshTarget}
                        onChange={updateRouteString(route.id, 'sshTarget')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Local port</FieldLabel>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={65535}
                        value={route.localPort}
                        onChange={updateRoutePort(route.id, 'localPort')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Remote host</FieldLabel>
                      <Input
                        size="lg"
                        value={route.remoteHost}
                        onChange={updateRouteString(route.id, 'remoteHost')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Remote port</FieldLabel>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={65535}
                        value={route.remotePort}
                        onChange={updateRoutePort(route.id, 'remotePort')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Connect timeout seconds</FieldLabel>
                      <Input
                        size="lg"
                        type="number"
                        min={1}
                        max={120}
                        value={route.connectTimeoutSeconds ?? ''}
                        onChange={updateRouteTimeout(route.id)}
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel>Health URL</FieldLabel>
                      <Input
                        size="lg"
                        value={route.healthCheckUrl}
                        onChange={updateRouteString(route.id, 'healthCheckUrl')}
                      />
                    </Field>
                  </div>
                </Card>
              ))}
              {draft.routeCandidates?.length ? null : (
                <EmptyState
                  size="compact"
                  title="No route candidates"
                  detail="Add some to try several SSH targets in order."
                />
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
        <Field>
          <FieldLabel>Health URL</FieldLabel>
          <Input
            size="lg"
            value={draft.healthCheckUrl ?? ''}
            disabled={!draft.healthCheckEnabled}
            onChange={updateString('healthCheckUrl')}
          />
        </Field>
      </section>

      {warnings.length > 0 ? (
        <section className="space-y-2">
          {warnings.map((warning) => (
            <Notice
              key={warning.code}
              tone="warning"
              icon={<AlertTriangle />}
              title={warning.message}
            />
          ))}
        </section>
      ) : null}

      {isSshTunnel ? (
        <section className="space-y-3">
          {renderSectionLabel('Command preview')}
          <code className="block overflow-x-auto rounded-lg border border-line-soft bg-surface-muted/30 px-3 py-2 text-xs text-ink/85">
            {item.status.commandPreview}
          </code>
        </section>
      ) : null}

      {item.status.error ? (
        <Notice tone="danger" title={item.status.error} />
      ) : null}
      {error ? <Notice tone="danger" title={error} /> : null}
      {item.status.diagnostics.length > 0 ? (
        <section className="space-y-2">
          {renderSectionLabel('Diagnostics')}
          <dl className="space-y-2 rounded-lg border border-line-soft bg-surface-muted/20 px-3 py-2 text-xs">
            {item.status.diagnostics.map((diagnostic) => (
              <div key={`${diagnostic.label}:${diagnostic.value}`}>
                <dt className="font-medium text-ink">{diagnostic.label}</dt>
                <dd className="mt-0.5 wrap-break-word whitespace-pre-wrap text-ink-muted">
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
          />
          <Button
            type="button"
            onClick={onSave}
            pending={isMutating}
            pendingLabel="Saving…"
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
          <Trash2 className="size-4" />
          Delete…
        </Button>
      </div>
    </div>
  )
}

/** The two places a tunnel's model can run, as the runtime choice names them. */
const CONNECTION_KIND_ITEMS = {
  'local-runtime': 'This Mac',
  'ssh-tunnel': 'SSH tunnel',
}

function renderSectionLabel(label: string) {
  return <SectionLabel as="h3">{label}</SectionLabel>
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
