import { CheckCircle2, Layers, Pencil, Timer } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { LoomSheetView } from './loom-sheet.presentational'
import { LoomTitleView } from './loom-title.presentational'
import { loomSheetCounts, loomSheetTitle } from './loom-sheets.pure'
import { LOOM_SHEETS, LOOM_SHEET_NAMES } from './wave-panel-sheet.pure'
import type { LoomStackProps } from './loom-stack.types'

/**
 * The four sheets' icons, one map (MAR-3201 R2).
 *
 * Exported so the guide's illustration draws the icons the stack draws,
 * rather than a second list that could quietly disagree with the panel it
 * is teaching.
 */
export const LOOM_SHEET_ICONS = {
  before: CheckCircle2,
  now: Timer,
  next: Layers,
  plan: Pencil,
}

/**
 * What colour each sheet's icon wears, in one place.
 *
 * The guide's illustration draws the same four icons as the real stack, and
 * the frames colour them identically (`559:815` emerald, `559:821` sky, the
 * other two muted). Written once so the two surfaces cannot drift apart.
 */
export const LOOM_SHEET_ICON_CLASS = {
  before: 'text-emerald-500',
  now: 'text-sky-400',
  next: '',
  plan: '',
}

const icons = LOOM_SHEET_ICONS

/** One paper stack in two orientations; only the selected sheet owns a body. */
export function LoomStackView({
  wide = false,
  ...props
}: LoomStackProps & { wide?: boolean }) {
  const counts = loomSheetCounts(props.sheets, props.now, props.horses)
  const selected = LOOM_SHEETS.indexOf(props.open)
  return (
    <div
      className={cn(
        'isolate flex min-h-0 min-w-0 flex-1',
        wide ? 'flex-row px-6 pb-6' : 'flex-col px-3 pb-3',
      )}
    >
      {LOOM_SHEETS.map((sheet, index) => {
        const open = sheet === props.open
        const after = index > selected
        const title = loomSheetTitle(sheet, counts)
        const Icon = icons[sheet]
        return (
          <div
            key={sheet}
            data-loom-paper={sheet}
            className={cn(
              'relative flex min-h-0 min-w-0 flex-col rounded-xl border border-foreground/10 bg-muted shadow-[0_3px_12px_rgba(0,0,0,0.16)] transition-[flex-basis,flex-grow,padding] duration-200 ease-out motion-reduce:transition-none',
              wide && 'rounded-2xl',
              open && 'bg-card shadow-[0_4px_20px_rgba(0,0,0,0.22)]',
            )}
            style={{
              zIndex: 4 - Math.abs(index - selected),
              flex: open ? '1 1 0%' : `0 0 ${wide ? 104 : 86}px`,
              ...(wide
                ? {
                    marginLeft: index ? -40 : 0,
                    paddingLeft: after ? 40 : 0,
                    paddingRight: !open && !after ? 40 : 0,
                  }
                : {
                    marginTop: index ? -40 : 0,
                    paddingTop: after ? 40 : 0,
                    paddingBottom: !open && !after ? 40 : 0,
                  }),
            }}
          >
            <LoomTitleView
              sheet={sheet}
              title={title}
              open={open}
              onSelect={() => props.onSelectSheet(sheet)}
              titleRef={props.titleRef}
              className={cn(
                'h-auto min-h-[44px] shrink-0 justify-start whitespace-normal rounded-xl border-0 px-3 py-3 text-xs',
                wide && open && 'px-6 pt-5 text-sm',
                wide &&
                  !open &&
                  'h-full flex-col justify-start gap-3 px-1 pt-5 text-center text-[11px]',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn('size-4 shrink-0', LOOM_SHEET_ICON_CLASS[sheet])}
              />
              {wide && !open ? (
                <>
                  <span>{LOOM_SHEET_NAMES[sheet]}</span>
                  <span className="text-[10px] leading-relaxed text-muted-foreground">
                    {title.split(' · ').slice(1).join(' · ')}
                  </span>
                </>
              ) : (
                <span>{title}</span>
              )}
            </LoomTitleView>
            {open ? (
              <LoomSheetView
                {...props}
                sheet={sheet}
                wide={wide}
                bodyRef={props.bodyRef}
                onScroll={props.onBodyScroll}
                className={wide ? 'px-3 pb-5' : 'px-1 pb-3'}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
