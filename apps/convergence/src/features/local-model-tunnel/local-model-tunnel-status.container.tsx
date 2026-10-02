import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  localModelTunnelApi,
  selectLocalModelTunnelAggregate,
  selectPreferredLocalModelTunnelProfileId,
  useLocalModelTunnelStore,
  type LocalModelTunnelProfile,
  type LocalModelTunnelProfileInput,
} from '@/entities/local-model-tunnel'
import {
  Button,
  cn,
  dialogRail,
  dialogSplit,
  EmptyState,
  FormDialog,
  FormError,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionLabel,
  Tooltip,
  useConfirm,
} from '@convergence/ui'
import { Pencil, Plus } from 'lucide-react'
import { StatusDot } from './status-dot.presentational'
import { TunnelPopoverRow } from './tunnel-popover-row.presentational'
import { TunnelProfileList } from './tunnel-profile-list.presentational'
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
  // What can't be taken back asks first, in the app's own dialog (R5).
  const confirm = useConfirm()
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

  const profiles = useMemo(() => snapshot?.profiles ?? [], [snapshot])
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

  /**
   * Tunnels save as you go, each profile with its own Save: Done with that
   * profile's changes unsaved asks before dropping them (DLG-10, R5).
   */
  const handleManageOpenChange = async (next: boolean) => {
    if (next) {
      setManageOpen(true)
      return
    }
    const unsaved =
      selected !== undefined &&
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(profileToInput(selected.profile))
    if (unsaved) {
      const discard = await confirm({
        title: `Discard your changes to “${selected.profile.name}”?`,
        description: 'They haven’t been saved to the profile.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      })
      if (!discard) return
    }
    setManageOpen(false)
  }

  const handleSaveProfile = async () => {
    if (!selected || !draft) return
    await updateProfile(selected.profile.id, draft)
  }

  const handleDeleteProfile = async () => {
    if (!selected) return
    const confirmed = await confirm({
      title: `Delete tunnel profile “${selected.profile.name}”?`,
      description:
        'The profile and its routes are deleted for good. A tunnel it runs is stopped.',
      confirmLabel: 'Delete profile',
      variant: 'danger',
    })
    if (!confirmed) return
    await deleteProfile(selected.profile.id)
    setSelectedProfileId(null)
  }

  return (
    <>
      <Popover>
        <Tooltip
          label="Local model tunnels. Click to view status and controls."
          side="top"
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                data-testid="local-model-tunnel-pill"
                className="h-auto max-w-70 rounded-full border border-line-soft bg-canvas/50 px-2 py-0.5 text-2xs font-medium shadow-none hover:bg-fill-hover"
              >
                <StatusDot state={aggregate.state} />
                <span className="min-w-0 truncate text-ink">
                  {aggregate.label}
                </span>
                <span className="truncate text-ink-muted">
                  {aggregate.detail}
                </span>
              </Button>
            }
          />
        </Tooltip>
        <PopoverContent
          aria-label="Local model tunnels"
          align="start"
          side="top"
          className="w-105 max-w-(--available-width) p-0"
        >
          <div className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <StatusDot state={aggregate.state} />
                <span>{aggregate.label}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {aggregate.detail}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenManage()}
            >
              <Pencil className="size-3.5" />
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
            <FormError className="border-t border-line-soft px-4 py-2">
              {error}
            </FormError>
          ) : null}
        </PopoverContent>
      </Popover>

      {/*
        Each profile action is kept as it is done, so the tunnels end in Done
        (R6); a profile's edits keep their own Save.
      */}
      <FormDialog
        open={manageOpen}
        onOpenChange={(next) => void handleManageOpenChange(next)}
        title="Local model tunnels"
        description="Manage SSH forwards for local or remote model runtimes."
        size="xl"
        height="tall"
        flush
        saves="as-you-go"
      >
        <div className={dialogSplit}>
          <aside className={cn(dialogRail, 'bg-surface/30 p-3 sm:w-64')}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <SectionLabel as="h3">Profiles</SectionLabel>
              <IconButton
                label="Add local model tunnel profile"
                type="button"
                variant="ghost"
                onClick={() => void handleAddProfile()}
                size="sm"
              >
                <Plus className="size-4" />
              </IconButton>
            </div>
            <TunnelProfileList
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              onSelect={setSelectedProfileId}
            />
          </aside>

          <div className="app-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
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
              <EmptyState
                title="No tunnel profile selected"
                detail="Choose one from the list, or add one."
              />
            )}
          </div>
        </div>
      </FormDialog>
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
