import { cn } from '@convergence/ui'
import { LoomSheetView } from './loom-sheet.presentational'
import { LOOM_SHEET_ICONS, LOOM_SHEET_ICON_CLASS } from './loom-sheet.styles'
import { LoomTitleView } from './loom-title.presentational'
import { loomSheetCounts, loomSheetTitle } from './loom-sheets.pure'
import { LOOM_SHEETS, LOOM_SHEET_NAMES } from './wave-panel-sheet.pure'
import type { LoomStackProps } from './loom-stack.types'

const icons = LOOM_SHEET_ICONS

/** One paper stack in two orientations; only the selected sheet owns a body. */
export function LoomStackView({
  wide = false,
  ...props
}: LoomStackProps & { wide?: boolean }) {
  const counts = loomSheetCounts(
    props.sheets,
    props.now,
    props.horses,
    props.dispatchPlan,
  )
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
              // Paper: the muted surface lifted by the sheet's own shadow, the
              // open one on the full surface lifted further (R11: the
              // handoff's shadows are the --elevation-sheet tokens).
              'relative flex min-h-0 min-w-0 flex-col rounded-xl border border-hairline bg-surface-muted shadow-sheet transition-layout duration-panel ease-out motion-reduce:transition-none',
              wide && 'rounded-2xl',
              open && 'bg-surface shadow-sheet-open',
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
                'h-auto min-h-11 shrink-0 justify-start whitespace-normal rounded-xl border-0 px-3 py-3 text-xs',
                wide && open && 'px-6 pt-5 text-sm',
                wide &&
                  !open &&
                  'h-full flex-col justify-start gap-3 px-1 pt-5 text-center text-2xs',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn('size-4 shrink-0', LOOM_SHEET_ICON_CLASS[sheet])}
              />
              {wide && !open ? (
                <>
                  <span>{LOOM_SHEET_NAMES[sheet]}</span>
                  <span className="text-3xs leading-relaxed text-ink-muted">
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
