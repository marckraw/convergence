import type { FC, ReactNode } from 'react'
import type {
  CodeReviewGuideContent,
  CodeReviewGuideSection,
} from '@/entities/code-review-guide'
import { Button } from '@/shared/ui/button'
import { Markdown } from '@/shared/ui/markdown.container'
import { CodeReviewGuideFileDiff } from './code-review-guide-file-diff.presentational'
import { CodeReviewRiskBadge } from './code-review-risk-badge.presentational'

interface CodeReviewGuideViewProps {
  guide: CodeReviewGuideContent
  getFileDiff: (filePath: string) => string
  isFileLoading: (filePath: string) => boolean
  renderSectionRef: (sectionId: string) => (node: HTMLElement | null) => void
  renderFileRef: (filePath: string) => (node: HTMLElement | null) => void
  onSelectFile: (filePath: string) => void
}

export const CodeReviewGuideView: FC<CodeReviewGuideViewProps> = ({
  guide,
  getFileDiff,
  isFileLoading,
  renderSectionRef,
  renderFileRef,
  onSelectFile,
}) => {
  if (guide.sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
        No changed files detected for this guide.
      </div>
    )
  }

  return (
    <main className="app-scrollbar h-full min-w-0 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full max-w-[1440px] flex-col">
        {guide.sections.map((section, index) => (
          <section
            key={section.id}
            ref={renderSectionRef(section.id)}
            className="grid min-h-full min-w-0 scroll-mt-0 grid-cols-[minmax(260px,360px)_minmax(0,1fr)] gap-5 border-b border-border px-5 py-5"
          >
            <div className="sticky top-0 self-start bg-background py-1">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {String(index + 1).padStart(2, '0')} /{' '}
                    {String(guide.sections.length).padStart(2, '0')}
                  </p>
                  <h2 className="mt-3 text-2xl leading-8 font-semibold">
                    {section.title}
                  </h2>
                  <Markdown
                    content={section.summary}
                    size="sm"
                    className="mt-3 text-sm leading-6 text-muted-foreground [&_p]:my-0 [&_p]:text-sm [&_p]:leading-6"
                  />
                </div>
                <CodeReviewRiskBadge section={section} />
              </div>
              <Markdown
                content={section.narrative}
                size="sm"
                className="mt-5 text-sm leading-6 text-foreground [&_p]:my-0 [&_p]:text-sm [&_p]:leading-6"
              />
              <div className="mt-5 flex flex-col gap-1.5">
                {section.files.map((file) => (
                  <Button
                    key={file.path}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-between gap-2 px-2 font-mono text-[11px]"
                    title={file.path}
                    onClick={() => onSelectFile(file.path)}
                  >
                    <span className="min-w-0 truncate">{file.path}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {file.status}
                    </span>
                  </Button>
                ))}
              </div>
              {renderChecklist(section)}
            </div>
            <div className="flex min-w-0 flex-col gap-4 pb-5">
              {section.files.map((file) => (
                <CodeReviewGuideFileDiff
                  key={file.path}
                  file={file}
                  diff={getFileDiff(file.path)}
                  loading={isFileLoading(file.path)}
                  renderRef={renderFileRef(file.path)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

function renderChecklist(section: CodeReviewGuideSection): ReactNode {
  if (section.checklist.length === 0) return null

  return (
    <div className="mt-3 grid gap-1">
      {section.checklist.map((item) => (
        <div
          key={item}
          className="flex min-w-0 items-start gap-2 text-[11px] leading-5 text-muted-foreground"
        >
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <Markdown
            content={item}
            size="sm"
            className="[&_p]:my-0 [&_p]:text-[11px] [&_p]:leading-5"
          />
        </div>
      ))}
    </div>
  )
}
