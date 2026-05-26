import type { FC } from 'react'
import {
  Eye,
  MessageSquareText,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Send,
  X,
} from 'lucide-react'
import type { CodeReviewTarget } from '@/entities/code-review'
import type {
  ReviewNote,
  ReviewNotePacketPreview,
} from '@/entities/review-note'
import {
  formatReviewNoteFilterLabel,
  formatSelectionSummary,
  type ReviewNoteFilter,
  type ReviewNoteGroup,
} from '@/features/code-review-notes'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { NoSessionActions } from './no-session-actions.presentational'
import { NoteComposer } from './note-composer.presentational'
import { ReviewNoteItem } from './review-note-item.presentational'

interface CodeReviewNotesRailProps {
  target: CodeReviewTarget | null
  selectedFile: string | null
  selectedLineCount: number
  selectionSummary: {
    oldStartLine: number | null
    oldEndLine: number | null
    newStartLine: number | null
    newEndLine: number | null
  }
  draftCount: number
  noteGroups: ReviewNoteGroup[]
  noteFilter: ReviewNoteFilter
  noteStateCounts: Record<ReviewNoteFilter, number>
  packetPreview: ReviewNotePacketPreview | null
  packetPreviewOpen: boolean
  error: string | null
  activeNoteId: string | null
  staleNoteIds: ReadonlySet<string>
  collapsed: boolean
  lineComposerOpen: boolean
  lineDraftBody: string
  fileComposerOpen: boolean
  fileDraftBody: string
  editingNoteId: string | null
  editingBody: string
  onNoteFilterChange: (filter: ReviewNoteFilter) => void
  onToggleCollapsed: () => void
  onOpenLineComposer: () => void
  onCancelLineComposer: () => void
  onLineDraftBodyChange: (value: string) => void
  onCreateLineNote: () => void
  onOpenFileComposer: () => void
  onCancelFileComposer: () => void
  onFileDraftBodyChange: (value: string) => void
  onCreateFileNote: () => void
  onPreviewPacket: () => void
  onClosePacketPreview: () => void
  onSendPacket: () => void
  onJumpToNote: (note: ReviewNote) => void
  onEditNote: (note: ReviewNote) => void
  onEditingBodyChange: (value: string) => void
  onCancelEdit: () => void
  onSaveNote: (noteId: string) => void
  onResolveNote: (note: ReviewNote) => void
  onReopenNote: (note: ReviewNote) => void
  onDeleteNote: (note: ReviewNote) => void
}

const REVIEW_NOTE_FILTERS: ReviewNoteFilter[] = [
  'all',
  'draft',
  'sent',
  'resolved',
]

