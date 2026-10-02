import type { FC, ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  ReleaseNotesBundle,
  ReleaseNotesEntry,
} from './release-notes.types'
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SectionLabel,
} from '@convergence/ui'
import { Markdown } from '@/shared/ui/markdown.container'

export interface ReleaseHistoryPageItem {
  release: ReleaseNotesEntry
  absoluteIndex: number
}

interface ReleaseNotesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bundle: ReleaseNotesBundle
  /** What opens it; left out where the dialog store opens it (the sidebar's menus). */
  trigger?: ReactElement
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
    <Dialog open={open} onOpenChange={(open) => onOpenChange(open)}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      {/* A dialog you read and leave: no footer, its ✕ the way out (R6). */}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About Convergence</DialogTitle>
          <DialogDescription>
            Version {bundle.currentVersion}
            {latest?.date
              ? ` • Released ${latest.date}`
              : ' • Development build'}
          </DialogDescription>
        </DialogHeader>

        {/*
          The notes scroll, so the keyboard can reach them too: the region
          takes the focus and the arrow keys scroll it.
        */}
        <DialogBody tabIndex={0} role="region" aria-label="Release notes">
          {latest ? (
            <section className="mb-8">
              <SectionLabel as="h3" className="mb-2">
                Current release
              </SectionLabel>
              <div className="rounded-xl border border-line-soft bg-surface/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">v{latest.version}</p>
                    <p className="text-sm text-ink-muted">
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
              <SectionLabel as="h3">Release history</SectionLabel>
              {showPagination ? (
                <p className="text-2xs text-ink-muted">
                  Page {historyPage} of {historyTotalPages} •{' '}
                  {bundle.releases.length} releases
                </p>
              ) : null}
            </div>
            <div className="space-y-4">
              {historyItems.map(({ release, absoluteIndex }) => (
                <article
                  key={`${release.version}-${release.date ?? 'undated'}`}
                  className="rounded-xl border border-line-soft bg-surface/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        v{release.version}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {release.date ?? 'Development build'}
                      </p>
                    </div>
                    {absoluteIndex === 0 ? <Badge>Current</Badge> : null}
                  </div>
                  <Markdown content={release.notes} size="sm" />
                </article>
              ))}
            </div>
            {showPagination ? (
              <nav
                aria-label="Release history pagination"
                className="mt-4 flex items-center justify-between gap-3"
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    onHistoryPageChange(Math.max(1, historyPage - 1))
                  }
                  disabled={historyPage === 1}
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </Button>
                <span className="text-xs text-ink-muted" aria-live="polite">
                  {historyPage} / {historyTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    onHistoryPageChange(
                      Math.min(historyTotalPages, historyPage + 1),
                    )
                  }
                  disabled={historyPage === historyTotalPages}
                >
                  Next
                  <ChevronRight className="size-3.5" />
                </Button>
              </nav>
            ) : null}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
