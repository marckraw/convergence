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
  Initiative,
  InitiativeAttempt,
  InitiativeAttemptRole,
  InitiativeOutput,
  InitiativeOutputKind,
  InitiativeOutputStatus,
  InitiativeStatus,
} from '@/entities/initiative'
import {
  initiativeAttemptRoleLabels,
  initiativeAttemptRoleOptions,
  initiativeOutputKindLabels,
  initiativeOutputKindOptions,
  initiativeOutputStatusLabels,
  initiativeOutputStatusOptions,
} from '@/entities/initiative'
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
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import {
  initiativeAttentionClassNames,
  initiativeAttentionLabels,
  initiativeStatusClassNames,
  initiativeStatusLabels,
  initiativeStatusOptions,
} from './initiative-workboard.styles'
import type { InitiativeOutputSuggestion } from './initiative-output-suggestions.pure'

export interface InitiativeDraft {
  title: string
  status: InitiativeStatus
  currentUnderstanding: string
}

export interface InitiativeOutputDraft {
  kind: InitiativeOutputKind
  label: string
  value: string
  status: InitiativeOutputStatus
  sourceSessionId: string
}

export interface InitiativeAttemptView {
  attempt: InitiativeAttempt
  sessionName: string
  projectName: string
  branchName: string | null
  workingDirectory: string | null
  providerId: string
  status: string
  attention: string
  missing: boolean
}

interface InitiativeWorkboardProps {
  open: boolean
  trigger?: ReactNode
  initiatives: Initiative[]
  selectedInitiative: Initiative | null
  selectedDraft: InitiativeDraft
  selectedAttempts: InitiativeAttemptView[]
  selectedOutputs: InitiativeOutput[]
  outputSuggestions: InitiativeOutputSuggestion[]
  outputDraft: InitiativeOutputDraft
  outputDialogOpen: boolean
  createTitle: string
  attemptCounts: Record<string, number>
  outputCounts: Record<string, number>
  isLoading: boolean
  isCreating: boolean
  isSaving: boolean
  isCreatingOutput: boolean
  isDiscoveringOutputs: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onCreate: () => void
  onSelectInitiative: (id: string) => void
  onDraftChange: (draft: InitiativeDraft) => void
  onSave: () => void
  onOutputDraftChange: (draft: InitiativeOutputDraft) => void
  onOutputDialogOpenChange: (open: boolean) => void
  onCreateOutput: () => void
  onOutputKindChange: (outputId: string, kind: InitiativeOutputKind) => void
  onOutputStatusChange: (
    outputId: string,
    status: InitiativeOutputStatus,
  ) => void
  onOutputSourceSessionChange: (
    outputId: string,
    sourceSessionId: string,
  ) => void
  onOutputLabelCommit: (outputId: string, label: string) => void
  onOutputValueCommit: (outputId: string, value: string) => void
  onDeleteOutput: (outputId: string) => void
  onDiscoverOutputs: () => void
  onAcceptOutputSuggestion: (suggestionId: string) => void
  onDismissOutputSuggestion: (suggestionId: string) => void
  onAttemptRoleChange: (attemptId: string, role: InitiativeAttemptRole) => void
  onSetPrimaryAttempt: (attemptId: string) => void
  onDetachAttempt: (attemptId: string) => void
}

