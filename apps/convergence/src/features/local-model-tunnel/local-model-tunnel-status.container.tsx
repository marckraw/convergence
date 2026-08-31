import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  formatLocalModelTunnelEndpoint,
  localModelTunnelApi,
  selectLocalModelTunnelAggregate,
  selectPreferredLocalModelTunnelProfileId,
  useLocalModelTunnelStore,
  type LocalModelTunnelProfile,
  type LocalModelTunnelProfileInput,
} from '@/entities/local-model-tunnel'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { Pencil, Plus } from 'lucide-react'
import { StatusDot } from './status-dot.presentational'
import { TunnelPopoverRow } from './tunnel-popover-row.presentational'
import { TunnelProfileEditor } from './tunnel-profile-editor.presentational'

const NEW_PROFILE_INPUT: LocalModelTunnelProfileInput = {
  name: 'New tunnel',
  connectionKind: 'ssh-tunnel',
  sshTarget: 'my-gpu-host',
  allowExternal: false,
  autoStart: false,
  useCustomLocalBindHost: false,
  localBindHost: '127.0.0.1',
  localPort: 11435,
  remoteHost: '127.0.0.1',
  remotePort: 11434,
  healthCheckEnabled: false,
  healthCheckUrl: '',
}

export const LocalModelTunnelStatusContainer: FC = () => {
  const snapshot = useLocalModelTunnelStore((s) => s.snapshot)
  const isLoading = useLocalModelTunnelStore((s) => s.isLoading)
  const isMutatingProfileId = useLocalModelTunnelStore(
    (s) => s.isMutatingProfileId,
  )
  const error = useLocalModelTunnelStore((s) => s.error)
  const load = useLocalModelTunnelStore((s) => s.load)
  const ingest = useLocalModelTunnelStore((s) => s.ingest)
  const start = useLocalModelTunnelStore((s) => s.start)
  const stop = useLocalModelTunnelStore((s) => s.stop)
  const restart = useLocalModelTunnelStore((s) => s.restart)
  const createProfile = useLocalModelTunnelStore((s) => s.createProfile)
  const updateProfile = useLocalModelTunnelStore((s) => s.updateProfile)
  const deleteProfile = useLocalModelTunnelStore((s) => s.deleteProfile)
  const clearError = useLocalModelTunnelStore((s) => s.clearError)
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  )
  const [draft, setDraft] = useState<LocalModelTunnelProfileInput | null>(null)
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null)

  useEffect(() => {
    void load()
    return localModelTunnelApi.onChanged(ingest)
  }, [load, ingest])

  const profiles = snapshot?.profiles ?? []
  const aggregate = useMemo(
    () => selectLocalModelTunnelAggregate(snapshot),
    [snapshot],
  )
  const preferredProfileId = useMemo(
    () => selectPreferredLocalModelTunnelProfileId(profiles),
    [profiles],
  )

  useEffect(() => {
    if (
      selectedProfileId &&
      profiles.some((item) => item.profile.id === selectedProfileId)
    ) {
      return
    }
    setSelectedProfileId(preferredProfileId)
  }, [profiles, preferredProfileId, selectedProfileId])

  const selected = profiles.find(
    (item) => item.profile.id === selectedProfileId,
  )

  useEffect(() => {
    if (!manageOpen) {
      setDraft(null)
      setDraftProfileId(null)
      return
    }
    if (!selected) return
    if (draftProfileId === selected.profile.id) return
    setDraft(profileToInput(selected.profile))
    setDraftProfileId(selected.profile.id)
  }, [selected, manageOpen, draftProfileId])

  if (!aggregate.visible && !isLoading) return null

  const handleOpenManage = (profileId?: string) => {
    setSelectedProfileId(profileId ?? preferredProfileId)
    clearError()
    setManageOpen(true)
  }

  const handleAddProfile = async () => {
    const existingIds = new Set(profiles.map((item) => item.profile.id))
    const nextSnapshot = await createProfile(NEW_PROFILE_INPUT)
    const created = nextSnapshot?.profiles.find(
      (item) => !existingIds.has(item.profile.id),
    )
    if (created) setSelectedProfileId(created.profile.id)
  }

  const handleSaveProfile = async () => {
    if (!selected || !draft) return
    await updateProfile(selected.profile.id, draft)
  }

  const handleDeleteProfile = async () => {
    if (!selected) return
    await deleteProfile(selected.profile.id)
    setSelectedProfileId(null)
  }

  return (
    <>
      <Popover>
        <Tooltip delayDuration={120}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto max-w-[280px] rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[11px] font-medium shadow-none hover:bg-accent"
                data-testid="local-model-tunnel-pill"
              >
                <StatusDot state={aggregate.state} />
                <span className="min-w-0 truncate text-foreground">
                  {aggregate.label}
                </span>
                <span className="truncate text-muted-foreground/85">
                  {aggregate.detail}
                </span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            Local model tunnels. Click to view status and controls.
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          side="top"
          className="w-[min(420px,calc(100vw-2rem))] p-0"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <StatusDot state={aggregate.state} />
                <span>{aggregate.label}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {aggregate.detail}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenManage()}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto px-4 py-2">
            {profiles.map((item) => (
              <TunnelPopoverRow
                key={item.profile.id}
                item={item}
                isMutating={isMutatingProfileId === item.profile.id}
                onStart={() => void start(item.profile.id)}
                onStop={() => void stop(item.profile.id)}
                onRestart={() => void restart(item.profile.id)}
                onManage={() => handleOpenManage(item.profile.id)}
              />
            ))}
          </div>
          {error ? (
            <p className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="h-[min(88vh,780px)] w-[min(980px,calc(100vw-2rem))] max-h-[min(88vh,780px)] p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
            <DialogTitle>Local model tunnels</DialogTitle>
            <DialogDescription>
              Manage SSH forwards for local or remote model runtimes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            <div className="flex min-h-full flex-col sm:flex-row">
              <aside className="shrink-0 border-b border-border/70 bg-card/30 p-3 sm:w-64 sm:border-r sm:border-b-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Profiles
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Add local model tunnel profile"
                    onClick={() => void handleAddProfile()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                  {profiles.map((item) => (
                    <Button
                      key={item.profile.id}
                      type="button"
                      variant={
                        item.profile.id === selectedProfileId
                          ? 'secondary'
                          : 'ghost'
                      }
                      size="sm"
                      className="h-auto min-w-48 justify-start rounded-lg px-3 py-3 text-left sm:min-w-0"
                      onClick={() => setSelectedProfileId(item.profile.id)}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <StatusDot state={item.status.state} />
                          <span className="truncate font-medium">
                            {item.profile.name}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {formatLocalModelTunnelEndpoint(item)}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </aside>

              <div className="min-w-0 flex-1 p-6">
                {selected && draft ? (
                  <TunnelProfileEditor
                    item={selected}
                    draft={draft}
                    error={error}
                    isMutating={isMutatingProfileId === selected.profile.id}
                    onDraftChange={setDraft}
                    onStart={() => void start(selected.profile.id)}
                    onStop={() => void stop(selected.profile.id)}
                    onRestart={() => void restart(selected.profile.id)}
                    onSave={() => void handleSaveProfile()}
                    onDelete={() => void handleDeleteProfile()}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-8 text-center text-sm text-muted-foreground">
                    No tunnel profile selected.
                  </div>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManageOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function profileToInput(
  profile: LocalModelTunnelProfile,
): LocalModelTunnelProfileInput {
  return {
    name: profile.name,
    connectionKind: profile.connectionKind,
    sshTarget: profile.sshTarget,
    allowExternal: profile.allowExternal,
    autoStart: profile.autoStart,
    useCustomLocalBindHost: profile.useCustomLocalBindHost,
    localBindHost: profile.localBindHost,
    localPort: profile.localPort,
    remoteHost: profile.remoteHost,
    remotePort: profile.remotePort,
    healthCheckEnabled: profile.healthCheckEnabled,
    healthCheckUrl: profile.healthCheckUrl,
    routeCandidates: profile.routeCandidates,
  }
}
