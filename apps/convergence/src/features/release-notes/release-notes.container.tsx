import { useCallback, useMemo, useState, type ReactElement } from 'react'
import type { FC } from 'react'
import { Info } from 'lucide-react'
import { useDialogStore } from '@/entities/dialog'
import { RELEASE_NOTES_TITLE } from '@/entities/updates'
import releaseNotesBundle from '@/shared/generated/release-notes.generated.json'
import { Button } from '@convergence/ui'
import { ReleaseNotesDialog } from './release-notes.presentational'
import type { ReleaseNotesBundle } from './release-notes.types'

const bundle = releaseNotesBundle as ReleaseNotesBundle
const HISTORY_PAGE_SIZE = 5

interface ReleaseNotesDialogContainerProps {
  trigger?: ReactElement
}

export const ReleaseNotesDialogContainer: FC<
  ReleaseNotesDialogContainerProps
> = ({ trigger }) => {
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
        trigger ?? (
          <Button
            type="button"
            variant="quiet"
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Info className="size-3.5" />
              {RELEASE_NOTES_TITLE}
            </span>
            <span className="text-2xs text-ink-muted">
              v{bundle.currentVersion}
            </span>
          </Button>
        )
      }
    />
  )
}
