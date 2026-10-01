/**
 * `@convergence/ui`: the design system's public API (MAR-3610).
 *
 * Apps import from `@convergence/ui` and never from a file inside it; the
 * package's `exports` map has no door for anything else. Every name is
 * re-exported one by one, never with `export *`, so this file is the whole
 * list of what the package promises.
 */
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
} from './components/button/button'
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmVariant,
} from './components/confirm-dialog/confirm-dialog'
export {
  type Confirm,
  ConfirmHost,
  type ConfirmHostProps,
  type ConfirmOptions,
  useConfirm,
} from './components/confirm-dialog/confirm-host'
export {
  CopyButton,
  type CopyButtonProps,
} from './components/copy-button/copy-button'
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
} from './components/dialog/dialog.radix'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/dropdown-menu/dropdown-menu'
export {
  FormDialog,
  type FormDialogProps,
  type FormDialogSaves,
} from './components/form-dialog/form-dialog'
export {
  IconButton,
  type IconButtonProps,
} from './components/icon-button/icon-button'
export { Input, type InputProps } from './components/input/input'
export { Kbd, type KbdProps } from './components/kbd/kbd'
export {
  Menu,
  MenuCheckboxItem,
  type MenuCheckboxItemProps,
  MenuContent,
  type MenuContentProps,
  MenuGroup,
  type MenuGroupProps,
  MenuItem,
  type MenuItemProps,
  MenuItemValue,
  type MenuItemValueProps,
  MenuLabel,
  type MenuLabelProps,
  type MenuProps,
  MenuRadioGroup,
  type MenuRadioGroupProps,
  MenuRadioItem,
  type MenuRadioItemProps,
  MenuSeparator,
  type MenuSeparatorProps,
  MenuShortcut,
  type MenuShortcutProps,
  MenuSub,
  MenuSubContent,
  type MenuSubContentProps,
  type MenuSubProps,
  MenuSubTrigger,
  type MenuSubTriggerProps,
  MenuTrigger,
  type MenuTriggerProps,
} from './components/menu/menu'
export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './components/popover/popover.radix'
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
} from './components/select/select.radix'
export {
  Sheet,
  SheetContent,
  type SheetContentProps,
  type SheetProps,
} from './components/sheet/sheet'
export { SwitchRow } from './components/switch/switch'
export { Textarea, type TextareaProps } from './components/textarea/textarea'
export {
  Tooltip,
  type TooltipOptions,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  type TooltipSide,
  tooltipAttributes,
} from './components/tooltip/tooltip'
export {
  TooltipCard,
  type TooltipCardProps,
} from './components/tooltip/tooltip-card'
export { tooltipSurface } from './components/tooltip/tooltip.styles'
export { cn } from './lib/cn.pure'
export {
  focusRing,
  focusRingField,
  focusRingInset,
  focusRingWithin,
} from './lib/focus-ring.styles'
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
export {
  advanceDelayedLoading,
  type DelayedLoading,
  type DelayedLoadingTiming,
  idleLoading,
  isLoadingVisible,
  LOADING_DELAY_MS,
  LOADING_MIN_VISIBLE_MS,
  nextLoadingChange,
} from './motion/delayed-loading/delayed-loading.pure'
export { useDelayedLoading } from './motion/delayed-loading/useDelayedLoading'
export {
  fadeMotion,
  growMotion,
  popupItem,
  popupItemCheck,
  popupLabel,
  popupMotion,
  popupSeparator,
  popupSurface,
} from './motion/popup.styles'
export { press } from './motion/press/press.styles'
export { usePrefersReducedMotion } from './motion/reduced-motion'
export {
  Spinner,
  type SpinnerProps,
  type SpinnerSize,
} from './motion/spinner/spinner'
export { UiProvider, type UiProviderProps } from './ui-provider'
