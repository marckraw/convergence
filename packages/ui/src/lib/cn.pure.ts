import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge, taught the theme's own names (MAR-3615 DS2). It knows
 * Tailwind's scales, not ours: without these, `shadow-raised` reads as a
 * shadow colour and survives beside `shadow-md`, and `duration-fast`,
 * `h-control-sm` or `max-w-conversation` aren't recognised at all, so a later
 * class can't replace them. Each name here is a utility `theme.css` defines;
 * add a name when theme.css gains one.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['3xs', '2xs', 'code'],
      leading: ['3xs', '2xs'],
      tracking: ['eyebrow'],
      shadow: [
        'control',
        'raised',
        'floating',
        'overlay',
        'sheet',
        'sheet-open',
        'halo',
      ],
      spacing: [
        'control-xs',
        'control-sm',
        'control-md',
        'control-lg',
        'control-xl',
      ],
      container: [
        'conversation',
        'dialog',
        'dialog-sm',
        'dialog-md',
        'dialog-xl',
        'dialog-2xl',
        'picker',
      ],
      ease: ['enter', 'exit', 'guide'],
      blur: ['glass', 'scrim'],
    },
    classGroups: {
      duration: [{ duration: ['exit', 'fast', 'panel', 'slow'] }],
      transition: [{ transition: ['layout', 'motion', 'size', 'fill'] }],
      'grid-cols': [
        { 'grid-cols': [(value: string) => /^(?:fill|fit)-\d+$/.test(value)] },
      ],
      w: [{ w: ['side-panel', 'work-panel'] }],
      h: [{ h: ['dialog-tall'] }],
      'max-h': [{ 'max-h': ['dialog', 'dialog-tall', 'picker'] }],
    },
  },
})

/** Joins class names and resolves Tailwind conflicts: the last class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
