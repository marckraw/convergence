import type { FC } from 'react'
import type { CodeReviewGuideFile } from '@/entities/code-review-guide'
import { DiffFileHeader, PierreDiffViewer } from '@/widgets/session-view'

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
    <DiffFileHeader
      path={file.path}
      status={file.status}
      subtitle={file.reason}
      subtitleVariant="description"
      loading={loading}
    />
    <div className="h-[560px] min-h-0">
      <PierreDiffViewer
        file={file.path}
        diff={diff}
        loading={loading}
        showFileHeader={false}
        emptyMessage="Loading file diff..."
      />
    </div>
  </article>
)
