// canary: no-removed-libraries
// A design-system helper reaching for the libraries DS1 to DS5 removed: Radix, cmdk and Motion.
// @convergence/ui is Base UI underneath, its pickers are Combobox and Listbox, and motion is CSS
// on the motion tokens.
import { Root as PopoverRoot } from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { motion } from 'motion/react'
import type { Transition } from 'framer-motion'

export const legacyPopover = { PopoverRoot, Command, motion }
export type LegacyTransition = Transition
