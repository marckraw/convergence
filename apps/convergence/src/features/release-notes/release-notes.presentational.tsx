import type { FC } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  ReleaseNotesBundle,
  ReleaseNotesEntry,
} from './release-notes.types'
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Markdown } from '@/shared/ui/markdown.container'

export interface ReleaseHistoryPageItem {
  release: ReleaseNotesEntry
  absoluteIndex: number
}

interface ReleaseNotesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bundle: ReleaseNotesBundle
  trigger: ReactNode
  historyItems: ReleaseHistoryPageItem[]
  historyPage: number
  historyTotalPages: number
  onHistoryPageChange: (page: number) => void
}

export const ReleaseNotesDialog: FC<ReleaseNotesProps> = ({
  open,
  onOpenChange,
  bundle,
  trigger,
  historyItems,
  historyPage,
  historyTotalPages,
  onHistoryPageChange,
}) => {
  const latest = bundle.releases[0] ?? null
  const showPagination = historyTotalPages > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>About Convergence</DialogTitle>
          <DialogDescription>
            Version {bundle.currentVersion}
            {latest?.date
              ? ` • Released ${latest.date}`
              : ' • Development build'}
          </DialogDescription>
        </DialogHeader>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {latest ? (
            <section className="mb-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Current Release
              </p>
              <div className="rounded-xl border border-border/70 bg-card/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">v{latest.version}</p>
                    <p className="text-sm text-muted-foreground">
                      {latest.date ?? 'Development build'}
                    </p>
                  </div>
                </div>
                <Markdown content={latest.notes} size="sm" />
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Release History
              </p>
              {showPagination ? (
                <p className="text-[11px] text-muted-foreground">
                  Page {historyPage} of {historyTotalPages} •{' '}
                  {bundle.releases.length} releases
                </p>
              ) : null}
            </div>
            <div className="space-y-4">
              {historyItems.map(({ release, absoluteIndex }) => (
                <article
                  key={`${release.version}-${release.date ?? 'undated'}`}
                  className="rounded-xl border border-border/70 bg-card/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        v{release.version}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {release.date ?? 'Development build'}
                      </p>
                    </div>
                    {absoluteIndex === 0 ? (
                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <Markdown content={release.notes} size="sm" />
                </article>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="flex-col items-stretch justify-between gap-3 border-t border-border/70 px-6 py-4 sm:flex-row sm:items-center">
          {showPagination ? (
            <nav
              aria-label="Release history pagination"
              className="flex items-center justify-between gap-3 sm:min-w-64 sm:justify-start"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onHistoryPageChange(Math.max(1, historyPage - 1))
                }
                disabled={historyPage === 1}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {historyPage} / {historyTotalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onHistoryPageChange(
                    Math.min(historyTotalPages, historyPage + 1),
                  )
                }
                disabled={historyPage === historyTotalPages}
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </nav>
          ) : (
            <span aria-hidden />
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" className="sm:w-auto">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
