import type { ExecutionBarView } from './execution-bar.pure'

/**
 * Every visual knob of the Execution Bar (MAR-2642).
 *
 * One file on purpose: this strip sits under the composer on every screen, so
 * "smaller" or "quieter" is a note Marcin will make on sight and the answer
 * has to be one line, not a hunt through JSX.
 *
 * The strip is a second surface, not a row inside the first. It is a sibling of
 * the composer card, tucked up behind it, inset so the card's corners overhang
 * it, and darker in tone so it reads as the layer underneath. Each of those
 * four is its own constant below, because "more overhang" and "show less of it"
 * are separate notes and each has to be a single edit.
 */

/**
 * How far the card overhangs the strip on each side. Larger = more visibly
 * stacked; this is the knob that sells the depth, so it is the first one to
 * turn when the effect reads too flat.
 */
const stripInsetClass = 'mx-3'

/**
 * How deep the strip tucks up behind the card. Must stay smaller than the
 * clearance below it, or the strip's own content hides under the card's bottom
 * edge.
 */
const stripTuckClass = '-mt-4'

/** Top padding that carries the content clear of the card's bottom edge. */
const stripClearanceClass = 'pt-6'

/** The band of strip still showing below its content. */
const stripPeekClass = 'pb-2'

/**
 * The recessed surface. `bg-sidebar` is the surface token that sits darker than
 * `bg-card` in both themes; `bg-muted` inverts in dark mode and would read as a
 * layer raised above the composer rather than below it.
 *
 * Rounded and bordered on the bottom and sides only: the top edge lives behind
 * the card and a `border-t` here would be the old row-separator idea, which
 * said "one surface, divided" instead of "two surfaces, stacked".
 */
const stripSurfaceClass =
  'rounded-b-xl border-x border-b border-border/60 bg-sidebar'

/**
 * The strip's half of the stacking order. Both layers are positioned on purpose
 * so document order does not decide the paint: the strip is a later sibling and
 * would otherwise paint over the card it is meant to sit under.
 */
const stripDepthClass = 'relative z-0'

/** The tier itself: a recessed plate peeking out from beneath the composer. */
export const stripClass = [
  'flex flex-wrap items-center gap-x-2 gap-y-1 px-3',
  stripInsetClass,
  stripTuckClass,
  stripClearanceClass,
  stripPeekClass,
  stripSurfaceClass,
  stripDepthClass,
].join(' ')

/**
 * The composer card's half of the stack: above the strip, and casting a shadow
 * onto it. The shadow is what makes the card read as *resting on* the strip
 * rather than merely overlapping it, so dial it with the inset, not alone.
 */
const composerCardDepthClass = 'relative z-10 shadow-md'

/**
 * The card's depth, one entry per strip state.
 *
 * A shadow is a claim that something sits underneath. On a global chat, or a
 * composer with no Endpoint configured, the strip does not render at all, and
 * the depth would be the card claiming a layer over nothing.
 *
 * A map keyed on the mode union rather than a lookup function: a new
 * `ExecutionBarView` mode is then a compile error here, where the answer has to
 * be decided, instead of falling through to the quietest possible default. The
 * plain class is not exported, so an unconditional depth is not a thing a
 * caller can reach for.
 */
export const composerCardDepthClassByMode: Record<
  ExecutionBarView['mode'],
  string
> = {
  hidden: '',
  choosing: composerCardDepthClass,
  settled: composerCardDepthClass,
}

/*
 * The type treatment below is the strip's prominence, and it is ruled QUIET
 * (Marcin, 2026-08-27, MAR-2642). The warning is the one exception: it is loud
 * because a session that will refuse to run is a live signal, not context.
 *
 * Fable asked whether the machine name should carry more presence than the
 * model name in the row above, given that it governs everything above it.
 * The answer, verbatim: "lets do quiet until i look". So the faintness here is
 * a decision, not an oversight, and "the most important layer is also the
 * faintest" is the reading that was heard and declined.
 *
 * The reason it holds: the machine is stable context, not a live signal. You
 * look at it when you care which machine — which is rarely, and deliberately —
 * while the row above it changes turn to turn and has to be readable without
 * looking. Loudening these is Marcin's call to make on sight, not a round's.
 *
 * A comment cannot protect an absence, so it does not have to: the canary in
 * `composer.container.test.tsx` pins the label, the chooser and the fact at
 * this scale and tone, and pins the warning as the one deliberate exception.
 * Loudening any of them turns it red, naming the ruling in the failure.
 */

/** "Runs on". */
export const stripLabelClass = 'text-[11px] font-medium text-muted-foreground'

/** The chooser, while a session is being born. */
export const stripSelectClass =
  'h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground'

/** The machine, once the session is live and the choice is no longer one. */
export const stripFactClass =
  'rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground'

/**
 * A sentence in the strip rather than a control: the machine being asked where
 * it can work, or the reason nothing can be offered (MAR-2689).
 *
 * The same size and tone as the label beside it, because it stands in the same
 * tier and reads as context, not as an alarm. The one loud thing on this strip
 * is still the removed-endpoint warning below, and it stays the only one.
 */
export const stripNoticeClass = 'text-[11px] text-muted-foreground'

/** A live session whose machine is gone. */
export const stripWarningClass =
  'flex min-w-0 items-center gap-1 text-[11px] text-warning-foreground'

export const stripWarningIconClass = 'h-3 w-3 shrink-0'

/**
 * The branch field: a written value, not a chosen one (MAR-2694).
 *
 * Sized and toned as the chooser beside it, so the second slot reads as one
 * tier rather than a control with an accessory bolted on. Narrow on purpose —
 * a branch name is short, and the strip is quiet by ruling — with a border,
 * which the chooser does not have, because this is the one element on the
 * strip that takes typing and has to look like it does.
 */
export const stripInputClass =
  'h-6 w-40 border-border/60 px-1.5 text-[11px] shadow-none'
