import type { FC } from 'react'
import type { CodeReviewGuideFile } from '@/entities/code-review-guide'
import { PierreDiffViewer } from '@/widgets/session-view'

interface CodeReviewGuideFileDiffProps {
  sectionId: string
  file: CodeReviewGuideFile
  diff: string
  loading: boolean
  renderRef: (node: HTMLElement | null) => void
}

export const CodeReviewGuideFileDiff: FC<CodeReviewGuideFileDiffProps> = ({
  sectionId,
  file,
  diff,
  loading,
  renderRef,
}) => (
  <article
    ref={renderRef}
    data-guide-section-id={sectionId}
    data-guide-file-path={file.path}
    className="min-w-0 scroll-mt-5 border border-border bg-card"
  >
    <div className="border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {file.status}
        </span>
        <p className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {file.reason}
      </p>
    </div>
    <div className="h-[560px] min-h-0">
      <PierreDiffViewer
        file={file.path}
        diff={diff}
        loading={loading}
        title="Guide section diff"
        emptyMessage="Loading file diff..."
      />
    </div>
  </article>
)
