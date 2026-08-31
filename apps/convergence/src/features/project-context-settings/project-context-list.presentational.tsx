import type { FC } from 'react'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import type { ProjectContextItem } from '@/entities/project-context'
import { Button } from '@/shared/ui/button'

interface ProjectContextListProps {
  items: ProjectContextItem[]
  isLoading: boolean
  isEmpty: boolean
  pendingDeleteId: string | null
  onCreateClick: () => void
  onEditClick: (item: ProjectContextItem) => void
  onDeleteRequest: (id: string) => void
  onDeleteConfirm: (id: string) => void
  onDeleteCancel: () => void
}

const BODY_PREVIEW_LIMIT = 120

function previewBody(body: string): string {
  const trimmed = body.trim()
  if (trimmed.length <= BODY_PREVIEW_LIMIT) return trimmed
  return `${trimmed.slice(0, BODY_PREVIEW_LIMIT)}…`
}

export const ProjectContextList: FC<ProjectContextListProps> = ({
  items,
  isLoading,
  isEmpty,
  pendingDeleteId,
  onCreateClick,
  onEditClick,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}) => {
  return (
    <div className="space-y-3" data-testid="project-context-list">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Context items</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable text blocks that can be attached to sessions in this
            project.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCreateClick}
          disabled={isLoading}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          No context items yet. Click <strong>Add</strong> to create one.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const isConfirmingDelete = pendingDeleteId === item.id
            return (
              <li
                key={item.id}
                className="rounded-lg border border-border/60 bg-card/30 px-3 py-3"
                data-testid={`project-context-item-${item.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {item.label?.trim() ? item.label : 'Untitled'}
                      </span>
                      {item.reinjectMode === 'every-turn' ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                          <Repeat className="h-3 w-3" />
                          Every turn
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200">
                          Boot
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {previewBody(item.body)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => onEditClick(item)}
                      aria-label={`Edit ${item.label ?? 'context item'}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => onDeleteRequest(item.id)}
                      aria-label={`Delete ${item.label ?? 'context item'}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {isConfirmingDelete ? (
                  <div
                    className="mt-3 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    data-testid={`project-context-delete-confirm-${item.id}`}
                  >
                    <span>Delete this context item permanently?</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onDeleteCancel}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => onDeleteConfirm(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
