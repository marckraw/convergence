import type { FC, ReactNode } from 'react'
import {
  CalendarClock,
  FileText,
  GitPullRequest,
  Plus,
  Save,
} from 'lucide-react'
import type { Initiative, InitiativeStatus } from '@/entities/initiative'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
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

export interface InitiativeDraft {
  title: string
  status: InitiativeStatus
  currentUnderstanding: string
}

interface InitiativeWorkboardProps {
  open: boolean
  trigger?: ReactNode
  initiatives: Initiative[]
  selectedInitiative: Initiative | null
  selectedDraft: InitiativeDraft
  createTitle: string
  attemptCounts: Record<string, number>
  outputCounts: Record<string, number>
  isLoading: boolean
  isCreating: boolean
  isSaving: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onCreate: () => void
  onSelectInitiative: (id: string) => void
  onDraftChange: (draft: InitiativeDraft) => void
  onSave: () => void
}

export const InitiativeWorkboardDialog: FC<InitiativeWorkboardProps> = ({
  open,
  trigger,
  initiatives,
  selectedInitiative,
  selectedDraft,
  createTitle,
  attemptCounts,
  outputCounts,
  isLoading,
  isCreating,
  isSaving,
  error,
  onOpenChange,
  onCreateTitleChange,
  onCreate,
  onSelectInitiative,
  onDraftChange,
  onSave,
}) => {
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const saveDisabled =
    !selectedInitiative || selectedDraft.title.trim().length === 0 || isSaving

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
