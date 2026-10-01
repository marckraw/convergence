/**
 * `@convergence/ui`: the design system's public API (MAR-3610).
 *
 * Apps import from `@convergence/ui` and never from a file inside it; the
 * package's `exports` map has no door for anything else. Every name is
 * re-exported one by one, never with `export *`, so this file is the whole
 * list of what the package promises.
 */
export { Button, type ButtonProps } from './components/button/button'
export { CopyButton } from './components/copy-button/copy-button'
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/dialog/dialog'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/dropdown-menu/dropdown-menu'
export { Input, type InputProps } from './components/input/input'
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './components/popover/popover'
export { SearchableSelect } from './components/searchable-select/searchable-select.container'
export type {
  SearchableSelectAction,
  SearchableSelectItem,
  SearchableSelectProps,
} from './components/searchable-select/searchable-select.presentational'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/select/select'
export { SwitchRow } from './components/switch/switch'
export { Textarea, type TextareaProps } from './components/textarea/textarea'
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/tooltip/tooltip'
export { cn } from './lib/cn.pure'
export { DRAG_REGION_STYLE, NO_DRAG_STYLE } from './lib/no-drag.styles'
export {
  applyTheme,
  readAppliedTheme,
  resolveTheme,
  type AppliedTheme,
  type ThemeChoice,
} from './lib/theme'
export { useAppliedTheme } from './lib/use-applied-theme'
export { durationsMs, easings } from './motion/tokens'
export { layoutPx } from './styles/layout.tokens'
export { terminalTokens } from './styles/terminal.tokens'