export const InitiativeWorkboardDialog: FC<InitiativeWorkboardProps> = ({
  open,
  trigger,
  initiatives,
  selectedInitiative,
  selectedDraft,
  selectedAttempts,
  selectedOutputs,
  outputSuggestions,
  outputDraft,
  outputDialogOpen,
  createTitle,
  attemptCounts,
  outputCounts,
  isLoading,
  isCreating,
  isSaving,
  isCreatingOutput,
  isDiscoveringOutputs,
  error,
  onOpenChange,
  onCreateTitleChange,
  onCreate,
  onSelectInitiative,
  onDraftChange,
  onSave,
  onOutputDraftChange,
  onOutputDialogOpenChange,
  onCreateOutput,
  onOutputKindChange,
  onOutputStatusChange,
  onOutputSourceSessionChange,
  onOutputLabelCommit,
  onOutputValueCommit,
  onDeleteOutput,
  onDiscoverOutputs,
  onAcceptOutputSuggestion,
  onDismissOutputSuggestion,
  onAttemptRoleChange,
  onSetPrimaryAttempt,
  onDetachAttempt,
}) => {
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const saveDisabled =
    !selectedInitiative || selectedDraft.title.trim().length === 0 || isSaving
  const outputCreateDisabled =
    !selectedInitiative ||
    outputDraft.label.trim().length === 0 ||
    outputDraft.value.trim().length === 0 ||
    isCreatingOutput

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="w-[min(1040px,calc(100vw-2rem))] p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Initiatives</DialogTitle>
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
                  placeholder="New Initiative"
                  disabled={isCreating}
                  aria-label="New Initiative title"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="outline"
                  disabled={createDisabled}
                  aria-label="Create Initiative"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>

            <div className="app-scrollbar max-h-[44vh] overflow-y-auto p-2 md:max-h-none">
              {isLoading && initiatives.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Loading Initiatives...
                </p>
              ) : initiatives.length === 0 ? (
                <div className="px-3 py-8 text-sm text-muted-foreground">
                  No Initiatives yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {initiatives.map((initiative) => (
                    <Button
                      key={initiative.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto w-full justify-start rounded-lg border px-3 py-3 text-left',
                        selectedInitiative?.id === initiative.id
                          ? 'border-border bg-accent/70'
                          : 'border-transparent hover:border-border/60',
                      )}
                      onClick={() => onSelectInitiative(initiative.id)}
                    >
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block truncate text-sm font-medium">
                          {initiative.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {renderStatusBadge(initiative.status)}
                          {initiative.attention !== 'none' ? (
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                initiativeAttentionClassNames[
                                  initiative.attention
                                ],
                              )}
                            >
                              {initiativeAttentionLabels[initiative.attention]}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            {attemptCounts[initiative.id] ?? 0}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitPullRequest className="h-3.5 w-3.5" />
                            {outputCounts[initiative.id] ?? 0}
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {formatUpdatedAt(initiative.updatedAt)}
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
            {selectedInitiative ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
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
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={selectedDraft.status}
                      onChange={(event) =>
                        onDraftChange({
                          ...selectedDraft,
                          status: event.target.value as InitiativeStatus,
                        })
                      }
                    >
                      {initiativeStatusOptions.map((status) => (
                        <option key={status} value={status}>
                          {initiativeStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    Current understanding
                  </span>
                  <Textarea
                    value={selectedDraft.currentUnderstanding}
                    onChange={(event) =>
                      onDraftChange({
                        ...selectedDraft,
                        currentUnderstanding: event.target.value,
                      })
                    }
                    className="min-h-[220px] resize-y"
                    placeholder="Stable notes, decisions, constraints, and next action."
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  {renderMetric(
                    'Attempts',
                    attemptCounts[selectedInitiative.id] ?? 0,
                  )}
                  {renderMetric(
                    'Outputs',
                    outputCounts[selectedInitiative.id] ?? 0,
                  )}
                  {renderMetric(
                    'Updated',
                    formatUpdatedAt(selectedInitiative.updatedAt),
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
                      Outputs
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onDiscoverOutputs}
                        disabled={
                          isDiscoveringOutputs || selectedAttempts.length === 0
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                        {isDiscoveringOutputs ? 'Checking...' : 'Discover'}
                      </Button>
                      <Dialog
                        open={outputDialogOpen}
                        onOpenChange={onOutputDialogOpenChange}
                      >
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="sm">
                            <Plus className="h-4 w-4" />
                            Add Output
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[min(720px,calc(100vw-2rem))] p-0">
                          <form
                            className="flex min-h-0 flex-1 flex-col"
                            onSubmit={(event) => {
                              event.preventDefault()
                              if (!outputCreateDisabled) onCreateOutput()
                            }}
                          >
                            <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
                              <DialogTitle>Add Output</DialogTitle>
                              <DialogDescription>
                                Attach a concrete artifact produced by this
                                Initiative.
                              </DialogDescription>
                            </DialogHeader>

                            <DialogBody className="grid gap-4 md:grid-cols-[160px_1fr]">
                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Kind
                                </span>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  value={outputDraft.kind}
                                  onChange={(event) =>
                                    onOutputDraftChange({
                                      ...outputDraft,
                                      kind: event.target
                                        .value as InitiativeOutputKind,
                                    })
                                  }
                                  aria-label="New Output kind"
                                >
                                  {initiativeOutputKindOptions.map((kind) => (
                                    <option key={kind} value={kind}>
                                      {initiativeOutputKindLabels[kind]}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Label
                                </span>
                                <Input
                                  value={outputDraft.label}
                                  onChange={(event) =>
                                    onOutputDraftChange({
                                      ...outputDraft,
                                      label: event.target.value,
                                    })
                                  }
                                  placeholder="Public PR"
                                  aria-label="New Output label"
                                />
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Status
                                </span>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  value={outputDraft.status}
                                  onChange={(event) =>
                                    onOutputDraftChange({
                                      ...outputDraft,
                                      status: event.target
                                        .value as InitiativeOutputStatus,
                                    })
                                  }
                                  aria-label="New Output status"
                                >
                                  {initiativeOutputStatusOptions.map(
                                    (status) => (
                                      <option key={status} value={status}>
                                        {initiativeOutputStatusLabels[status]}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Source
                                </span>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  value={outputDraft.sourceSessionId}
                                  onChange={(event) =>
                                    onOutputDraftChange({
                                      ...outputDraft,
                                      sourceSessionId: event.target.value,
                                    })
                                  }
                                  aria-label="New Output source session"
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
                                </select>
                              </label>

                              <label className="space-y-1.5 md:col-span-2">
                                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                                  Value
                                </span>
                                <Input
                                  value={outputDraft.value}
                                  onChange={(event) =>
                                    onOutputDraftChange({
                                      ...outputDraft,
                                      value: event.target.value,
                                    })
                                  }
                                  placeholder="URL, branch, file path, or note"
                                  aria-label="New Output value"
                                />
                              </label>
                            </DialogBody>

                            <DialogFooter className="border-t border-border/70 px-6 py-4">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOutputDialogOpenChange(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={outputCreateDisabled}
                              >
                                <Plus className="h-4 w-4" />
                                {isCreatingOutput
                                  ? 'Creating...'
                                  : 'Create Output'}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {outputSuggestions.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium uppercase text-muted-foreground">
                        Suggestions
                      </div>
                      {outputSuggestions.map((suggestion) => (
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
                                  onAcceptOutputSuggestion(suggestion.id)
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
                                  onDismissOutputSuggestion(suggestion.id)
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

                  {selectedOutputs.length === 0 ? (
                    <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                      No Outputs yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedOutputs.map((output) =>
                        renderOutputRow({
                          output,
                          attempts: selectedAttempts,
                          onOutputKindChange,
                          onOutputStatusChange,
                          onOutputSourceSessionChange,
                          onOutputLabelCommit,
                          onOutputValueCommit,
                          onDeleteOutput,
                        }),
                      )}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                Select or create an Initiative.
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

function renderStatusBadge(status: InitiativeStatus) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
        initiativeStatusClassNames[status],
      )}
    >
      {initiativeStatusLabels[status]}
    </span>
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
  view: InitiativeAttemptView
  onAttemptRoleChange: (attemptId: string, role: InitiativeAttemptRole) => void
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
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
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
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={attempt.role}
            onChange={(event) =>
              onAttemptRoleChange(
                attempt.id,
                event.target.value as InitiativeAttemptRole,
              )
            }
            aria-label={`Role for ${view.sessionName}`}
          >
            {initiativeAttemptRoleOptions.map((role) => (
              <option key={role} value={role}>
                {initiativeAttemptRoleLabels[role]}
              </option>
            ))}
          </select>
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

function renderOutputRow(input: {
  output: InitiativeOutput
  attempts: InitiativeAttemptView[]
  onOutputKindChange: (outputId: string, kind: InitiativeOutputKind) => void
  onOutputStatusChange: (
    outputId: string,
    status: InitiativeOutputStatus,
  ) => void
  onOutputSourceSessionChange: (
    outputId: string,
    sourceSessionId: string,
  ) => void
  onOutputLabelCommit: (outputId: string, label: string) => void
  onOutputValueCommit: (outputId: string, value: string) => void
  onDeleteOutput: (outputId: string) => void
}) {
  const {
    output,
    attempts,
    onOutputKindChange,
    onOutputStatusChange,
    onOutputSourceSessionChange,
    onOutputLabelCommit,
    onOutputValueCommit,
    onDeleteOutput,
  } = input
  const sourceAttempt = attempts.find(
    (view) => view.attempt.sessionId === output.sourceSessionId,
  )
  const outputUrl = parseHttpUrl(output.value)

  return (
    <div
      key={output.id}
      className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
    >
      <div className="grid gap-3 md:grid-cols-[150px_1fr_160px_auto]">
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Kind
          </span>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={output.kind}
            onChange={(event) =>
              onOutputKindChange(
                output.id,
                event.target.value as InitiativeOutputKind,
              )
            }
            aria-label={`Kind for ${output.label}`}
          >
            {initiativeOutputKindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {initiativeOutputKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Label
          </span>
          <Input
            defaultValue={output.label}
            onBlur={(event) => {
              const label = event.target.value.trim()
              if (label && label !== output.label) {
                onOutputLabelCommit(output.id, label)
              }
            }}
            aria-label={`Label for ${output.label}`}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase text-muted-foreground">
            Status
          </span>
          <select
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={output.status}
            onChange={(event) =>
              onOutputStatusChange(
                output.id,
                event.target.value as InitiativeOutputStatus,
              )
            }
            aria-label={`Status for ${output.label}`}
          >
            {initiativeOutputStatusOptions.map((status) => (
              <option key={status} value={status}>
                {initiativeOutputStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDeleteOutput(output.id)}
            aria-label={`Remove Output ${output.label}`}
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
              defaultValue={output.value}
              onBlur={(event) => {
                const value = event.target.value.trim()
                if (value && value !== output.value) {
                  onOutputValueCommit(output.id, value)
                }
              }}
              aria-label={`Value for ${output.label}`}
            />
            {outputUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                asChild
              >
                <a
                  href={outputUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open Output ${output.label}`}
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
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={output.sourceSessionId ?? ''}
            onChange={(event) =>
              onOutputSourceSessionChange(output.id, event.target.value)
            }
            aria-label={`Source for ${output.label}`}
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
          </select>
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
