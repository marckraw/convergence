import { useCallback, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Info } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import releaseNotesBundle from '@/shared/generated/release-notes.generated.json'
import { Button } from '@/shared/ui/button'
import { ReleaseNotesDialog } from './release-notes.presentational'
import type { ReleaseNotesBundle } from './release-notes.types'

const bundle = releaseNotesBundle as ReleaseNotesBundle
const HISTORY_PAGE_SIZE = 5

export const ReleaseNotesDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'release-notes')
  const openDialog = useDialogStore((s) => s.open)
  const closeDialog = useDialogStore((s) => s.close)
  const [historyPage, setHistoryPage] = useState(1)

  const historyTotalPages = Math.max(
    1,
    Math.ceil(bundle.releases.length / HISTORY_PAGE_SIZE),
  )
  const safePage = Math.min(Math.max(1, historyPage), historyTotalPages)

  const historyItems = useMemo(() => {
    const start = (safePage - 1) * HISTORY_PAGE_SIZE
    return bundle.releases
      .slice(start, start + HISTORY_PAGE_SIZE)
      .map((release, offset) => ({
        release,
        absoluteIndex: start + offset,
      }))
  }, [safePage])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        openDialog('release-notes')
      } else {
        setHistoryPage(1)
        closeDialog()
      }
    },
    [openDialog, closeDialog],
  )

  return (
    <ReleaseNotesDialog
      open={open}
      onOpenChange={handleOpenChange}
      bundle={bundle}
      historyItems={historyItems}
      historyPage={safePage}
      historyTotalPages={historyTotalPages}
      onHistoryPageChange={setHistoryPage}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5" />
            What&apos;s New
          </span>
          <span className="text-[11px] text-muted-foreground/80">
            v{bundle.currentVersion}
          </span>
        </Button>
      }
    />
  )
}
