import type { FC } from 'react'
import { Info } from 'lucide-react'
import releaseNotesBundle from '@/shared/generated/release-notes.generated.json'
import { Button } from '@/shared/ui/button'
import { ReleaseNotesDialog } from './release-notes.presentational'
import type { ReleaseNotesBundle } from './release-notes.types'

const bundle = releaseNotesBundle as ReleaseNotesBundle

export const ReleaseNotesDialogContainer: FC = () => {
  return (
    <ReleaseNotesDialog
      bundle={bundle}
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