export const CodeReviewNotesRail: FC<CodeReviewNotesRailProps> = ({
  target,
  selectedFile,
  selectedLineCount,
  selectionSummary,
  draftCount,
  noteGroups,
  noteFilter,
  noteStateCounts,
  packetPreview,
  packetPreviewOpen,
  error,
  activeNoteId,
  staleNoteIds,
  collapsed,
  lineComposerOpen,
  lineDraftBody,
  fileComposerOpen,
  fileDraftBody,
  editingNoteId,
  editingBody,
  onNoteFilterChange,
  onToggleCollapsed,
  onOpenLineComposer,
  onCancelLineComposer,
  onLineDraftBodyChange,
  onCreateLineNote,
  onOpenFileComposer,
  onCancelFileComposer,
  onFileDraftBodyChange,
  onCreateFileNote,
  onPreviewPacket,
  onClosePacketPreview,
  onSendPacket,
  onJumpToNote,
  onEditNote,
  onEditingBodyChange,
  onCancelEdit,
  onSaveNote,
  onResolveNote,
  onReopenNote,
  onDeleteNote,
}) => {
  const sessionLinked = !!target?.sessionId
  const canCreateLineNote =
    sessionLinked && !!selectedFile && selectedLineCount > 0
  const canCreateFileNote = sessionLinked && !!selectedFile

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center border-l border-border">
        <div className="flex h-10 w-full shrink-0 items-center justify-center border-b border-border">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Expand review notes"
            aria-label="Expand review notes"
            onClick={onToggleCollapsed}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2">
          <div
            className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card"
            title="Review notes"
          >
            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
            {draftCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] leading-4 text-primary-foreground">
                {draftCount}
              </span>
            ) : null}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-border">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Review Notes
        </span>
        <div className="flex items-center gap-2">
          {draftCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {draftCount} draft
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Collapse review notes"
            aria-label="Collapse review notes"
            onClick={onToggleCollapsed}
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!sessionLinked ? (
          <NoSessionActions />
        ) : (
          <>
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={!canCreateLineNote}
                onClick={onOpenLineComposer}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add line note
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                disabled={!canCreateFileNote}
                onClick={onOpenFileComposer}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add file note
              </Button>
            </div>

            {selectedLineCount > 0 && selectedFile ? (
              <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {selectedLineCount}{' '}
                  {selectedLineCount === 1 ? 'line' : 'lines'} selected
                </p>
                <p className="mt-1">
                  {formatSelectionSummary(selectionSummary)}
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
                Select changed diff lines to prepare a line note, or create a
                file note from the selected file.
              </div>
            )}

            {lineComposerOpen ? (
              <NoteComposer
                label="Review note body"
                value={lineDraftBody}
                placeholder="Ask a question or leave a draft review note..."
                onChange={onLineDraftBodyChange}
                onCancel={onCancelLineComposer}
                onSave={onCreateLineNote}
              />
            ) : null}

            {fileComposerOpen ? (
              <NoteComposer
                label="File-level review note body"
                value={fileDraftBody}
                placeholder="Ask a file-level question..."
                onChange={onFileDraftBodyChange}
                onCancel={onCancelFileComposer}
                onSave={onCreateFileNote}
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-1">
              {REVIEW_NOTE_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={noteFilter === filter ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onNoteFilterChange(filter)}
                >
                  {formatReviewNoteFilterLabel(filter, noteStateCounts[filter])}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={draftCount === 0}
                onClick={onSendPacket}
              >
                <Send className="h-3.5 w-3.5" />
                Ask AI
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={draftCount === 0}
                onClick={onPreviewPacket}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview packet
              </Button>
            </div>
          </>
        )}

        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

        {packetPreviewOpen && packetPreview ? (
          <div className="space-y-2 rounded-md border border-border bg-background/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground">
                AI packet preview
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClosePacketPreview}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              readOnly
              value={packetPreview.text}
              className="max-h-80 min-h-48 resize-y font-mono text-[11px]"
              aria-label="Review packet preview"
            />
          </div>
        ) : null}

        {noteGroups.length === 0 && sessionLinked ? (
          <p className="text-xs text-muted-foreground">
            No {noteFilter === 'all' ? '' : `${noteFilter} `}review notes.
          </p>
        ) : null}

        {noteGroups.map((group) => (
          <div
            key={group.filePath}
            className="rounded-md border border-border bg-background/50 p-2"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-[11px] font-medium text-foreground">
                {group.filePath}
              </p>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {group.notes.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.notes.map((note) => (
                <ReviewNoteItem
                  key={note.id}
                  note={note}
                  active={note.id === activeNoteId}
                  stale={staleNoteIds.has(note.id)}
                  editing={editingNoteId === note.id}
                  editingBody={editingBody}
                  onJumpToNote={onJumpToNote}
                  onEditNote={onEditNote}
                  onEditingBodyChange={onEditingBodyChange}
                  onCancelEdit={onCancelEdit}
                  onSaveNote={onSaveNote}
                  onResolveNote={onResolveNote}
                  onReopenNote={onReopenNote}
                  onDeleteNote={onDeleteNote}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
