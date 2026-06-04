import type { FC, ReactNode } from 'react'
import {
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import type {
  Space,
  SpaceAttempt,
  SpaceAttemptRole,
  SpaceAttention,
  SpaceArtifact,
  SpaceArtifactKind,
  SpaceArtifactStatus,
  SpaceSynthesisArtifactSuggestion,
  SpaceStatus,
} from '@/entities/space'
import {
  spaceAttemptRoleLabels,
  spaceAttemptRoleOptions,
  spaceArtifactKindLabels,
  spaceArtifactKindOptions,
  spaceArtifactStatusLabels,
  spaceArtifactStatusOptions,
} from '@/entities/space'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import {
  spaceAttentionOptions,
  spaceAttentionClassNames,
  spaceAttentionLabels,
  spaceStatusClassNames,
  spaceStatusLabels,
  spaceStatusOptions,
} from './space-workboard.styles'
import type { SpaceArtifactSuggestion } from './space-artifact-suggestions.pure'

export interface SpaceDraft {
  title: string
  status: SpaceStatus
  attention: SpaceAttention
  brief: string
}

export interface SpaceArtifactDraft {
  kind: SpaceArtifactKind
  label: string
  value: string
  status: SpaceArtifactStatus
  sourceSessionId: string
}

export interface SpaceAttemptView {
  attempt: SpaceAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  workingDirectory: string | null
  providerId: string
  status: string
  attention: string
  missing: boolean
}

export interface SpaceSynthesisArtifactSuggestionView extends SpaceSynthesisArtifactSuggestion {
  id: string
}

export interface SpaceSynthesisPreview {
  brief: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  artifacts: SpaceSynthesisArtifactSuggestionView[]
}

interface SpaceWorkboardProps {
  open: boolean
  trigger?: ReactNode
  spaces: Space[]
  selectedSpace: Space | null
  selectedDraft: SpaceDraft
  selectedAttempts: SpaceAttemptView[]
  selectedArtifacts: SpaceArtifact[]
  artifactSuggestions: SpaceArtifactSuggestion[]
  synthesisPreview: SpaceSynthesisPreview | null
  artifactDraft: SpaceArtifactDraft
  artifactDialogOpen: boolean
  createTitle: string
  attemptCounts: Record<string, number>
  artifactCounts: Record<string, number>
  isLoading: boolean
  isCreating: boolean
  isSaving: boolean
  isCreatingArtifact: boolean
  isDiscoveringArtifacts: boolean
  isSynthesizing: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onCreate: () => void
  onSelectSpace: (id: string) => void
  onDraftChange: (draft: SpaceDraft) => void
  onSave: () => void
  onArtifactDraftChange: (draft: SpaceArtifactDraft) => void
  onArtifactDialogOpenChange: (open: boolean) => void
  onCreateArtifact: () => void
  onArtifactKindChange: (artifactId: string, kind: SpaceArtifactKind) => void
  onArtifactStatusChange: (
    artifactId: string,
    status: SpaceArtifactStatus,
  ) => void
  onArtifactSourceSessionChange: (
    artifactId: string,
    sourceSessionId: string,
  ) => void
  onArtifactLabelCommit: (artifactId: string, label: string) => void
  onArtifactValueCommit: (artifactId: string, value: string) => void
  onDeleteArtifact: (artifactId: string) => void
  onDiscoverArtifacts: () => void
  onAcceptArtifactSuggestion: (suggestionId: string) => void
  onDismissArtifactSuggestion: (suggestionId: string) => void
  onSynthesize: () => void
  onSynthesisBriefChange: (value: string) => void
  onAcceptSynthesisBrief: () => void
  onRejectSynthesisBrief: () => void
  onAppendSynthesisNotes: () => void
  onAcceptSynthesisArtifact: (suggestionId: string) => void
  onDismissSynthesisPreview: () => void
  onAttemptRoleChange: (attemptId: string, role: SpaceAttemptRole) => void
  onSetPrimaryAttempt: (attemptId: string) => void
  onDetachAttempt: (attemptId: string) => void
}

export const SpaceWorkboardDialog: FC<SpaceWorkboardProps> = ({
  open,
  trigger,
  spaces,
  selectedSpace,
  selectedDraft,
  selectedAttempts,
  selectedArtifacts,
  artifactSuggestions,
  synthesisPreview,
  artifactDraft,
  artifactDialogOpen,
  createTitle,
  attemptCounts,
  artifactCounts,
  isLoading,
  isCreating,
  isSaving,
  isCreatingArtifact,
  isDiscoveringArtifacts,
  isSynthesizing,
  error,
  onOpenChange,
  onCreateTitleChange,
  onCreate,
  onSelectSpace,
  onDraftChange,
  onSave,
  onArtifactDraftChange,
  onArtifactDialogOpenChange,
  onCreateArtifact,
  onArtifactKindChange,
  onArtifactStatusChange,
  onArtifactSourceSessionChange,
  onArtifactLabelCommit,
  onArtifactValueCommit,
  onDeleteArtifact,
  onDiscoverArtifacts,
  onAcceptArtifactSuggestion,
  onDismissArtifactSuggestion,
  onSynthesize,
  onSynthesisBriefChange,
  onAcceptSynthesisBrief,
  onRejectSynthesisBrief,
  onAppendSynthesisNotes,
  onAcceptSynthesisArtifact,
  onDismissSynthesisPreview,
  onAttemptRoleChange,
  onSetPrimaryAttempt,
  onDetachAttempt,
}) => {
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const saveDisabled =
    !selectedSpace || selectedDraft.title.trim().length === 0 || isSaving
  const artifactCreateDisabled =
    !selectedSpace ||
    artifactDraft.label.trim().length === 0 ||
    artifactDraft.value.trim().length === 0 ||
    isCreatingArtifact

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="w-[min(1040px,calc(100vw-2rem))] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Spaces</DialogTitle>
          <DialogDescription>
            Global work tracking for agent-driven delivery.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr]">
          <section className="min-h-0 border-b border-border/70 md:border-r md:border-b-0">
            <div className="border-b border-border/70 px-4 py-4">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!createDisabled) onCreate()
                }}
              >
                <Input
                  value={createTitle}
                  onChange={(event) => onCreateTitleChange(event.target.value)}
                  placeholder="New Space"
                  disabled={isCreating}
                  aria-label="New Space title"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="outline"
                  disabled={createDisabled}
                  aria-label="Create Space"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <div className="app-scrollbar max-h-[44vh] overflow-y-auto p-2 md:max-h-none">
              {isLoading && spaces.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Loading Spaces...
                </p>
              ) : spaces.length === 0 ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  No Spaces yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {spaces.map((space) => (
                    <Button
                      key={space.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto w-full justify-start rounded-lg border px-3 py-3 text-left',
                        selectedSpace?.id === space.id
                          ? 'border-border bg-accent/70'
                          : 'border-transparent hover:border-border/60',
                      )}
                      onClick={() => onSelectSpace(space.id)}
                    >
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block truncate text-sm font-medium">
                          {space.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {renderStatusBadge(space.status)}
                          {space.attention !== 'none' ? (
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                spaceAttentionClassNames[space.attention],
                              )}
                            >
                              {spaceAttentionLabels[space.attention]}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {attemptCounts[space.id] ?? 0}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitPullRequest className="h-3.5 w-3.5" />
                            {artifactCounts[space.id] ?? 0}
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {formatUpdatedAt(space.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="app-scrollbar min-h-0 overflow-y-auto px-6 py-5">
            {selectedSpace ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_180px_180px]">
                  <label className="space-y-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Title
                    </span>
                    <Input
                      value={selectedDraft.title}
                      onChange={(event) =>
                        onDraftChange({
                          ...selectedDraft,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Status
                    </span>
                    <NativeSelect
                      className="w-full"
                      value={selectedDraft.status}
                      onChange={(event) =>
                        onDraftChange({
                          ...selectedDraft,
                          status: event.target.value as SpaceStatus,
                        })
                      }
                    >
                      {spaceStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {spaceStatusLabels[status]}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Attention
                    </span>
                    <NativeSelect
                      className="w-full"
                      value={selectedDraft.attention}
                      onChange={(event) =>
                        onDraftChange({
                          ...selectedDraft,
                          attention: event.target.value as SpaceAttention,
                        })
                      }
                    >
                      {spaceAttentionOptions.map((attention) => (
                        <option key={attention} value={attention}>
                          {spaceAttentionLabels[attention]}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      Space brief
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onSynthesize}
                      disabled={isSynthesizing || selectedAttempts.length === 0}
                      aria-label="Synthesize Space brief"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {isSynthesizing ? 'Synthesizing...' : 'Synthesize'}
                    </Button>
                  </div>
                  <Textarea
                    value={selectedDraft.brief}
                    onChange={(event) =>
                      onDraftChange({
                        ...selectedDraft,
                        brief: event.target.value,
                      })
                    }
                    className="min-h-[220px] resize-y"
                    placeholder="Stable notes, decisions, constraints, and next action."
                    aria-label="Space brief"
                  />
                </div>

                {synthesisPreview ? (
                  <section className="space-y-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase text-cyan-100">
                          Suggested updates
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Review and accept only the parts that should become
                          stable Space state.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={onDismissSynthesisPreview}
                        aria-label="Dismiss synthesis preview"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {synthesisPreview.brief ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">
                          Proposed Space brief
                        </div>
                        <Textarea
                          value={synthesisPreview.brief}
                          onChange={(event) =>
                            onSynthesisBriefChange(event.target.value)
                          }
                          className="min-h-[140px] resize-y"
                          aria-label="Suggested Space brief"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onRejectSynthesisBrief}
                          >
                            Reject
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={onAcceptSynthesisBrief}
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {renderSynthesisNotes({
                      preview: synthesisPreview,
                      onAppendSynthesisNotes,
                    })}

                    {synthesisPreview.artifacts.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">
                          Proposed Artifacts
                        </div>
                        {synthesisPreview.artifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-border/60 bg-background/50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {artifact.label}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {spaceArtifactKindLabels[artifact.kind]} |{' '}
                                {spaceArtifactStatusLabels[artifact.status]} |{' '}
                                {artifact.value}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                onAcceptSynthesisArtifact(artifact.id)
                              }
                            >
                              <Check className="h-4 w-4" />
                              Accept
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  {renderMetric(
                    'Attempts',
                    attemptCounts[selectedSpace.id] ?? 0,
                  )}
                  {renderMetric(
                    'Artifacts',
                    artifactCounts[selectedSpace.id] ?? 0,
                  )}
                  {renderMetric(
                    'Updated',
                    formatUpdatedAt(selectedSpace.updatedAt),
                  )}
                </div>

                <section className="space-y-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Attempts
                  </div>
                  {selectedAttempts.length === 0 ? (
                    <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                      No linked Attempts yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedAttempts.map((view) =>
                        renderAttemptRow({
                          view,
                          onAttemptRoleChange,
                          onSetPrimaryAttempt,
                          onDetachAttempt,
                        }),
                      )}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Artifacts
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onDiscoverArtifacts}
                        disabled={
                          isDiscoveringArtifacts ||
                          selectedAttempts.length === 0
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                        {isDiscoveringArtifacts ? 'Checking...' : 'Discover'}
                      </Button>
                      <Dialog
                        open={artifactDialogOpen}
                        onOpenChange={onArtifactDialogOpenChange}
                      >
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="sm">
                            <Plus className="h-4 w-4" />
                            Add Artifact
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[min(720px,calc(100vw-2rem))] p-0">
                          <form
                            className="flex min-h-0 flex-1 flex-col"
                            onSubmit={(event) => {
                              event.preventDefault()
                              if (!artifactCreateDisabled) onCreateArtifact()
                            }}
                          >
                            <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
                              <DialogTitle>Add Artifact</DialogTitle>
                              <DialogDescription>
                                Attach a concrete artifact produced by this
                                Space.
                              </DialogDescription>
                            </DialogHeader>

                            <DialogBody className="grid gap-4 md:grid-cols-[160px_1fr]">
                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Kind
                                </span>
                                <NativeSelect
                                  className="w-full"
                                  value={artifactDraft.kind}
                                  onChange={(event) =>
                                    onArtifactDraftChange({
                                      ...artifactDraft,
                                      kind: event.target
                                        .value as SpaceArtifactKind,
                                    })
                                  }
                                  aria-label="New Artifact kind"
                                >
                                  {spaceArtifactKindOptions.map((kind) => (
                                    <option key={kind} value={kind}>
                                      {spaceArtifactKindLabels[kind]}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Label
                                </span>
                                <Input
                                  value={artifactDraft.label}
                                  onChange={(event) =>
                                    onArtifactDraftChange({
                                      ...artifactDraft,
                                      label: event.target.value,
                                    })
                                  }
                                  placeholder="Public PR"
                                  aria-label="New Artifact label"
                                />
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Status
                                </span>
                                <NativeSelect
                                  className="w-full"
                                  value={artifactDraft.status}
                                  onChange={(event) =>
                                    onArtifactDraftChange({
                                      ...artifactDraft,
                                      status: event.target
                                        .value as SpaceArtifactStatus,
                                    })
                                  }
                                  aria-label="New Artifact status"
                                >
                                  {spaceArtifactStatusOptions.map((status) => (
                                    <option key={status} value={status}>
                                      {spaceArtifactStatusLabels[status]}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Source
                                </span>
                                <NativeSelect
                                  className="w-full"
                                  value={artifactDraft.sourceSessionId}
                                  onChange={(event) =>
                                    onArtifactDraftChange({
                                      ...artifactDraft,
                                      sourceSessionId: event.target.value,
                                    })
                                  }
                                  aria-label="New Artifact source session"
                                >
                                  <option value="">No source Attempt</option>
                                  {selectedAttempts.map((view) => (
                                    <option
                                      key={view.attempt.sessionId}
                                      value={view.attempt.sessionId}
                                    >
                                      {view.sessionName}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </label>

                              <label className="space-y-1.5 md:col-span-2">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Value
                                </span>
                                <Input
                                  value={artifactDraft.value}
                                  onChange={(event) =>
                                    onArtifactDraftChange({
                                      ...artifactDraft,
                                      value: event.target.value,
                                    })
                                  }
                                  placeholder="URL, branch, file path, or note"
                                  aria-label="New Artifact value"
                                />
                              </label>
                            </DialogBody>

                            <DialogFooter className="border-t border-border/70 px-6 py-4">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  onArtifactDialogOpenChange(false)
                                }
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={artifactCreateDisabled}
                              >
                                <Plus className="h-4 w-4" />
                                {isCreatingArtifact
                                  ? 'Creating...'
                                  : 'Create Artifact'}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {artifactSuggestions.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium uppercase text-muted-foreground">
                        Suggestions
                      </div>
                      {artifactSuggestions.map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-3"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {suggestion.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {suggestion.description}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onAcceptArtifactSuggestion(suggestion.id)
                                }
                              >
                                <Check className="h-4 w-4" />
                                Accept
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  onDismissArtifactSuggestion(suggestion.id)
                                }
                                aria-label={`Dismiss ${suggestion.title}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedArtifacts.length === 0 ? (
                    <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                      No Artifacts yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedArtifacts.map((artifact) =>
                        renderArtifactRow({
                          artifact,
                          attempts: selectedAttempts,
                          onArtifactKindChange,
                          onArtifactStatusChange,
                          onArtifactSourceSessionChange,
                          onArtifactLabelCommit,
                          onArtifactValueCommit,
                          onDeleteArtifact,
                        }),
                      )}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                Select or create a Space.
              </div>
            )}
          </section>
        </div>

        {error ? (
          <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            size="sm"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function renderStatusBadge(status: SpaceStatus) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
        spaceStatusClassNames[status],
      )}
    >
      {spaceStatusLabels[status]}
    </span>
  )
}

function renderSynthesisNotes(input: {
  preview: SpaceSynthesisPreview
  onAppendSynthesisNotes: () => void
}) {
  const { preview, onAppendSynthesisNotes } = input
  const sections = [
    { label: 'Decisions', values: preview.decisions },
    { label: 'Open questions', values: preview.openQuestions },
    {
      label: 'Next action',
      values: preview.nextAction ? [preview.nextAction] : [],
    },
  ].filter((section) => section.values.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAppendSynthesisNotes}
        >
          <Check className="h-4 w-4" />
          Append to Space brief
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.label}
            className="rounded-md border border-border/60 bg-background/50 px-3 py-2"
          >
            <div className="text-[11px] font-medium uppercase text-muted-foreground">
              {section.label}
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {section.values.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderMetric(label: string, value: string | number) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  )
}

function renderAttemptRow(input: {
  view: SpaceAttemptView
  onAttemptRoleChange: (attemptId: string, role: SpaceAttemptRole) => void
  onSetPrimaryAttempt: (attemptId: string) => void
  onDetachAttempt: (attemptId: string) => void
}) {
  const { view, onAttemptRoleChange, onSetPrimaryAttempt, onDetachAttempt } =
    input
  const { attempt } = view

  return (
    <div
      key={attempt.id}
      className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">
              {view.sessionName}
            </span>
            {attempt.isPrimary ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">
                <Star className="h-3 w-3" />
                Primary
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{view.projectName}</span>
            {view.branchName ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                {view.branchName}
              </span>
            ) : null}
            <span>{view.providerId}</span>
            <span>{view.status}</span>
            {view.attention !== 'none' ? <span>{view.attention}</span> : null}
            {view.missing ? <span>Missing session</span> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <NativeSelect
            selectSize="sm"
            value={attempt.role}
            onChange={(event) =>
              onAttemptRoleChange(
                attempt.id,
                event.target.value as SpaceAttemptRole,
              )
            }
            aria-label={`Role for ${view.sessionName}`}
          >
            {spaceAttemptRoleOptions.map((role) => (
              <option key={role} value={role}>
                {spaceAttemptRoleLabels[role]}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSetPrimaryAttempt(attempt.id)}
            disabled={attempt.isPrimary}
          >
            <Star className="h-4 w-4" />
            Primary
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDetachAttempt(attempt.id)}
            aria-label={`Detach ${view.sessionName}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function renderArtifactRow(input: {
  artifact: SpaceArtifact
  attempts: SpaceAttemptView[]
  onArtifactKindChange: (artifactId: string, kind: SpaceArtifactKind) => void
  onArtifactStatusChange: (
    artifactId: string,
    status: SpaceArtifactStatus,
  ) => void
  onArtifactSourceSessionChange: (
    artifactId: string,
    sourceSessionId: string,
  ) => void
  onArtifactLabelCommit: (artifactId: string, label: string) => void
  onArtifactValueCommit: (artifactId: string, value: string) => void
  onDeleteArtifact: (artifactId: string) => void
}) {
  const {
    artifact,
    attempts,
    onArtifactKindChange,
    onArtifactStatusChange,
    onArtifactSourceSessionChange,
    onArtifactLabelCommit,
    onArtifactValueCommit,
    onDeleteArtifact,
  } = input
  const sourceAttempt = attempts.find(
    (view) => view.attempt.sessionId === artifact.sourceSessionId,
  )
  const artifactUrl = parseHttpUrl(artifact.value)

  return (
    <div
      key={artifact.id}
      className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
    >
      <div className="grid gap-3 md:grid-cols-[150px_1fr_160px_auto]">
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Kind
          </span>
          <NativeSelect
            selectSize="sm"
            className="w-full"
            value={artifact.kind}
            onChange={(event) =>
              onArtifactKindChange(
                artifact.id,
                event.target.value as SpaceArtifactKind,
              )
            }
            aria-label={`Kind for ${artifact.label}`}
          >
            {spaceArtifactKindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {spaceArtifactKindLabels[kind]}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Label
          </span>
          <Input
            defaultValue={artifact.label}
            onBlur={(event) => {
              const label = event.target.value.trim()
              if (label && label !== artifact.label) {
                onArtifactLabelCommit(artifact.id, label)
              }
            }}
            aria-label={`Label for ${artifact.label}`}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Status
          </span>
          <NativeSelect
            selectSize="sm"
            className="w-full"
            value={artifact.status}
            onChange={(event) =>
              onArtifactStatusChange(
                artifact.id,
                event.target.value as SpaceArtifactStatus,
              )
            }
            aria-label={`Status for ${artifact.label}`}
          >
            {spaceArtifactStatusOptions.map((status) => (
              <option key={status} value={status}>
                {spaceArtifactStatusLabels[status]}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDeleteArtifact(artifact.id)}
            aria-label={`Remove Artifact ${artifact.label}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_190px]">
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Value
          </span>
          <div className="flex gap-2">
            <Input
              defaultValue={artifact.value}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value && value !== artifact.value) {
                  onArtifactValueCommit(artifact.id, value)
                }
              }}
              aria-label={`Value for ${artifact.label}`}
            />
            {artifactUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                asChild
              >
                <a
                  href={artifactUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open Artifact ${artifact.label}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Source
          </span>
          <NativeSelect
            className="w-full"
            value={artifact.sourceSessionId ?? ''}
            onChange={(event) =>
              onArtifactSourceSessionChange(artifact.id, event.target.value)
            }
            aria-label={`Source for ${artifact.label}`}
          >
            <option value="">No source Attempt</option>
            {attempts.map((view) => (
              <option
                key={view.attempt.sessionId}
                value={view.attempt.sessionId}
              >
                {view.sessionName}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {sourceAttempt ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Source: {sourceAttempt.sessionName}
        </div>
      ) : null}
    </div>
  )
}

function parseHttpUrl(value: string): string | null {
  if (!/^https?:\/\//i.test(value)) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
