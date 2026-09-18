import type { FC } from 'react'
import { PanelLeftClose } from 'lucide-react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { WaveHeader, WaveSections } from './wave-sections.pure'
import { WaveSectionView } from './wave-section.presentational'
import {
  WAVE_OUTAGE_DOT_CLASS,
  WAVE_PANEL_COLUMN_CLASS,
} from './wave-panel.styles'

export interface WavePanelViewProps {
  sections: WaveSections
  header: WaveHeader
  /** `column` beside the conversation; `full` as Mission Control's tab. */
  layout: 'column' | 'full'
  /** The board's own line ("N issues · M waiting on you"), full layout. */
  boardLine?: string
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  onCollapse?: () => void
}

/**
 * The ledger on screen (MAR-3097): four sections from one pure result, with a
 * header that says an outage by its age and never as a zero (R3). The same
 * view is the column and Mission Control's Waves tab (R6). The column scrolls
 * itself; the full tab lives inside Mission Control's scroller and does not
 * add a second one.
 */
export const WavePanelView: FC<WavePanelViewProps> = ({
  sections,
  header,
  layout,
  boardLine,
  inertReason,
  onOpen,
  onCollapse,
}) => (
  <aside
    aria-label="Waves"
    data-wave-panel={layout}
    className={cn(
      layout === 'column' ? WAVE_PANEL_COLUMN_CLASS : 'flex w-full flex-col',
    )}
  >
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
      <h2 className="text-xs font-semibold tracking-tight">Waves</h2>
      {boardLine ? (
        <p data-wave-board-line className="text-[11px] text-muted-foreground">
          {boardLine}
        </p>
      ) : null}
      {header.kind === 'outage' || header.kind === 'reading' ? (
        <span
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-[11px]',
            header.kind === 'outage'
              ? 'text-amber-300/90'
              : 'text-muted-foreground',
          )}
        >
          {header.kind === 'outage' ? (
            <span className={WAVE_OUTAGE_DOT_CLASS} />
          ) : null}
          {header.text}
        </span>
      ) : null}
      <span className="flex-1" />
      {onCollapse ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Collapse the wave panel"
          className="size-6 p-0"
          onClick={onCollapse}
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      ) : null}
    </div>

    {header.kind === 'connect' ? (
      <div className="flex flex-col gap-2 px-3 py-4 text-xs text-muted-foreground">
        <p>No crew reads a tracker yet.</p>
        {/* Prose, not a control (MAR-3148 R2): this state is only reachable
            in Mission Control's Waves tab, which is already where crews are
            bound -- a button here would lead to the room it is standing in. */}
        <p>Connect a tracker in a crew’s settings on the Canvas.</p>
      </div>
    ) : header.kind === 'quiet' ? (
      <p className="px-3 py-4 text-xs text-muted-foreground">Quiet project</p>
    ) : (
      <div
        className={cn(
          'pb-3',
          layout === 'column' && 'app-scrollbar min-h-0 flex-1 overflow-y-auto',
        )}
      >
        <WaveSectionView
          title="Waiting on you"
          rows={sections.waitingOnYou}
          inertReason={inertReason}
          onOpen={onOpen}
        />
        <WaveSectionView
          title="In the wave"
          rows={sections.inTheWave}
          inertReason={inertReason}
          onOpen={onOpen}
        />
        <WaveSectionView
          title="Waiting to start"
          rows={sections.waitingToStart}
          inertReason={inertReason}
          onOpen={onOpen}
        />
        {sections.waves.length > 0 ? (
          <section aria-label="Waves by wave" className="flex flex-col">
            {sections.waves.map((group) => (
              <WaveSectionView
                key={group.wave}
                title={`Wave ${group.wave}`}
                rows={group.rows}
                inertReason={inertReason}
                onOpen={onOpen}
                disclosure={layout === 'column' ? 'closed' : 'open'}
              />
            ))}
          </section>
        ) : null}
      </div>
    )}
  </aside>
)
