import type { FC } from 'react'
import type { ReactNode } from 'react'
import type { ReleaseNotesBundle } from './release-notes.types'
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

interface ReleaseNotesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bundle: ReleaseNotesBundle
  trigger: ReactNode
}

export const ReleaseNotesDialog: FC<ReleaseNotesProps> = ({
  open,
  onOpenChange,
  bundle,
  trigger,
}) => {
  const latest = bundle.releases[0] ?? null

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
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Release History
            </p>
            <div className="space-y-4">
              {bundle.releases.map((release, index) => (
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
                    {index === 0 ? (
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

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
