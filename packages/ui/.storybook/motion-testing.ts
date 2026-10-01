import { expect, waitFor } from 'storybook/test'

/*
 * Helpers for play functions about motion: what is still moving on an
 * element, what it looked like mid-animation, and a way to wait until it has
 * stopped. Ported from accent.'s Storybook (MAR-3611); Convergence animates
 * with CSS only, so the hooks into the Motion library are left out.
 */

/** The CSS transitions and animations still running on an element. */
export const runningAnimations = (element: Element): Animation[] =>
  element
    .getAnimations()
    .filter((animation) => animation.playState === 'running')

/**
 * Resolves once nothing animates on the element. End a play function that
 * acted mid-animation with it, so the accessibility check afterwards sees the
 * finished state, not text halfway through a fade.
 */
export const settled = (element: Element) =>
  waitFor(() => expect(runningAnimations(element)).toHaveLength(0))

/**
 * Resolves once a Base UI popup has arrived: its first frame is over (no
 * `data-starting-style`, so its transition has begun) and nothing animates
 * on it any more. `settled` alone can resolve before the transition starts,
 * while the popup still stands at its first frame, faded and small.
 */
export const arrived = async (element: Element) => {
  await waitFor(() =>
    expect(element.hasAttribute('data-starting-style')).toBe(false),
  )
  await settled(element)
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/** Finite animations started from script (the Web Animations API). */
const scriptedAnimations = () =>
  document
    .getAnimations()
    .filter(
      (animation) =>
        !(
          animation instanceof CSSAnimation ||
          animation instanceof CSSTransition
        ) &&
        animation.playState !== 'finished' &&
        animation.effect?.getComputedTiming().endTime !==
          Number.POSITIVE_INFINITY,
    )

/**
 * Jumps every animation started from script to its end, looking over a few
 * frames because a script may start one a frame after the render that asked
 * for it. In tests Storybook freezes CSS animations and transitions at their
 * end before the accessibility check, but that does not reach the Web
 * Animations API. CSS animations are left alone: Storybook shows those
 * reversed, and finishing one would jump it back to its first frame.
 */
export const finishScriptedAnimations = async () => {
  for (let frame = 0; frame < 3; frame += 1) {
    await nextFrame()
    for (const animation of scriptedAnimations()) animation.finish()
  }
}

/**
 * Resolves once the browser is idle (or after a second at most), so the
 * accessibility check judges the page at rest.
 */
export const untilIdle = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 1_000 })
    } else {
      setTimeout(resolve, 50)
    }
  })

/** A custom property as it resolves on an element. */
export const tokenOn = (element: Element, name: `--${string}`): string =>
  getComputedStyle(element).getPropertyValue(name).trim()

/** The scale an element is drawn at right now, from `scale` and `transform`. */
export const drawnScale = (element: Element): number => {
  const style = getComputedStyle(element)
  const property = style.scale === 'none' ? 1 : Number.parseFloat(style.scale)
  const matrix =
    style.transform === 'none'
      ? new DOMMatrix()
      : new DOMMatrix(style.transform)
  return property * Math.hypot(matrix.a, matrix.b)
}

/** How far an element is drawn off its place vertically right now, in px. */
export const drawnShiftY = (element: Element): number => {
  const style = getComputedStyle(element)
  const matrix =
    style.transform === 'none'
      ? new DOMMatrix()
      : new DOMMatrix(style.transform)
  const translate =
    style.translate === 'none'
      ? 0
      : Number.parseFloat(style.translate.split(' ')[1] ?? '0')
  return matrix.f + translate
}

const keyframeFields = new Set([
  'offset',
  'computedOffset',
  'easing',
  'composite',
])

/** What an animation animates: a CSS transition's property, or its keyframes' keys. */
const animatedProperties = (animation: Animation): string[] => {
  const transition = (animation as Partial<CSSTransition>).transitionProperty
  if (transition) return [transition]
  const keyframes =
    animation.effect instanceof KeyframeEffect
      ? animation.effect.getKeyframes()
      : []
  return [
    ...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe))),
  ].filter((key) => !keyframeFields.has(key))
}

export type AnimationSnapshot = {
  running: Animation[]
  properties: string[]
  opacity: number
  scale: number
  shiftY: number
}

/**
 * Waits until something animates on the element and returns what it looked
 * like in that same moment. Assert on the snapshot rather than on live values:
 * an assertion is slow enough to let a 150 ms animation finish first.
 */
export const snapshotWhileAnimating = (element: Element, property?: string) =>
  waitFor(
    (): AnimationSnapshot => {
      const running = runningAnimations(element)
      const properties = running.flatMap(animatedProperties)
      if (
        running.length === 0 ||
        (property && !properties.includes(property))
      ) {
        throw new Error(
          `nothing${property ? ` on ${property}` : ''} is animating yet`,
        )
      }
      return {
        running,
        properties,
        opacity: Number(getComputedStyle(element).opacity),
        scale: drawnScale(element),
        shiftY: drawnShiftY(element),
      }
    },
    { interval: 5 },
  )

/**
 * Records whether `element` was still animating at the very moment `target`
 * got the event: the proof that a click or a keystroke did not wait for the
 * animation.
 */
export const recordAnimatingDuring = (
  element: Element,
  target: EventTarget,
  type = 'click',
) => {
  const record = { happened: false, animating: false }
  target.addEventListener(
    type,
    () => {
      record.happened = true
      record.animating ||= runningAnimations(element).length > 0
    },
    { capture: true },
  )
  return record
}
